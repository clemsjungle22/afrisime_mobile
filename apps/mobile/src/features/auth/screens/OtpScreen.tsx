import { formatPhone } from '@afrisime/shared';
import { useMutation } from '@tanstack/react-query';
import { Redirect, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { isApiError } from '@/api/errors';
import { Button, Text } from '@/components/ui';
import { formatCountdown } from '@/lib/dates';
import { getDeviceInfo } from '@/lib/device';
import { showSnackbar } from '@/stores/snackbar';
import { useTheme } from '@/theme';
import { authApi } from '../api';
import { closeAuthFlow } from '../components/AuthHeader';
import { AuthHero } from '../components/AuthHero';
import { OTP_LENGTH, OtpInput } from '../components/OtpInput';
import { otpErrorMessage, useOtpFlow } from '../otpFlow';
import { signIn } from '../session';

/** Codes qui imposent de redemander un code (la saisie est bloquée). */
const LOCKING_CODES = new Set(['OTP_TOO_MANY_ATTEMPTS', 'OTP_EXPIRED']);

function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function OtpScreen() {
  const theme = useTheme();
  const { phone, requestId, expiresAt, resendAt, start } = useOtpFlow();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const now = useNow();

  const verify = useMutation({
    mutationFn: (value: string) =>
      authApi.verifyOtp({ requestId: requestId ?? '', code: value, device: getDeviceInfo() }),
    onSuccess: async (result) => {
      await signIn(result);
      useOtpFlow.getState().reset();
      if (!result.user.profileComplete) {
        router.replace('/profile-setup');
        return;
      }
      closeAuthFlow();
      showSnackbar({ message: result.user.firstName ? `Bon retour, ${result.user.firstName} !` : 'Vous êtes connecté.' });
    },
    onError: (e) => {
      const message = isApiError(e) ? otpErrorMessage(e.code, e.details, e.message) : 'Une erreur est survenue.';
      setError(message);
      setCode('');
      if (isApiError(e) && LOCKING_CODES.has(e.code)) setLocked(true);
      else inputRef.current?.focus();
    },
  });

  const resend = useMutation({
    mutationFn: () => authApi.requestOtp(phone ?? ''),
    onSuccess: (response) => {
      if (phone) start(phone, response);
      setCode('');
      setError(null);
      setLocked(false);
      inputRef.current?.focus();
      showSnackbar({ message: 'Nouveau code envoyé.' });
    },
    onError: (e) => setError(isApiError(e) ? otpErrorMessage(e.code, e.details, e.message) : 'Envoi impossible.'),
  });

  const expired = expiresAt > 0 && now >= expiresAt;
  const blocked = locked || expired;

  // Envoi automatique dès que les 6 chiffres sont saisis (ou collés / suggérés par le clavier).
  const { mutate, isPending } = verify;
  useEffect(() => {
    if (code.length === OTP_LENGTH && !isPending && !blocked) mutate(code);
  }, [code, isPending, blocked, mutate]);

  if (!phone || !requestId) return <Redirect href="/login" />;

  const resendIn = Math.max(0, resendAt - now);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }}>
        <AuthHero title="Code de vérification" subtitle="Un SMS vient de partir vers votre téléphone." />
        <View
          style={{
            flex: 1,
            marginTop: -28,
            borderTopLeftRadius: theme.radius.xl,
            borderTopRightRadius: theme.radius.xl,
            backgroundColor: theme.colors.background,
            padding: theme.spacing.xl,
            gap: theme.spacing.xl,
          }}
        >
        <View style={{ gap: theme.spacing.sm }}>
          <Text color="textMuted">
            Saisissez le code à 6 chiffres envoyé par SMS au{' '}
            <Text variant="bodyStrong">{formatPhone(phone)}</Text>.
          </Text>
          <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={12} style={{ alignSelf: 'flex-start' }}>
            <Text variant="label" color="primary">
              Modifier le numéro
            </Text>
          </Pressable>
        </View>

        <View style={{ gap: theme.spacing.md }}>
          <OtpInput
            ref={inputRef}
            value={code}
            onChange={(v) => {
              setCode(v);
              if (error && !blocked) setError(null);
            }}
            error={error !== null}
            disabled={blocked || verify.isPending}
          />
          {verify.isPending ? (
            <Text variant="caption" color="textMuted" align="center">
              Vérification…
            </Text>
          ) : error ? (
            <Text variant="caption" color="error" align="center" accessibilityLiveRegion="assertive">
              {error}
            </Text>
          ) : expired ? (
            <Text variant="caption" color="error" align="center" accessibilityLiveRegion="assertive">
              Ce code a expiré. Demandez-en un nouveau.
            </Text>
          ) : (
            <Text variant="caption" color="textMuted" align="center">
              Code valable encore {formatCountdown(expiresAt - now).slice(3)}
            </Text>
          )}
        </View>

        {resendIn > 0 && !blocked ? (
          <Text color="textMuted" align="center">
            Vous pourrez demander un nouveau code dans {formatCountdown(resendIn).slice(3)}
          </Text>
        ) : (
          <Button
            label={resendIn > 0 ? `Renvoyer le code (${formatCountdown(resendIn).slice(3)})` : 'Renvoyer le code'}
            variant={blocked ? 'primary' : 'secondary'}
            fullWidth
            loading={resend.isPending}
            disabled={resendIn > 0}
            onPress={() => resend.mutate()}
          />
        )}
        </View>
      </ScrollView>
    </View>
  );
}
