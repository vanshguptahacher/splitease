import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { EXPENSE_CATEGORIES, ExpenseCategory } from '@/lib/expenses/categories';
import { useAppTheme } from '@/lib/theme';

export interface CategoryChipsProps {
  selectedCategory: string | null;
  onSelectCategory: (categoryKey: string | null) => void;
}

export function CategoryChips({
  selectedCategory,
  onSelectCategory,
}: CategoryChipsProps) {
  const theme = useAppTheme();

  const handlePress = (category: ExpenseCategory) => {
    if (selectedCategory === category.key) {
      // Toggle off / deselect
      onSelectCategory(null);
    } else {
      onSelectCategory(category.key);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {EXPENSE_CATEGORIES.map((cat) => {
          const isSelected = selectedCategory === cat.key;
          return (
            <TouchableOpacity
              key={cat.key}
              onPress={() => handlePress(cat)}
              activeOpacity={0.7}
              accessible={true}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`${cat.label} category`}
              style={[
                styles.chip,
                {
                  backgroundColor: isSelected
                    ? theme.colors.primaryContainer
                    : theme.colors.surface,
                  borderColor: isSelected
                    ? theme.colors.primary
                    : theme.colors.outline,
                },
              ]}
            >
              <Text style={styles.emoji}>{cat.emoji}</Text>
              <Text
                style={[
                  styles.label,
                  theme.typography.caption,
                  {
                    color: isSelected
                      ? theme.colors.onPrimaryContainer
                      : theme.colors.text,
                    fontWeight: isSelected ? '700' : '500',
                  },
                ]}
              >
                {cat.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginVertical: 4,
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  emoji: {
    fontSize: 15,
    marginRight: 6,
  },
  label: {
    fontSize: 13,
  },
});
