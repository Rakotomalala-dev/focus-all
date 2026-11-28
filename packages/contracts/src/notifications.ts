import { z } from "zod";
import { hhmmSchema, isoDateTimeSchema, uuidSchema } from "./task";

// RF-50 : un rappel est soit absolu (instant ISO), soit relatif à l'échéance.
// Les décalages proposés par l'interface sont ceux du cahier des charges ; le
// contrat accepte tout décalage positif jusqu'à 14 jours pour ne pas bloquer
// une saisie avancée.
export const REMINDER_OFFSET_PRESETS = [0, 5, 15, 30, 60, 1_440] as const;
export const MAX_REMINDER_OFFSET_MINUTES = 20_160;

export const reminderOffsetSchema = z
  .number()
  .int()
  .min(0)
  .max(MAX_REMINDER_OFFSET_MINUTES);

export type ReminderOffset = z.output<typeof reminderOffsetSchema>;

// RF-51 : un appareil peut recevoir des push et se désactiver indépendamment
// des autres (Android au MVP, Web/Desktop en V1.1).
export const DEVICE_PLATFORMS = ["ANDROID", "IOS", "WEB", "DESKTOP"] as const;
export const devicePlatformSchema = z.enum(DEVICE_PLATFORMS);
export type DevicePlatform = z.output<typeof devicePlatformSchema>;

export const deviceSchema = z.object({
  id: uuidSchema,
  platform: devicePlatformSchema,
  pushToken: z.string().min(1).max(255).nullable(),
  deviceName: z.string().max(80).nullable(),
  notificationsEnabled: z.boolean(),
  lastSeenAt: isoDateTimeSchema,
  createdAt: isoDateTimeSchema,
});

export type Device = z.output<typeof deviceSchema>;

export const deviceListResponseSchema = z.object({
  items: z.array(deviceSchema),
});

export type DeviceListResponse = z.output<typeof deviceListResponseSchema>;

export const registerDeviceSchema = z.object({
  // Le client réutilise son identifiant local pour ne pas accumuler une ligne
  // par démarrage ; absent, le serveur en crée un.
  deviceId: uuidSchema.optional(),
  platform: devicePlatformSchema,
  pushToken: z.string().trim().min(1).max(255).optional(),
  deviceName: z.string().trim().min(1).max(80).optional(),
  notificationsEnabled: z.boolean().default(true),
});

export type RegisterDeviceInput = z.input<typeof registerDeviceSchema>;
export type RegisterDevice = z.output<typeof registerDeviceSchema>;

export const updateDeviceSchema = z.object({
  notificationsEnabled: z.boolean().optional(),
  // `null` retire le jeton (déconnexion, permission refusée).
  pushToken: z.string().trim().min(1).max(255).nullable().optional(),
});

export type UpdateDevice = z.output<typeof updateDeviceSchema>;

// RF-50 : plage silencieuse. `start` > `end` décrit une plage qui traverse
// minuit (22 h → 8 h) ; deux valeurs égales n'ont pas de sens.
export const quietHoursSchema = z
  .object({ start: hhmmSchema, end: hhmmSchema })
  .refine((value) => value.start !== value.end, {
    message: "quietHours.start must differ from quietHours.end",
  });

export type QuietHours = z.output<typeof quietHoursSchema>;

export const notificationPreferencesSchema = z.object({
  // RF-51 : désactivation par catégorie.
  remindersEnabled: z.boolean(),
  dailySummaryEnabled: z.boolean(),
  collaborationEnabled: z.boolean(),
  quietHours: quietHoursSchema.nullable(),
});

export type NotificationPreferences = z.output<typeof notificationPreferencesSchema>;

export const updateNotificationPreferencesSchema = z.object({
  remindersEnabled: z.boolean().optional(),
  dailySummaryEnabled: z.boolean().optional(),
  collaborationEnabled: z.boolean().optional(),
  quietHours: quietHoursSchema.nullable().optional(),
});

export type UpdateNotificationPreferences = z.output<
  typeof updateNotificationPreferencesSchema
>;

// Journal de livraison : une ligne par rappel planifié, ce qui rend le job
// idempotent (un rappel `SENT` n'est jamais réémis) et traçable.
export const REMINDER_STATUSES = ["PENDING", "SENT", "CANCELLED"] as const;
export const reminderStatusSchema = z.enum(REMINDER_STATUSES);
export type ReminderStatus = z.output<typeof reminderStatusSchema>;

export const reminderDeliverySchema = z.object({
  id: uuidSchema,
  taskId: uuidSchema,
  // Instant visé par le rappel, avant plage silencieuse.
  triggerAt: isoDateTimeSchema,
  // Instant effectif d'envoi : décalé à la fin de la plage silencieuse si
  // `triggerAt` tombe dedans.
  scheduledFor: isoDateTimeSchema,
  offsetMinutes: z.number().int().nonnegative().nullable(),
  postponed: z.boolean(),
  status: reminderStatusSchema,
  sentAt: isoDateTimeSchema.nullable(),
});

export type ReminderDelivery = z.output<typeof reminderDeliverySchema>;
