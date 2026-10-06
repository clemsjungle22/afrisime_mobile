import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';
import { isApiError } from '@/api/errors';
import { useTheme } from '@/theme';
import { Button } from './Button';
import { Text } from './Text';

type IconName = ComponentProps<typeof Ionicons>['name'];

type MessageProps = {
  icon: IconName;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
};

function MessageView({ icon, title, description, actionLabel, onAction }: MessageProps) {
  const theme = useTheme();
  return (
    <View style={[styles.container, { padding: theme.spacing.xl, gap: theme.spacing.md }]}>
      <View
        style={[styles.iconCircle, { backgroundColor: theme.colors.primarySoft }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Ionicons name={icon} size={32} color={theme.colors.onPrimarySoft} />
      </View>
      <Text variant="subtitle" align="center" accessibilityRole="header">
        {title}
      </Text>
      {description ? (
        <Text color="textMuted" align="center">
          {description}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} variant="secondary" onPress={onAction} style={styles.action} />
      ) : null}
    </View>
  );
}

/** Message d'erreur compréhensible + « Réessayer ». */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const network = isApiError(error) && error.isNetwork;
  const description = network
    ? 'Connexion instable. Vérifiez votre réseau puis réessayez.'
    : isApiError(error)
      ? error.message
      : 'Une erreur inattendue est survenue.';
  return (
    <MessageView
      icon={network ? 'cloud-offline-outline' : 'alert-circle-outline'}
      title={network ? 'Connexion impossible' : 'Oups, un problème est survenu'}
      description={description}
      actionLabel="Réessayer"
      onAction={onRetry}
    />
  );
}

export function EmptyState(props: MessageProps) {
  return <MessageView {...props} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  action: {
    marginTop: 8,
    minWidth: 180,
  },
});
