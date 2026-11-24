// Tant que l'authentification n'existe pas (M1), il n'y a pas de session : le
// workspace est fixé côté serveur et jamais lu depuis le corps ou les query
// params (N-3). Il sera remplacé par le `workspaceId` de la session.
export const DEV_WORKSPACE_ID = "018f3b3c-1a2b-7c3d-8e4f-0a1b2c3d4e5f";
