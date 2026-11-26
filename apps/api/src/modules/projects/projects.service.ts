import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import {
  projectDraftSchema,
  projectUpdateSchema,
  uuidSchema,
  versionQuerySchema,
  type Project,
  type ProjectListResponse,
} from "@focus/contracts";
import { DomainError } from "../../common/domain-error";
import { describeIssues } from "../../common/zod-issues";
import type { AuthContext } from "../auth/auth-context";
import {
  PROJECT_REPOSITORY,
  type ProjectMutationResult,
  type ProjectPatch,
  type ProjectRepository,
} from "./project.repository";

function parseIfMatch(ifMatch: string | undefined): number | undefined {
  if (ifMatch === undefined) {
    return undefined;
  }
  const match = /^(?:W\/)?"?([0-9]+)"?$/.exec(ifMatch.trim());
  if (match === null) {
    throw new DomainError("request.invalid_field", { field: "If-Match" });
  }
  return Number(match[1]);
}

type VersionSource = "payload" | "if-match";

function resolveExpectedVersion(
  fromPayload: number | undefined,
  ifMatch: string | undefined,
): { readonly version: number; readonly source: VersionSource } {
  if (fromPayload !== undefined) {
    return { version: fromPayload, source: "payload" };
  }
  const fromHeader = parseIfMatch(ifMatch);
  if (fromHeader !== undefined) {
    return { version: fromHeader, source: "if-match" };
  }
  throw new DomainError("request.missing_version");
}

@Injectable()
export class ProjectsService {
  constructor(@Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository) {}

  async create(auth: AuthContext, rawBody: unknown): Promise<Project> {
    const parsed = projectDraftSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(describeIssues(parsed.error.issues));
    }

    const result = await this.projects.create(parsed.data, auth.workspaceId, auth.userId);
    if (result.status === "name_taken") {
      throw new DomainError("project.name_taken");
    }
    return result.project;
  }

  list(auth: AuthContext): Promise<ProjectListResponse> {
    return this.projects.list(auth.workspaceId).then((items) => ({ items: [...items] }));
  }

  async findById(auth: AuthContext, rawId: string): Promise<Project> {
    const project = await this.projects.findById(this.parseId(rawId), auth.workspaceId);
    if (project === undefined) {
      throw new DomainError("project.not_found");
    }
    return project;
  }

  private parseId(rawId: string): string {
    const parsed = uuidSchema.safeParse(rawId);
    if (!parsed.success) {
      throw new DomainError("request.invalid_field", { field: "id" });
    }
    return parsed.data;
  }

  private applyMutation(
    result: ProjectMutationResult,
    source: VersionSource,
  ): Project {
    if (result.status === "not_found") {
      throw new DomainError("project.not_found");
    }
    if (result.status === "name_taken") {
      throw new DomainError("project.name_taken");
    }
    if (result.status === "conflict") {
      const params = { currentVersion: result.currentVersion };
      if (source === "if-match") {
        throw new DomainError("project.version_precondition_failed", params);
      }
      throw new DomainError("project.version_mismatch", params);
    }
    return result.project;
  }

  async update(
    auth: AuthContext,
    rawId: string,
    rawBody: unknown,
    ifMatch: string | undefined,
  ): Promise<Project> {
    const id = this.parseId(rawId);
    const parsed = projectUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(describeIssues(parsed.error.issues));
    }

    const { version, archived, ...fields } = parsed.data;
    const expected = resolveExpectedVersion(version, ifMatch);

    const patch: ProjectPatch = {
      ...(fields.name === undefined ? {} : { name: fields.name }),
      ...(fields.color === undefined ? {} : { color: fields.color }),
      ...(fields.description === undefined ? {} : { description: fields.description }),
      // Archiver est réversible ; la date reste l'unique source de vérité.
      ...(archived === undefined ? {} : { archivedAt: archived ? new Date() : null }),
    };
    if (Object.keys(patch).length === 0) {
      throw new DomainError("request.empty_patch");
    }

    return this.applyMutation(
      await this.projects.update(id, auth.workspaceId, patch, expected.version, auth.userId),
      expected.source,
    );
  }

  async remove(
    auth: AuthContext,
    rawId: string,
    rawQuery: unknown,
    ifMatch: string | undefined,
  ): Promise<void> {
    const id = this.parseId(rawId);
    const parsedQuery = versionQuerySchema.safeParse(rawQuery);
    if (!parsedQuery.success) {
      throw new BadRequestException(describeIssues(parsedQuery.error.issues));
    }

    const expected = resolveExpectedVersion(parsedQuery.data.version, ifMatch);
    this.applyMutation(
      await this.projects.remove(id, auth.workspaceId, expected.version, auth.userId),
      expected.source,
    );
  }
}
