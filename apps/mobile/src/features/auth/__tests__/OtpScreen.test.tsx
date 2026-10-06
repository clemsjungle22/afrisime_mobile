import type { OtpVerifyBody, OtpVerifyResponse } from '@afrisime/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApiError } from '@/api/errors';
import { authApi } from '../api';
import { useOtpFlow } from '../otpFlow';
import { OtpScreen } from '../screens/OtpScreen';
import { signIn } from '../session';

jest.mock('../api', () => ({ authApi: { verifyOtp: jest.fn(), requestOtp: jest.fn() } }));
jest.mock('../session', () => ({ signIn: jest.fn(async () => undefined) }));
jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), back: jest.fn(), canDismiss: jest.fn(() => true), dismissAll: jest.fn() },
  Redirect: () => null,
}));
jest.mock('expo-device', () => ({ modelName: 'Test', osVersion: '14' }));

const verifyMock = authApi.verifyOtp as jest.Mock<Promise<OtpVerifyResponse>, [OtpVerifyBody]>;

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return (
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
}

const input = () => screen.getByLabelText('Code à 6 chiffres reçu par SMS');

beforeEach(() => {
  jest.useFakeTimers();
  verifyMock.mockReset();
  useOtpFlow.getState().start('+22890123456', { requestId: 'otp_1', expiresIn: 300, resendIn: 30 });
});
afterEach(() => jest.useRealTimers());

describe('OtpScreen', () => {
  it('affiche le numéro et envoie automatiquement le code à 6 chiffres', async () => {
    verifyMock.mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r',
      expiresIn: 900,
      isNewUser: false,
      user: {
        id: 'u',
        phone: '+22890123456',
        firstName: 'Ama',
        lastName: 'K',
        email: null,
        customerTypeId: 'particulier',
        segmentLabel: 'Particulier',
        customerTypePending: false,
        agencyId: 'agc',
        consents: { marketing: false, termsVersion: '2026-10' },
        profileComplete: true,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    });
    await render(<OtpScreen />, { wrapper });
    expect(screen.getByText(/90\s12\s34\s56/)).toBeOnTheScreen();

    await fireEvent.changeText(input(), '12 34 56');
    await act(async () => undefined);
    expect(verifyMock).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'otp_1', code: '123456' }));
    expect(signIn).toHaveBeenCalled();
  });

  it('code faux : nombre d’essais restants et saisie vidée', async () => {
    verifyMock.mockRejectedValue(
      new ApiError({ code: 'OTP_INVALID', message: 'Code incorrect.', status: 400, details: { attemptsLeft: 3 } }),
    );
    await render(<OtpScreen />, { wrapper });
    await fireEvent.changeText(input(), '000000');
    expect(await screen.findByText('Code incorrect. Il vous reste 3 essais.')).toBeOnTheScreen();
    expect(input().props.value).toBe('');
  });

  it('trop d’essais : saisie bloquée, renvoi proposé avec compte à rebours', async () => {
    verifyMock.mockRejectedValue(new ApiError({ code: 'OTP_TOO_MANY_ATTEMPTS', message: '', status: 429 }));
    await render(<OtpScreen />, { wrapper });
    await fireEvent.changeText(input(), '000000');
    expect(await screen.findByText('Trop d’essais. Demandez un nouveau code.')).toBeOnTheScreen();
    expect(input().props.editable).toBe(false);
    expect(screen.getByText(/Renvoyer le code \(00:\d\d\)/)).toBeOnTheScreen();

    await act(async () => {
      jest.advanceTimersByTime(31_000);
    });
    expect(screen.getByRole('button', { name: 'Renvoyer le code' })).toBeEnabled();
  });
});
