import { Inject, Injectable, Logger } from "@nestjs/common";
import nodemailer, { type Transporter } from "nodemailer";
import { APP_ENV } from "../../config/app-config.module";
import type { Env } from "../../config/env.schema";

// Port de livraison : le service d'authentification ne dépend pas de SMTP. Les
// tests remplacent cette implémentation par une boîte mémoire, sans réseau.
export const MAILER = Symbol("MAILER");

export type Mailer = {
  readonly sendPasswordReset: (input: {
    readonly to: string;
    readonly link: string;
    readonly expiresMinutes: number;
  }) => Promise<void>;
  readonly sendAccountDeleted: (input: { readonly to: string }) => Promise<void>;
};

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (local === undefined || domain === undefined) {
    return "***";
  }
  return `${local.slice(0, 2)}***@${domain}`;
}

@Injectable()
export class SmtpMailer implements Mailer {
  private readonly logger = new Logger(SmtpMailer.name);
  private readonly transport: Transporter | null;
  private readonly from: string;

  constructor(@Inject(APP_ENV) env: Env) {
    this.from = env.MAIL_FROM;
    this.transport = env.SMTP_URL === undefined ? null : nodemailer.createTransport(env.SMTP_URL);
  }

  private async send(to: string, subject: string, text: string): Promise<void> {
    if (this.transport === null) {
      // Aucun jeton ni lien n'est journalisé : seule l'absence de configuration
      // est signalée (S-5).
      this.logger.warn(`SMTP_URL absent : e-mail « ${subject} » non envoyé à ${maskEmail(to)}`);
      return;
    }

    await this.transport.sendMail({ from: this.from, to, subject, text });
  }

  async sendPasswordReset(input: {
    to: string;
    link: string;
    expiresMinutes: number;
  }): Promise<void> {
    await this.send(
      input.to,
      "Réinitialisez votre mot de passe Focus",
      [
        "Une réinitialisation de mot de passe a été demandée pour votre compte Focus.",
        "",
        `Ouvrez ce lien dans les ${input.expiresMinutes} minutes :`,
        input.link,
        "",
        "Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.",
      ].join("\n"),
    );
  }

  async sendAccountDeleted(input: { to: string }): Promise<void> {
    await this.send(
      input.to,
      "Votre compte Focus a été supprimé",
      [
        "Votre compte Focus a été désactivé immédiatement.",
        "Toutes vos données seront définitivement purgées sous 30 jours.",
        "",
        "Si vous n'êtes pas à l'origine de cette demande, contactez le support.",
      ].join("\n"),
    );
  }
}
