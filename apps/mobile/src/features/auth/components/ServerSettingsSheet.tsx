import { useState } from 'react';
import { View } from 'react-native';
import { apiConfig, saveServerOverride, serverOverride } from '@/api/config';
import { BottomSheet, Button, RadioGroup, Text, TextField } from '@/components/ui';
import { useTheme } from '@/theme';

/**
 * Réglage caché (appui long sur « Votre numéro ») : serveur à joindre ou mode démo, sans réinstaller
 * l'app. Utile en présentation (adresse du tunnel, réseau défaillant). Pris en compte au redémarrage.
 */
export function ServerSettingsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const theme = useTheme();
  const [mode, setMode] = useState<'server' | 'demo'>(apiConfig.mock ? 'demo' : 'server');
  const [url, setUrl] = useState(serverOverride?.mode === 'server' ? serverOverride.url : apiConfig.baseUrl);
  const [saved, setSaved] = useState(false);
  const validUrl = /^https?:\/\/[^\s/]+/.test(url.trim());

  const save = () => {
    saveServerOverride(mode === 'demo' ? { mode: 'demo' } : { mode: 'server', url: url.trim() });
    setSaved(true);
  };
  const reset = () => {
    saveServerOverride(null);
    setSaved(true);
  };

  return (
    <BottomSheet
      visible={visible}
      title="Réglages de connexion"
      onClose={() => {
        setSaved(false);
        onClose();
      }}
      footer={
        saved ? null : (
          <Button label="Enregistrer" size="lg" fullWidth disabled={mode === 'server' && !validUrl} onPress={save} />
        )
      }
    >
      {saved ? (
        <View style={{ gap: theme.spacing.md }}>
          <Text variant="subtitle">Réglage enregistré</Text>
          <Text>Fermez complètement l’application (depuis la liste des applications récentes), puis rouvrez-la.</Text>
        </View>
      ) : (
        <View style={{ gap: theme.spacing.lg }}>
          <Text color="textMuted">
            Actuellement : {apiConfig.mock ? 'mode démo' : apiConfig.baseUrl || 'aucun serveur'}
            {serverOverride ? ' (réglé sur ce téléphone)' : ''}.
          </Text>
          <RadioGroup
            items={[
              { id: 'server', title: 'Serveur AfriSime', subtitle: 'Vos commandes arrivent au back-office.' },
              { id: 'demo', title: 'Mode démo', subtitle: 'Sans internet ni serveur : données d’exemple sur ce téléphone.' },
            ]}
            value={mode}
            onChange={(id) => setMode(id as 'server' | 'demo')}
          />
          {mode === 'server' ? (
            <TextField
              label="Adresse du serveur"
              value={url}
              onChangeText={setUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="https://…"
              error={url.trim() && !validUrl ? 'Adresse invalide (commence par https://)' : undefined}
            />
          ) : null}
          {serverOverride ? <Button label="Revenir au réglage d’origine" variant="ghost" onPress={reset} /> : null}
        </View>
      )}
    </BottomSheet>
  );
}
