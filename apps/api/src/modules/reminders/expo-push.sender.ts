import { Inject, Injectable } from "@nestjs/common";
import { APP_ENV } from "../../config/app-config.module";
import type { Env } from "../../config/env.schema";

export const PUSH_SENDER = "PUSH_SENDER";

export type PushMessage = {
  readonly to: string;
  readonly title: string;
  readonly body: string;
  readonly data?: Record<string, string>;
};

export interface PushSender {
  send(messages: readonly PushMessage[]): Promise<void>;
}

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

// RF-51 : Expo Push au MVP. Aucun SDK n'est ajouté pour un seul POST JSON
// (O8) ; un jeton d'accès optionnel est lu depuis l'environnement et n'est
// jamais journalisé.
@Injectable()
export class ExpoPushSender implements PushSender {
  constructor(@Inject(APP_ENV) private readonly env: Env) {}

  async send(messages: readonly PushMessage[]): Promise<void> {
    if (messages.length === 0) {
      return;
    }
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (this.env.EXPO_ACCESS_TOKEN !== undefined) {
      headers.Authorization = `Bearer ${this.env.EXPO_ACCESS_TOKEN}`;
    }

    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(messages),
    });
    if (!response.ok) {
      // L'échec d'un push ne doit pas annuler la livraison locale : le rappel
      // reste marqué envoyé, et l'erreur est portée par le job serveur.
      throw new Error(`Expo Push a répondu ${response.status}`);
    }
  }
}
