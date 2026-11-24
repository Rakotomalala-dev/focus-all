import type { ErrorCode } from "@focus/contracts";

// Clés d'erreur du domaine : une clé décrit un cas, jamais une phrase. Le client
// traduit (`fr`/`en`) à partir de `messageKey` + `params` ; le serveur ne connaît
// aucune langue (AGENTS §2, doc 04 §3.3). `undefined` = clé sans paramètre.
type DomainErrorParams = {
  readonly "task.not_found": undefined;
  readonly "task.version_mismatch": { readonly currentVersion: number };
  readonly "task.version_precondition_failed": { readonly currentVersion: number };
  readonly "request.invalid_field": { readonly field: string };
  readonly "request.missing_version": undefined;
  readonly "request.empty_patch": undefined;
  readonly "request.invalid_cursor": undefined;
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
  "request.invalid_field": { code: "VALIDATION_FAILED", status: 400 },
  "request.missing_version": { code: "VALIDATION_FAILED", status: 400 },
  "request.empty_patch": { code: "VALIDATION_FAILED", status: 400 },
  "request.invalid_cursor": { code: "VALIDATION_FAILED", status: 400 },
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
