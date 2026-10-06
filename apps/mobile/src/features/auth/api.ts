import {
  AuthTokens,
  OnboardingOptions,
  OtpRequestBody,
  OtpRequestResponse,
  OtpVerifyBody,
  OtpVerifyResponse,
  ProfileUpdateBody,
  RefreshBody,
  UserProfile,
} from '@afrisime/shared';
import { z } from 'zod';
import { request } from '@/api/client';
import { apiConfig } from '@/api/config';
import { mockAuthApi } from '@/api/mock/auth';

export type AuthApi = {
  requestOtp(phone: string): Promise<OtpRequestResponse>;
  verifyOtp(body: OtpVerifyBody): Promise<OtpVerifyResponse>;
  /** Appelé uniquement par la session (jamais par un écran). */
  refresh(refreshToken: string): Promise<AuthTokens>;
  logout(): Promise<void>;
  getMe(signal?: AbortSignal): Promise<UserProfile>;
  updateMe(body: ProfileUpdateBody): Promise<UserProfile>;
  getOnboardingOptions(signal?: AbortSignal): Promise<OnboardingOptions>;
};

const Empty = z.unknown();

const httpAuthApi: AuthApi = {
  requestOtp(phone) {
    return request('/v1/auth/otp/request', {
      method: 'POST',
      body: OtpRequestBody.parse({ phone }),
      schema: OtpRequestResponse,
      auth: false,
    });
  },
  verifyOtp(body) {
    return request('/v1/auth/otp/verify', {
      method: 'POST',
      body: OtpVerifyBody.parse(body),
      schema: OtpVerifyResponse,
      auth: false,
    });
  },
  refresh(refreshToken) {
    return request('/v1/auth/refresh', {
      method: 'POST',
      body: RefreshBody.parse({ refreshToken }),
      schema: AuthTokens,
      auth: false,
    });
  },
  async logout() {
    await request('/v1/auth/logout', { method: 'POST', schema: Empty });
  },
  getMe(signal) {
    return request('/v1/me', { schema: UserProfile, signal });
  },
  updateMe(body) {
    // PATCH idempotent (mêmes champs = même résultat) : réessayable sans risque.
    return request('/v1/me', { method: 'PATCH', body: ProfileUpdateBody.parse(body), schema: UserProfile, safe: true });
  },
  getOnboardingOptions(signal) {
    return request('/v1/onboarding/options', { schema: OnboardingOptions, signal, auth: false });
  },
};

export const authApi: AuthApi = apiConfig.mock ? mockAuthApi : httpAuthApi;
