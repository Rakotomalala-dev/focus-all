// Surface publique de la feature : les réglages montent la section, l'écran de
// tâche utilise les helpers de planification via la couche `data`.
export {
  useNotificationDevices,
  useNotificationPreferences,
  useRegisterPushDevice,
  useSetDeviceNotifications,
  useStoredDevice,
  useUpdateNotificationPreferences,
} from "./api/use-notifications";
export { NotificationsSection } from "./components/NotificationsSection";
