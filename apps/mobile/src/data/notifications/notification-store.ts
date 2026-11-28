import { create } from "zustand";

// Un échec de planification locale ne doit jamais faire échouer une mutation
// confirmée par le serveur, mais il ne doit pas non plus disparaître : il est
// publié ici et affiché dans la section Notifications des réglages.
type NotificationState = {
  readonly schedulingFailed: boolean;
  readonly setSchedulingFailed: (failed: boolean) => void;
};

export const useNotificationStore = create<NotificationState>((set) => ({
  schedulingFailed: false,
  setSchedulingFailed: (schedulingFailed) => {
    set({ schedulingFailed });
  },
}));
