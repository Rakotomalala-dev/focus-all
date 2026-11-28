import type { ErrorCode } from "@focus/contracts";

// Clés d'erreur du domaine : une clé décrit un cas, jamais une phrase. Le client
// traduit (`fr`/`en`) à partir de `messageKey` + `params` ; le serveur ne connaît
// aucune langue (AGENTS §2, doc 04 §3.3). `undefined` = clé sans paramètre.
type DomainErrorParams = {
  readonly "task.not_found": undefined;
  readonly "task.version_mismatch": { readonly currentVersion: number };
  readonly "task.version_precondition_failed": { readonly currentVersion: number };
  readonly "task.tag_not_found": undefined;
  readonly "task.parent_invalid": undefined;
  readonly "task.subtask_limit": undefined;
  readonly "task.subtask_due_date": undefined;
  readonly "task.project_archived": undefined;
  readonly "task.recurrence_invalid": undefined;
  readonly "task.reminder_limit": { readonly max: number };
  readonly "task.reminder_requires_due_date": undefined;
  readonly "notification.device_not_found": undefined;
  readonly "project.not_found": undefined;
  readonly "project.name_taken": undefined;
  readonly "project.archived": undefined;
  readonly "tag.not_found": undefined;
  readonly "tag.name_taken": undefined;
  readonly "tag.limit_reached": undefined;
  readonly "project.version_mismatch": { readonly currentVersion: number };
  readonly "project.version_precondition_failed": { readonly currentVersion: number };
  readonly "request.invalid_field": { readonly field: string };
  readonly "request.missing_version": undefined;
  readonly "request.empty_patch": undefined;
  readonly "request.invalid_cursor": undefined;
  readonly "auth.missing_token": undefined;
  readonly "auth.invalid_token": undefined;
  readonly "auth.session_expired": undefined;
  readonly "auth.invalid_credentials": undefined;
  readonly "auth.invalid_refresh": undefined;
  readonly "auth.session_revoked": undefined;
  readonly "auth.email_taken": undefined;
  readonly "auth.no_workspace": undefined;
  readonly "auth.too_many_attempts": { readonly retryAfterSeconds: number };
  readonly "auth.invalid_reset_token": undefined;
  readonly "auth.session_not_found": undefined;
  readonly "auth.current_password_invalid": undefined;
};

export type DomainErrorKey = keyof DomainErrorParams;

// Statut et code public dérivés de la clé : un même cas ne peut pas sortir en
// 404 ici et en 409 ailleurs, et une clé sans entrée ne compile pas (`Record`
// exhaustif). Les deux clés de conflit partagent `CONFLICT_VERSION` ; seul le
// statut distingue la précondition HTTP du conflit applicatif (RFC 9110 §13.1.1).
const CATALOG: Readonly<
  Record<DomainErrorKey, { readonly code: ErrorCode; readonly status: number }>
> = {
  "task.not_found": { code: "NOT_FOUND", status: 404 },
  "task.version_mismatch": { code: "CONFLICT_VERSION", status: 409 },
  "task.version_precondition_failed": { code: "CONFLICT_VERSION", status: 412 },
  "task.tag_not_found": { code: "VALIDATION_FAILED", status: 400 },
  "task.parent_invalid": { code: "VALIDATION_FAILED", status: 400 },
  "task.subtask_limit": { code: "REQUEST_REJECTED", status: 409 },
  "task.subtask_due_date": { code: "VALIDATION_FAILED", status: 400 },
  "task.project_archived": { code: "REQUEST_REJECTED", status: 409 },
  "task.recurrence_invalid": { code: "VALIDATION_FAILED", status: 400 },
  "task.reminder_limit": { code: "VALIDATION_FAILED", status: 400 },
  "task.reminder_requires_due_date": { code: "VALIDATION_FAILED", status: 400 },
  "notification.device_not_found": { code: "NOT_FOUND", status: 404 },
  "project.not_found": { code: "NOT_FOUND", status: 404 },
  "project.name_taken": { code: "REQUEST_REJECTED", status: 409 },
  "project.archived": { code: "REQUEST_REJECTED", status: 409 },
  "tag.not_found": { code: "NOT_FOUND", status: 404 },
  "tag.name_taken": { code: "REQUEST_REJECTED", status: 409 },
  "tag.limit_reached": { code: "REQUEST_REJECTED", status: 409 },
  "project.version_mismatch": { code: "CONFLICT_VERSION", status: 409 },
  "project.version_precondition_failed": { code: "CONFLICT_VERSION", status: 412 },
  "request.invalid_field": { code: "VALIDATION_FAILED", status: 400 },
  "request.missing_version": { code: "VALIDATION_FAILED", status: 400 },
  "request.empty_patch": { code: "VALIDATION_FAILED", status: 400 },
  "request.invalid_cursor": { code: "VALIDATION_FAILED", status: 400 },
  "auth.missing_token": { code: "UNAUTHENTICATED", status: 401 },
  "auth.invalid_token": { code: "UNAUTHENTICATED", status: 401 },
  "auth.session_expired": { code: "SESSION_EXPIRED", status: 401 },
  "auth.invalid_credentials": { code: "UNAUTHENTICATED", status: 401 },
  "auth.invalid_refresh": { code: "UNAUTHENTICATED", status: 401 },
  "auth.session_revoked": { code: "SESSION_REVOKED", status: 401 },
  "auth.email_taken": { code: "REQUEST_REJECTED", status: 409 },
  "auth.no_workspace": { code: "FORBIDDEN", status: 403 },
  "auth.too_many_attempts": { code: "RATE_LIMITED", status: 429 },
  "auth.invalid_reset_token": { code: "REQUEST_REJECTED", status: 400 },
  "auth.session_not_found": { code: "NOT_FOUND", status: 404 },
  "auth.current_password_invalid": { code: "REQUEST_REJECTED", status: 400 },
};

// Erreur typée du domaine : le service lève, le filtre problem+json traduit en
// HTTP. `message` ne sert qu'aux logs — c'est la clé, jamais un texte affichable.
export class DomainError<K extends DomainErrorKey = DomainErrorKey> extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly messageKey: K;
  readonly params: DomainErrorParams[K] | undefined;

  constructor(messageKey: K, params?: DomainErrorParams[K]) {
    super(messageKey);
    this.name = "DomainError";
    this.messageKey = messageKey;
    const { code, status } = CATALOG[messageKey];
    this.code = code;
    this.status = status;
    this.params = params;
  }
}
