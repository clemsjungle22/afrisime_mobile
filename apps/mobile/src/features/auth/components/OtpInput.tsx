import { forwardRef } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Text } from '@/components/ui';
import { fontFamilies, useTheme } from '@/theme';

export const OTP_LENGTH = 6;

type Props = {
  value: string;
  onChange: (value: string) => void;
  error?: boolean;
  disabled?: boolean;
};

/**
 * Saisie du code : un seul champ invisible au-dessus de 6 cases (copier-coller et
 * suggestion du code SMS par le clavier Android / iOS fonctionnent naturellement).
 */
export const OtpInput = forwardRef<TextInput, Props>(function OtpInput(
  { value, onChange, error = false, disabled = false },
  ref,
) {
  const theme = useTheme();
  const digits = value.split('');

  return (
    <View style={styles.wrap}>
      <View style={[styles.boxes, { gap: theme.spacing.sm }]} importantForAccessibility="no-hide-descendants">
        {Array.from({ length: OTP_LENGTH }, (_, i) => {
          const filled = digits[i] !== undefined;
          const active = !disabled && i === Math.min(digits.length, OTP_LENGTH - 1);
          return (
            <View
              key={i}
              style={[
                styles.box,
                {
                  borderRadius: theme.radius.md,
                  borderColor: error
                    ? theme.colors.error
                    : active
                      ? theme.colors.primary
                      : theme.colors.border,
                  borderWidth: active || error ? 2 : 1,
                  backgroundColor: disabled ? theme.colors.disabled : theme.colors.surface,
                },
              ]}
            >
              <Text variant="title" maxFontSizeMultiplier={1.2}>
                {filled ? digits[i] : ''}
              </Text>
            </View>
          );
        })}
      </View>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, OTP_LENGTH))}
        editable={!disabled}
        keyboardType="number-pad"
        inputMode="numeric"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={OTP_LENGTH}
        autoFocus
        caretHidden
        accessibilityLabel={`Code à ${OTP_LENGTH} chiffres reçu par SMS`}
        accessibilityValue={{ text: value ? `${value.length} chiffre${value.length > 1 ? 's' : ''} saisi${value.length > 1 ? 's' : ''}` : 'vide' }}
        style={[StyleSheet.absoluteFill, styles.hiddenInput, { fontFamily: fontFamilies.regular }]}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'center',
  },
  boxes: {
    flexDirection: 'row',
  },
  box: {
    width: 46,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hiddenInput: {
    // Couvre les cases : un tap n'importe où ouvre le clavier. Texte transparent.
    color: 'transparent',
    opacity: 0.02,
  },
});
