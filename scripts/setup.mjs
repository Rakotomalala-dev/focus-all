#!/usr/bin/env node
// Pre-flight checks for a fresh workstation (`pnpm run setup`).
//
// Two guarantees only: refuse a runtime outside `engines`, and refuse to treat
// a range this script cannot parse as satisfied. Everything else is a warning.
// Human-facing output is French, like the project documentation.
// See docs/03-DOCUMENTATION-TECHNIQUE.md §1.3.2.

import { execFileSync, execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(resolve(projectRoot, "package.json"), "utf8"));

function parseVersion(value) {
  return String(value)
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
}

function compareVersions(left, right) {
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

// A non-zero exit still proves the command exists, which is what callers ask.
export function probeCommand(command, args) {
  try {
    execFileSync(command, args, { stdio: "ignore" });
    return "ok";
  } catch (error) {
    return error?.code === "ENOENT" ? "missing" : "failed";
  }
}

export function detectPnpmVersion() {
  // Set when the script is launched through `pnpm run`: that pnpm is the one
  // that matters, and this avoids spawning another one.
  const fromUserAgent = /(?:^|\s)pnpm\/([0-9][0-9.]*)/.exec(
    process.env.npm_config_user_agent ?? "",
  );
  if (fromUserAgent) {
    return fromUserAgent[1];
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

function detectPnpmPath() {
  const command = process.platform === "win32" ? "where pnpm" : "which pnpm";
  try {
    const output = execSync(command, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return (
      output
        .split(/\r?\n/)
        .find((line) => line.trim() !== "")
        ?.trim() ?? null
    );
  } catch {
    return null;
  }
}

function report(level, message) {
  console.log(`  ${level ? level.padEnd(4) : "    "}  ${message}`);
}

function checkRuntime(version, range, label, fixHint, failures, warnings) {
  const verdict = satisfies(version, range);
  if (verdict === true) {
    report("ok", `${label} ${version} — engines "${range}"`);
    return;
  }
  if (verdict === null) {
    warnings.push(`plage engines de ${label} non vérifiable`);
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

  checkRuntime(
    process.version.replace(/^v/, ""),
    manifest.engines?.node ?? "",
    "Node",
    "nvm use 22 (Windows : nvm install 22.23.5 puis nvm use 22.23.5)",
    failures,
    warnings,
  );

  const pnpmVersion = detectPnpmVersion();
  if (pnpmVersion === null) {
    failures.push("pnpm introuvable");
    report("fail", "pnpm introuvable — Corepack doit l’exposer");
    report("", "corrigez avec : corepack enable");
  } else {
    // `corepack install` applies the `packageManager` version pinned by the repo.
    checkRuntime(
      pnpmVersion,
      manifest.engines?.pnpm ?? "",
      "pnpm",
      "corepack install",
      failures,
      warnings,
    );
    const pnpmPath = detectPnpmPath();
    if (pnpmPath) {
      report("", `binaire résolu : ${pnpmPath}`);
    }
  }

  // Docker is needed for Postgres, Redis, MinIO and MailHog (§2.3), never to code.
  if (probeCommand("docker", ["--version"]) === "missing") {
    warnings.push("Docker absent");
    report("warn", "Docker introuvable — requis pour Postgres, Redis, MinIO et MailHog");
    report("", "installez Docker Desktop (Windows/macOS) ou docker + docker compose (Linux)");
  } else if (probeCommand("docker", ["compose", "version"]) !== "ok") {
    warnings.push("plugin docker compose absent");
    report("warn", "Docker présent, mais `docker compose` indisponible — voir doc 03 §2.3");
  } else {
    report("ok", "Docker et docker compose disponibles");
  }

  console.log("");
  const doc = "Procédure détaillée : docs/03-DOCUMENTATION-TECHNIQUE.md §1.3.2";
  if (failures.length > 0) {
    console.log(`Environnement NON conforme : ${failures.join(" ; ")}.`);
    console.log(`${doc}\n`);
    process.exit(1);
  }
  if (warnings.length > 0) {
    console.log(`Environnement conforme, avec réserve(s) : ${warnings.join(" ; ")}.`);
    console.log(`${doc}\n`);
    return;
  }
  console.log("Environnement conforme — vous pouvez lancer `pnpm install`.\n");
}

const isDirectRun =
  process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isDirectRun) {
  main();
}
