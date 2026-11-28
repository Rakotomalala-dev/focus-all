import { z } from "zod";
import { meResponseSchema } from "./auth";
import { uuidSchema } from "./task";

// RF-71 : l'export est préparé par un job serveur. Le statut est pollable et le
// lien signé n'est exposé qu'une fois le fichier prêt, pour 24 h.
export const EXPORT_JOB_STATUSES = [
  "PENDING",
  "PROCESSING",
  "READY",
  "FAILED",
  "EXPIRED",
] as const;

export const exportJobStatusSchema = z.enum(EXPORT_JOB_STATUSES);
export type ExportJobStatus = z.infer<typeof exportJobStatusSchema>;

export const exportJobSchema = z.object({
  id: uuidSchema,
  status: exportJobStatusSchema,
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  expiresAt: z.string().datetime().nullable(),
  // Chemin relatif à l'API (`/api/v1/...`) : le client le résout avec sa base
  // publique, le serveur n'a pas à connaître l'origine du navigateur.
  downloadUrl: z.string().min(1).nullable(),
});

export type ExportJob = z.output<typeof exportJobSchema>;

// Export complet (RF-71) : profil, espaces, projets, tâches et tags. Aucun
// secret (hash de mot de passe, jeton de session, jeton push) n'y figure.
export const accountExportSchema = z.object({
  exportedAt: z.string().datetime(),
  user: meResponseSchema,
  workspaces: z.array(z.record(z.string(), z.unknown())),
  projects: z.array(z.record(z.string(), z.unknown())),
  tasks: z.array(z.record(z.string(), z.unknown())),
  tags: z.array(z.record(z.string(), z.unknown())),
});

export type AccountExport = z.output<typeof accountExportSchema>;

export const exportDownloadQuerySchema = z.object({
  token: z.string().min(20).max(4096),
});
