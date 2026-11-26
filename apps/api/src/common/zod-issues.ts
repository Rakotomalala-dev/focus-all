type Issue = { readonly path: readonly (string | number)[]; readonly message: string };

// Les erreurs de Zod deviennent un `detail` lisible (diagnostic d'entrée) ; le
// filtre global les transforme en 400 `VALIDATION_FAILED`. Les refus métier,
// eux, passent par `DomainError` : clé i18n, jamais de phrase (AGENTS §2).
export function describeIssues(issues: readonly Issue[]): string[] {
  return issues.map((issue) => {
    const path = issue.path.join(".");
    return `${path.length > 0 ? path : "body"}: ${issue.message}`;
  });
}
