import { ProductSort } from '@afrisime/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, View } from 'react-native';
import { BottomSheet, Text } from '@/components/ui';
import { minTouchSize, useTheme } from '@/theme';
import { sortLabels } from '../filters';

type Props = {
  visible: boolean;
  value: ProductSort;
  /** La pertinence n'a de sens qu'avec une recherche texte. */
  allowRelevance: boolean;
  onSelect: (sort: ProductSort) => void;
  onClose: () => void;
};

export function SortSheet({ visible, value, allowRelevance, onSelect, onClose }: Props) {
  const theme = useTheme();
  const options = ProductSort.options.filter((o) => allowRelevance || o !== 'relevance');
  return (
    <BottomSheet visible={visible} title="Trier par" onClose={onClose}>
      <View accessibilityRole="radiogroup" style={{ paddingVertical: theme.spacing.sm }}>
        {options.map((o) => {
          const selected = o === value;
          return (
            <Pressable
              key={o}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => {
                onSelect(o);
                onClose();
              }}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                minHeight: minTouchSize + 4,
                paddingHorizontal: theme.spacing.lg,
                backgroundColor: pressed ? theme.colors.surfaceAlt : 'transparent',
              })}
            >
              <Text variant={selected ? 'bodyStrong' : 'body'} color={selected ? 'primary' : 'text'}>
                {sortLabels[o]}
              </Text>
              {selected ? <Ionicons name="checkmark" size={22} color={theme.colors.primary} /> : null}
            </Pressable>
          );
        })}
      </View>
    </BottomSheet>
  );
}
