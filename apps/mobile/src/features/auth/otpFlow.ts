import type { OtpRequestResponse } from '@afrisime/shared';
import { create } from 'zustand';

/**
 * État du parcours « téléphone → code » entre les deux écrans (en mémoire uniquement :
 * ni le numéro ni l'identifiant de demande ne passent dans l'URL ou le stockage).
 */
type OtpFlowState = {
  phone: string | null;
  requestId: string | null;
  /** Horodatages absolus (ms) calculés à la réception de la réponse. */
  expiresAt: number;
  resendAt: number;
  start: (phone: string, response: OtpRequestResponse, now?: number) => void;
  reset: () => void;
};

export const useOtpFlow = create<OtpFlowState>()((set) => ({
  phone: null,
  requestId: null,
  expiresAt: 0,
  resendAt: 0,
  start: (phone, response, now = Date.now()) =>
    set({
      phone,
      requestId: response.requestId,
      expiresAt: now + response.expiresIn * 1000,
      resendAt: now + response.resendIn * 1000,
    }),
  reset: () => set({ phone: null, requestId: null, expiresAt: 0, resendAt: 0 }),
}));

/** Message clair pour chaque erreur métier de l'authentification. */
export function otpErrorMessage(code: string, details: unknown, fallback: string): string {
  switch (code) {
    case 'OTP_INVALID': {
      const left =
        typeof details === 'object' && details !== null && 'attemptsLeft' in details
          ? Number((details as { attemptsLeft: unknown }).attemptsLeft)
          : null;
      return left !== null && Number.isFinite(left)
        ? `Code incorrect. Il vous reste ${left} essai${left > 1 ? 's' : ''}.`
        : 'Code incorrect.';
    }
    case 'OTP_TOO_MANY_ATTEMPTS':
      return 'Trop d’essais. Demandez un nouveau code.';
    case 'OTP_EXPIRED':
      return 'Ce code a expiré. Demandez-en un nouveau.';
    case 'RATE_LIMITED':
      return fallback || 'Trop de demandes. Patientez quelques minutes.';
    case 'NETWORK_ERROR':
    case 'TIMEOUT':
      return 'Connexion instable. Vérifiez votre réseau puis réessayez.';
    default:
      return fallback || 'Une erreur est survenue. Réessayez.';
  }
}
