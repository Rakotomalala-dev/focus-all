#!/usr/bin/env node
// Pre-flight checks for a fresh workstation (run with `pnpm setup`).
//
// Verifies the runtime against `engines`, reports whether pnpm can be resolved
// at all (Corepack and nvm shims can intercept it), and warns when Docker is
// missing. Human-facing output is French, like the project documentation.
// See docs/03-DOCUMENTATION-TECHNIQUE.md §1.3.2.

import { execFileSync, execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(resolve(projectRoot, "package.json"), "utf8"));

export function parseVersion(value) {
  return String(value)
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
}

export function compareVersions(left, right) {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;
    if (leftPart !== rightPart) {
      return leftPart < rightPart ? -1 : 1;
    }
  }
  return 0;
}

// Supports the comparator form used in this repository (`>=22.12 <23`).
// Returns null for any other form, so callers report "non vérifiable" instead
// of silently accepting a range this script does not understand.
export function satisfies(version, range) {
  const match = String(range)
    .trim()
    .match(/^>=\s*([0-9.]+)(?:\s*<\s*([0-9.]+))?$/);
  if (!match) {
    return null;
  }
  const [, minimum, maximum] = match;
  if (compareVersions(version, minimum) < 0) {
    return false;
  }
  if (maximum !== undefined && compareVersions(version, maximum) >= 0) {
    return false;
  }
  return true;
}

export function majorOf(range) {
  const match = String(range).match(/([0-9]+)/);
  return match ? match[1] : null;
}

export function commandExists(command, args = ["--version"]) {
  try {
    execFileSync(command, args, { stdio: "ignore" });
    return true;
  } catch (error) {
    // Only a missing executable means "absent"; a non-zero exit means it exists.
    return error?.code !== "ENOENT";
  }
}

export function commandSucceeds(command, args) {
  try {
    execFileSync(command, args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function detectPnpmVersion() {
  const userAgent = process.env.npm_config_user_agent ?? "";
  const fromAgent = /(?:^|\s)pnpm\/([0-9][0-9.]*)/.exec(userAgent);
  if (fromAgent) {
    return fromAgent[1];
  }
  try {
    // A shell is required so that pnpm.cmd resolves on Windows.
    return execSync("pnpm --version", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      shell: true,
    }).trim();
  } catch {
    return null;
  }
}

export function detectPnpmPath() {
  const command = process.platform === "win32" ? "where pnpm" : "which pnpm";
  try {
    const output = execSync(command, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const first = output.split(/\r?\n/).find((line) => line.trim() !== "");
    return first ? first.trim() : null;
  } catch {
    return null;
  }
}

function report(level, message) {
  console.log(`  ${level.padEnd(4)}  ${message}`);
}

function checkRuntime(version, range, label, fixHint, failures, warnings) {
  const verdict = satisfies(version, range);
  if (verdict === true) {
    report("ok", `${label} ${version} — engines "${range}"`);
    return;
  }
  if (verdict === null) {
    warnings.push(`plage engines.${label} non vérifiable`);
    report("warn", `${label} ${version} — plage "${range}" non reconnue par ce script`);
    return;
  }
  failures.push(`${label} ${version} hors de "${range}"`);
  report("fail", `${label} ${version} — hors de engines "${range}"`);
  report("", `corrigez avec : ${fixHint}`);
}

function main() {
  const failures = [];
  const warnings = [];

  console.log("\nContrôle de l’environnement Focus\n");

  const nodeRange = manifest.engines?.node ?? "";
  checkRuntime(
    process.version.replace(/^v/, ""),
    nodeRange,
    "Node",
    "nvm use 22 (Windows : nvm install 22.23.5 puis nvm use 22.23.5)",
    failures,
    warnings,
  );

  const pnpmRange = manifest.engines?.pnpm ?? "";
  const pnpmVersion = detectPnpmVersion();
  if (pnpmVersion === null) {
    failures.push("pnpm introuvable");
    report("fail", "pnpm introuvable — Corepack doit l’exposer");
    report("", "corrigez avec : corepack enable");
  } else {
    checkRuntime(
      pnpmVersion,
      pnpmRange,
      "pnpm",
      `corepack prepare pnpm@${majorOf(pnpmRange) ?? "9"} --activate`,
      failures,
      warnings,
    );

    const pnpmPath = detectPnpmPath();
    if (pnpmPath) {
      report("", `binaire résolu : ${pnpmPath}`);
      if (failures.length > 0 && /nvm[\\/](\.nodejs|installs)/i.test(pnpmPath)) {
        report(
          "",
          "pnpm passe par un shim nvm : lancez `nvm use` puis `corepack enable` dans le même terminal",
        );
      }
    }
  }

  if (!commandExists("docker")) {
    warnings.push("Docker absent");
    report("warn", "Docker introuvable — requis pour Postgres, Redis, MinIO et MailHog");
    report("", "installez Docker Desktop (Windows/macOS) ou docker + docker compose (Linux)");
  } else if (!commandSucceeds("docker", ["compose", "version"])) {
    warnings.push("plugin docker compose absent");
    report("warn", "Docker présent, mais `docker compose` indisponible — voir doc 03 §2.3");
  } else {
    report("ok", "Docker et docker compose disponibles");
  }

  console.log("");
  if (failures.length > 0) {
    console.log(`Environnement NON conforme : ${failures.join(" ; ")}.`);
    console.log("Procédure détaillée : docs/03-DOCUMENTATION-TECHNIQUE.md §1.3.2\n");
    process.exit(1);
  }
  if (warnings.length > 0) {
    console.log(`Environnement conforme, avec réserve(s) : ${warnings.join(" ; ")}.`);
    console.log("Procédure détaillée : docs/03-DOCUMENTATION-TECHNIQUE.md §1.3.2\n");
    return;
  }
  console.log("Environnement conforme — vous pouvez lancer `pnpm install`.\n");
}

const isDirectRun =
  process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isDirectRun) {
  main();
}
