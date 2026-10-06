import { formatNationalInput, isValidTogoMobile, nationalDigits, toE164, TOGO_DIAL_CODE } from '@afrisime/shared';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { isApiError } from '@/api/errors';
import { Button, Screen, Text } from '@/components/ui';
import { fontFamilies, minTouchSize, useTheme } from '@/theme';
import { authApi } from '../api';
import { AuthHeader } from '../components/AuthHeader';
import { otpErrorMessage, useOtpFlow } from '../otpFlow';

export function PhoneScreen() {
  const theme = useTheme();
  const startFlow = useOtpFlow((s) => s.start);
  const [input, setInput] = useState(() => formatNationalInput(useOtpFlow.getState().phone ?? ''));
  const [touched, setTouched] = useState(false);

  const digits = nationalDigits(input);
  const valid = isValidTogoMobile(digits);
  const showFormatError = touched && digits.length === 8 && !valid;

  const request = useMutation({
    mutationFn: (phone: string) => authApi.requestOtp(phone),
    onSuccess: (response, phone) => {
      startFlow(phone, response);
      router.push('/verify');
    },
  });

  const submit = () => {
    const phone = toE164(digits);
    if (!phone || request.isPending) return;
    request.mutate(phone);
  };

  const error = request.error
    ? isApiError(request.error)
      ? otpErrorMessage(request.error.code, request.error.details, request.error.message)
      : 'Une erreur est survenue. Réessayez.'
    : null;

  return (
    <Screen padded={false}>
      <AuthHeader action="close" />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: theme.spacing.xl, gap: theme.spacing.lg }}
        >
          <View style={{ gap: theme.spacing.sm }}>
            <Text variant="display" accessibilityRole="header">
              Votre numéro
            </Text>
            <Text color="textMuted">
              Connexion ou création de compte : nous vous envoyons un code par SMS. Pas de mot de passe à retenir.
            </Text>
          </View>

          <View style={{ gap: theme.spacing.xs }}>
            <Text variant="label">Numéro de téléphone</Text>
            <View
              style={[
                styles.field,
                {
                  borderRadius: theme.radius.md,
                  borderColor: showFormatError || error ? theme.colors.error : theme.colors.primary,
                  backgroundColor: theme.colors.surface,
                },
              ]}
            >
              <View style={[styles.prefix, { borderRightColor: theme.colors.border, paddingHorizontal: theme.spacing.md }]}>
                <Text variant="bodyStrong">{TOGO_DIAL_CODE}</Text>
              </View>
              <TextInput
                value={input}
                onChangeText={(t) => {
                  setInput(formatNationalInput(t));
                  if (request.isError) request.reset();
                }}
                onBlur={() => setTouched(true)}
                onSubmitEditing={submit}
                placeholder="90 12 34 56"
                placeholderTextColor={theme.colors.onDisabled}
                keyboardType="phone-pad"
                inputMode="tel"
                textContentType="telephoneNumber"
                autoComplete="tel-national"
                autoFocus
                maxLength={11}
                returnKeyType="send"
                accessibilityLabel="Numéro de téléphone, 8 chiffres, indicatif +228"
                style={[styles.input, { color: theme.colors.text, fontFamily: fontFamilies.semibold }]}
              />
            </View>
            {showFormatError ? (
              <Text variant="caption" color="error" accessibilityLiveRegion="polite">
                Ce numéro ne semble pas être un mobile togolais (il commence par 7 ou 9).
              </Text>
            ) : error ? (
              <Text variant="caption" color="error" accessibilityLiveRegion="polite">
                {error}
              </Text>
            ) : null}
          </View>

          <Button label="Recevoir le code" size="lg" fullWidth disabled={!valid} loading={request.isPending} onPress={submit} />

          <Text variant="caption" color="textMuted" align="center">
            Un SMS vous sera envoyé. Des frais de votre opérateur peuvent s’appliquer.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    minHeight: minTouchSize + 8,
    overflow: 'hidden',
  },
  prefix: {
    height: '100%',
    justifyContent: 'center',
    borderRightWidth: 1,
  },
  input: {
    flex: 1,
    fontSize: 20,
    letterSpacing: 1,
    paddingHorizontal: 12,
    minHeight: minTouchSize + 8,
  },
});
