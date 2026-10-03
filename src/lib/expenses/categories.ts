/**
 * Fixed 10 Expense Categories for SplitEase (Phase 4, Decision D18)
 */

export type ExpenseCategoryKey =
  | 'food'
  | 'groceries'
  | 'travel'
  | 'stay'
  | 'fuel'
  | 'shopping'
  | 'bills'
  | 'entertainment'
  | 'rent'
  | 'other';

export interface ExpenseCategory {
  key: ExpenseCategoryKey;
  label: string;
  emoji: string;
}

export const EXPENSE_CATEGORIES: readonly ExpenseCategory[] = [
  { key: 'food', label: 'Food', emoji: '🍽️' },
  { key: 'groceries', label: 'Groceries', emoji: '🛒' },
  { key: 'travel', label: 'Travel', emoji: '🚗' },
  { key: 'stay', label: 'Stay', emoji: '🏨' },
  { key: 'fuel', label: 'Fuel', emoji: '⛽' },
  { key: 'shopping', label: 'Shopping', emoji: '🛍️' },
  { key: 'bills', label: 'Bills', emoji: '💡' },
  { key: 'entertainment', label: 'Entertainment', emoji: '🎬' },
  { key: 'rent', label: 'Rent', emoji: '🏠' },
  { key: 'other', label: 'Other', emoji: '🧾' },
] as const;

export const CATEGORY_MAP: Record<ExpenseCategoryKey, ExpenseCategory> =
  EXPENSE_CATEGORIES.reduce(
    (acc, cat) => {
      acc[cat.key] = cat;
      return acc;
    },
    {} as Record<ExpenseCategoryKey, ExpenseCategory>
  );

export function getCategory(key: string | null | undefined): ExpenseCategory {
  if (!key) return CATEGORY_MAP.other;
  return (CATEGORY_MAP as Record<string, ExpenseCategory>)[key] ?? CATEGORY_MAP.other;
}

export function getCategoryEmoji(key: string | null | undefined): string {
  return getCategory(key).emoji;
}

export function getCategoryLabel(key: string | null | undefined): string {
  return getCategory(key).label;
}

