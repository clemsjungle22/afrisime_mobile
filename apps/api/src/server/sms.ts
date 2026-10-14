import { env } from './env';
import { log } from './log';

/** Envoi de SMS derrière une interface : le fournisseur réel se branchera ici sans toucher au reste. */
export interface SmsSender {
  send(to: string, text: string): Promise<void>;
}

/** Développement : le message s'affiche dans le terminal du serveur, rien n'est envoyé. */
const consoleSender: SmsSender = {
  async send(to, text) {
    console.warn(`\n📱 SMS (simulé) pour ${to} : ${text}\n`);
  },
};

/** Production : aucun fournisseur branché. Les SMS ne partent pas, un avertissement est loggé. */
const disabledSender: SmsSender = {
  async send(to) {
    log.warn('SMS non envoyé : aucun fournisseur configuré (SMS_PROVIDER=disabled)', { to });
  },
};

let override: SmsSender | null = null;

/** Tests : capture les SMS au lieu de les afficher. */
export function setSmsSender(sender: SmsSender | null) {
  override = sender;
}

export function smsSender(): SmsSender {
  if (override) return override;
  switch (env().SMS_PROVIDER) {
    case 'console':
      return consoleSender;
    case 'disabled':
      return disabledSender;
  }
}

export function otpMessage(code: string): string {
  log.debug('SMS de connexion préparé'); // le code n'est jamais journalisé
  return `AfriSime : votre code de connexion est ${code}. Il expire dans 5 minutes. Ne le partagez avec personne.`;
}