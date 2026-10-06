import { zodResolver } from '@hookform/resolvers/zod';
import type { OnboardingOptions, UserProfile } from '@afrisime/shared';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { z } from 'zod';
import { isApiError } from '@/api/errors';
import { Button, Checkbox, ErrorState, RadioGroup, Screen, Skeleton, Text, TextField } from '@/components/ui';
import { showSnackbar } from '@/stores/snackbar';
import { useTheme } from '@/theme';
import { AuthHeader, closeAuthFlow } from '../components/AuthHeader';
import { useMe, useOnboardingOptions, useUpdateProfile } from '../hooks';

const ProfileForm = z.object({
  firstName: z.string().trim().min(1, 'Indiquez votre prénom').max(60),
  lastName: z.string().trim().min(1, 'Indiquez votre nom').max(60),
  email: z.union([z.literal(''), z.string().trim().email('Adresse e-mail invalide')]),
  customerTypeId: z.string().min(1, 'Choisissez votre profil'),
  agencyId: z.string().min(1, 'Choisissez une agence'),
  acceptTerms: z.boolean().refine((v) => v, 'Acceptez les conditions pour continuer'),
  marketing: z.boolean(),
});
type ProfileForm = z.infer<typeof ProfileForm>;

export function ProfileSetupScreen() {
  const theme = useTheme();
  const options = useOnboardingOptions();
  const me = useMe();

  return (
    <Screen padded={false}>
      <AuthHeader
        action="close"
        onPress={() => {
          closeAuthFlow();
          showSnackbar({ message: 'Vous pourrez compléter votre profil depuis l’onglet Compte.' });
        }}
      />
      {options.data && me.data ? (
        <ProfileFormView options={options.data} user={me.data} />
      ) : options.isError || me.isError ? (
        <ErrorState
          error={options.error ?? me.error}
          onRetry={() => {
            void options.refetch();
            void me.refetch();
          }}
        />
      ) : (
        <View style={{ padding: theme.spacing.xl, gap: theme.spacing.lg }} accessibilityLabel="Chargement">
          <Skeleton width="70%" height={28} />
          <Skeleton height={52} />
          <Skeleton height={52} />
          <Skeleton height={120} />
        </View>
      )}
    </Screen>
  );
}

function ProfileFormView({ options, user }: { options: OnboardingOptions; user: UserProfile }) {
  const theme = useTheme();
  const update = useUpdateProfile();
  const defaultAgency = options.agencies.find((a) => a.isDefault)?.id ?? '';

  const { control, handleSubmit, formState } = useForm<ProfileForm>({
    resolver: zodResolver(ProfileForm),
    defaultValues: {
      firstName: user.firstName ?? '',
      lastName: user.lastName ?? '',
      email: user.email ?? '',
      customerTypeId: user.customerTypeId ?? '',
      agencyId: user.agencyId ?? defaultAgency,
      acceptTerms: user.consents.termsVersion === options.termsVersion,
      marketing: user.consents.marketing,
    },
  });
  const errors = formState.errors;

  const onSubmit = handleSubmit((values) => {
    update.mutate(
      {
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email === '' ? null : values.email,
        customerTypeId: values.customerTypeId,
        agencyId: values.agencyId,
        consents: { marketing: values.marketing, termsVersion: options.termsVersion },
      },
      {
        onSuccess: (saved) => {
          closeAuthFlow();
          showSnackbar({
            message: saved.customerTypePending
              ? `Bienvenue ${saved.firstName ?? ''} ! Votre profil professionnel sera validé par AfriSime.`
              : `Bienvenue ${saved.firstName ?? ''} !`,
          });
        },
      },
    );
  });

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: theme.spacing.xl, gap: theme.spacing.xl }}>
        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="display" accessibilityRole="header">
            Votre profil
          </Text>
          <Text color="textMuted">Quelques informations pour vous proposer les bons prix et la bonne agence.</Text>
        </View>

        <View style={{ gap: theme.spacing.lg }}>
          <Controller
            control={control}
            name="firstName"
            render={({ field }) => (
              <TextField
                label="Prénom"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={errors.firstName?.message}
                autoComplete="given-name"
                textContentType="givenName"
                autoCapitalize="words"
                returnKeyType="next"
              />
            )}
          />
          <Controller
            control={control}
            name="lastName"
            render={({ field }) => (
              <TextField
                label="Nom"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={errors.lastName?.message}
                autoComplete="family-name"
                textContentType="familyName"
                autoCapitalize="words"
                returnKeyType="next"
              />
            )}
          />
          <Controller
            control={control}
            name="email"
            render={({ field }) => (
              <TextField
                label="E-mail (facultatif)"
                hint="Pour recevoir vos reçus et factures."
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={errors.email?.message}
                keyboardType="email-address"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect={false}
              />
            )}
          />
        </View>

        <Controller
          control={control}
          name="customerTypeId"
          render={({ field }) => (
            <RadioGroup
              title="Vous êtes"
              error={errors.customerTypeId?.message}
              value={field.value}
              onChange={field.onChange}
              items={options.customerTypes.map((t) => ({
                id: t.id,
                title: t.label,
                subtitle: t.description,
                badge: t.requiresReview ? 'Validation AfriSime' : null,
              }))}
            />
          )}
        />

        <Controller
          control={control}
          name="agencyId"
          render={({ field }) => (
            <RadioGroup
              title="Votre agence de référence"
              error={errors.agencyId?.message}
              value={field.value}
              onChange={field.onChange}
              items={options.agencies.map((a) => ({
                id: a.id,
                title: a.name,
                subtitle: [a.address, a.openingHours].filter(Boolean).join(' · '),
                badge: null,
              }))}
            />
          )}
        />

        <View style={{ gap: theme.spacing.sm }}>
          <Controller
            control={control}
            name="acceptTerms"
            render={({ field }) => (
              <Checkbox
                checked={field.value}
                onChange={field.onChange}
                error={errors.acceptTerms?.message}
                accessibilityLabel="J'accepte les conditions générales et la politique de confidentialité"
              >
                <Text>
                  J’accepte les{' '}
                  <Text color="primary" variant="bodyStrong" accessibilityRole="link" onPress={() => void Linking.openURL(options.termsUrl)}>
                    conditions générales
                  </Text>{' '}
                  et la{' '}
                  <Text color="primary" variant="bodyStrong" accessibilityRole="link" onPress={() => void Linking.openURL(options.privacyUrl)}>
                    politique de confidentialité
                  </Text>
                  .
                </Text>
              </Checkbox>
            )}
          />
          <Controller
            control={control}
            name="marketing"
            render={({ field }) => (
              <Checkbox
                checked={field.value}
                onChange={field.onChange}
                accessibilityLabel="Recevoir les offres et promotions AfriSime"
              >
                <Text>Recevoir les offres et promotions AfriSime (modifiable à tout moment).</Text>
              </Checkbox>
            )}
          />
        </View>

        {update.isError ? (
          <Text color="error" accessibilityLiveRegion="assertive">
            {isApiError(update.error) && !update.error.isNetwork
              ? update.error.message
              : 'Enregistrement impossible. Vérifiez votre connexion puis réessayez.'}
          </Text>
        ) : null}

        <Button label="Enregistrer et continuer" size="lg" fullWidth loading={update.isPending} onPress={() => void onSubmit()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
