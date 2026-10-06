import {
  AuthTokens,
  OnboardingOptions,
  OtpRequestResponse,
  OtpVerifyResponse,
  UserProfile,
} from '@afrisime/shared';
import { z } from 'zod';
import type { AuthApi } from '@/features/auth/api';
import { withAuth, withRetry } from '../client';
import * as server from './authServer';
import { mockOnboardingOptions } from './data/onboarding';
import { simulate } from './simulate';

/** Écriture non idempotente : pas de nouvelle tentative automatique (comme en HTTP). */
const once = <T>(run: () => Promise<T>) => withRetry(run, { canRetry: false });
const read = <T>(run: () => Promise<T>, signal?: AbortSignal) => withRetry(run, { canRetry: true, signal });

export const mockAuthApi: AuthApi = {
  requestOtp(phone) {
    return once(() => simulate(OtpRequestResponse, () => server.requestOtp(phone)));
  },
  verifyOtp(body) {
    return once(() => simulate(OtpVerifyResponse, () => server.verifyOtp(body)));
  },
  refresh(refreshToken) {
    return once(() => simulate(AuthTokens, () => server.refreshSession(refreshToken)));
  },
  async logout() {
    await once(() =>
      withAuth((token) =>
        simulate(z.unknown(), async () => {
          const user = await server.requireUser(token);
          await server.logout(user.id);
          return null;
        }),
      ),
    );
  },
  getMe(signal) {
    return read(() => withAuth((token) => simulate(UserProfile, () => server.requireUser(token))), signal);
  },
  updateMe(body) {
    return read(() =>
      withAuth((token) =>
        simulate(UserProfile, async () => server.updateProfile(await server.requireUser(token), body)),
      ),
    );
  },
  getOnboardingOptions(signal) {
    return read(() => simulate(OnboardingOptions, () => mockOnboardingOptions), signal);
  },
};
