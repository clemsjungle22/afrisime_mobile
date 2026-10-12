import Ionicons from '@expo/vector-icons/Ionicons';
import {
  KYC_DOC_LABELS,
  KYC_PHOTO_LABELS,
  KYC_STATUS_LABELS,
  type KycDocType,
  type KycPhoto,
  type KycState,
  formatFCFA,
  kycPhotosFor,
} from '@afrisime/shared';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Alert, RefreshControl, ScrollView, View } from 'react-native';
import { isApiError } from '@/api/errors';
import { Badge, type BadgeTone, Button, ErrorState, PressableScale, RadioGroup, Skeleton, Text, TextField } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import { useRefetchOnFocus } from '@/lib/useRefetchOnFocus';
import { showSnackbar } from '@/stores/snackbar';
import { useTheme } from '@/theme';
import type { KycPhotoFile } from '../api';
import { useKyc, useSubmitKyc } from '../hooks';

const TONES: Record<KycState['status'], BadgeTone> = { none: 'neutral', pending: 'info', verified: 'success', rejected: 'error' };
const DOCS: KycDocType[] = ['cni', 'passport', 'voter_card', 'driving_licence'];
const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', timeZone: 'Africa/Lome' });

/** Mon identité : plafond d'achats sans vérification, et envoi de la pièce et du selfie. */
export function KycScreen() {
  const theme = useTheme();
  const kyc = useKyc();
  useRefetchOnFocus(kyc.refetch);

  if (kyc.isPending) return <Skeleton height={160} />;
  if (kyc.isError) return <ErrorState error={kyc.error} onRetry={() => void kyc.refetch()} />;
  const k = kyc.data;
  const canSend = k.status === 'none' || k.status === 'rejected';

  return (
    <ScrollView
      contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg, paddingBottom: theme.spacing.xxl }}
      refreshControl={<RefreshControl refreshing={kyc.isRefetching} onRefresh={() => void kyc.refetch()} colors={[theme.colors.primary]} tintColor={theme.colors.primary} />}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ gap: theme.spacing.sm, padding: theme.spacing.lg, borderRadius: theme.radius.xl, backgroundColor: theme.colors.surface, boxShadow: theme.shadows.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <Ionicons name="id-card-outline" size={24} color={theme.colors.primary} />
          <Badge label={KYC_STATUS_LABELS[k.status]} tone={TONES[k.status]} />
        </View>
        {k.status === 'verified' ? (
          <Text>Votre identité est vérifiée : vous pouvez commander sans plafond.</Text>
        ) : k.threshold > 0 ? (
          <Text>
            Au-delà de <Text variant="bodyStrong">{formatFCFA(k.threshold)}</Text> d’achats sur 30 jours, nous devons vérifier votre identité
            (règle de sécurité). Achats des 30 derniers jours : <Text variant="bodyStrong">{formatFCFA(k.spent30d)}</Text>.
          </Text>
        ) : (
          <Text>Aucune vérification n’est demandée pour le moment.</Text>
        )}
        {k.status === 'pending' ? (
          <Text color="info">
            Dossier envoyé{k.submittedAt ? ` le ${dateFmt.format(new Date(k.submittedAt))}` : ''} : votre agence le vérifie. Vous serez
            prévenu dans l’app.
          </Text>
        ) : null}
        {k.status === 'rejected' ? (
          <Text color="error">Votre dernier dossier n’a pas été accepté{k.reason ? ` : ${k.reason}` : '.'} Vous pouvez en envoyer un nouveau.</Text>
        ) : null}
      </View>
      {canSend ? <KycForm /> : null}
    </ScrollView>
  );
}

function KycForm() {
  const theme = useTheme();
  const submit = useSubmitKyc();
  const [docType, setDocType] = useState<KycDocType>('cni');
  const [docNumber, setDocNumber] = useState('');
  const [photos, setPhotos] = useState<Partial<Record<KycPhoto, KycPhotoFile>>>({});
  const needed = kycPhotosFor(docType);
  const ready = docNumber.trim().length >= 4 && needed.every((p) => photos[p]);

  const pick = async (kind: KycPhoto, source: 'camera' | 'library') => {
    const permission =
      source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Autorisation nécessaire', source === 'camera' ? 'Autorisez l’appareil photo dans les réglages du téléphone.' : 'Autorisez l’accès aux photos dans les réglages du téléphone.');
      return;
    }
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      quality: 0.7,
      cameraType: kind === 'selfie' ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
    };
    const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    const asset = result.canceled ? null : result.assets[0];
    if (asset) setPhotos((p) => ({ ...p, [kind]: { uri: asset.uri, mimeType: asset.mimeType } }));
  };

  const choose = (kind: KycPhoto) =>
    Alert.alert(KYC_PHOTO_LABELS[kind], 'D’où vient la photo ?', [
      { text: 'Prendre une photo', onPress: () => void pick(kind, 'camera') },
      { text: 'Choisir dans la galerie', onPress: () => void pick(kind, 'library') },
      { text: 'Annuler', style: 'cancel' },
    ]);

  const send = () =>
    submit.mutate(
      { docType, docNumber, photos: Object.fromEntries(needed.map((p) => [p, photos[p]])) },
      {
        onSuccess: () => {
          haptics.success();
          showSnackbar({ message: 'Dossier envoyé : votre agence le vérifie.' });
        },
        onError: (e) => showSnackbar({ message: isApiError(e) && !e.isNetwork ? e.message : 'Envoi impossible. Vérifiez votre connexion et réessayez.' }),
      },
    );

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <Text variant="subtitle">Vérifier mon identité</Text>
      <RadioGroup
        title="Pièce d’identité"
        items={DOCS.map((id) => ({ id, title: KYC_DOC_LABELS[id] }))}
        value={docType}
        onChange={(id) => setDocType(id as KycDocType)}
      />
      <TextField label="Numéro de la pièce" value={docNumber} onChangeText={setDocNumber} autoCapitalize="characters" maxLength={40} />
      <View style={{ gap: theme.spacing.sm }}>
        <Text variant="label">Photos</Text>
        <Text variant="caption" color="textMuted">
          Photo nette, bien éclairée, pièce entière et lisible. Le selfie montre votre visage de face.
        </Text>
        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          {needed.map((kind) => (
            <PressableScale
              key={kind}
              accessibilityRole="button"
              accessibilityLabel={`${KYC_PHOTO_LABELS[kind]}${photos[kind] ? ', ajoutée' : ''}`}
              onPress={() => choose(kind)}
              style={{
                flex: 1,
                aspectRatio: 0.8,
                borderRadius: theme.radius.lg,
                borderWidth: 1.5,
                borderStyle: photos[kind] ? 'solid' : 'dashed',
                borderColor: photos[kind] ? theme.colors.primary : theme.colors.border,
                backgroundColor: theme.colors.surface,
                overflow: 'hidden',
                alignItems: 'center',
                justifyContent: 'center',
                gap: theme.spacing.xs,
              }}
            >
              {photos[kind] ? (
                <Image source={{ uri: photos[kind]!.uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
              ) : (
                <>
                  <Ionicons name={kind === 'selfie' ? 'person-circle-outline' : 'camera-outline'} size={28} color={theme.colors.textMuted} />
                  <Text variant="caption" color="textMuted" align="center">
                    {KYC_PHOTO_LABELS[kind]}
                  </Text>
                </>
              )}
            </PressableScale>
          ))}
        </View>
      </View>
      <Button label="Envoyer mon dossier" size="lg" fullWidth disabled={!ready} loading={submit.isPending} onPress={send} />
      <Text variant="caption" color="textMuted" align="center">
        Vos photos servent uniquement à vérifier votre identité. Seule l’équipe AfriSime y a accès.
      </Text>
    </View>
  );
}
