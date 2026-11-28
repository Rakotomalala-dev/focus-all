import { z } from "zod";

// RF-72 : télémétrie produit opt-in. La liste fermée évite qu'un client
// transforme l'endpoint en journal applicatif arbitraire ; les propriétés sont
// des scalaires courts et ne doivent contenir aucun identifiant personnel.
export const TELEMETRY_EVENTS = [
  "app_open",
  "task_created",
  "task_completed",
  "search_used",
  "offline_mode_used",
  "export_requested",
] as const;

export const telemetryEventNameSchema = z.enum(TELEMETRY_EVENTS);
export type TelemetryEventName = z.infer<typeof telemetryEventNameSchema>;

export const telemetryPropertyValueSchema = z.union([
  z.string().max(200),
  z.number().finite(),
  z.boolean(),
]);

export const telemetryEventSchema = z.object({
  name: telemetryEventNameSchema,
  properties: z
    .record(z.string().min(1).max(40), telemetryPropertyValueSchema)
    .refine((value) => Object.keys(value).length <= 10, {
      message: "Dix propriétés au maximum.",
    })
    .optional(),
});

export type TelemetryEvent = z.output<typeof telemetryEventSchema>;
