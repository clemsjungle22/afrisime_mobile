import { View } from 'react-native';
import { Screen, Text } from '@/components/ui';
import { useTheme } from '@/theme';

type Props = {
  title: string;
  description: string;
};

/** Écran provisoire, remplacé au fil des user stories. */
export function PlaceholderScreen({ title, description }: Props) {
  const theme = useTheme();
  return (
    <Screen>
      <Text variant="display" accessibilityRole="header">
        {title}
      </Text>
      <View style={{ flex: 1, justifyContent: 'center', gap: theme.spacing.sm }}>
        <Text variant="subtitle" align="center">
          Bientôt disponible
        </Text>
        <Text color="textMuted" align="center">
          {description}
        </Text>
      </View>
    </Screen>
  );
}
