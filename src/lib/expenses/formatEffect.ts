import { formatMoney } from '@/lib/money/format';

export type ExpenseEffectType = 'lent' | 'owe' | 'paid' | 'not_involved';

export interface ExpenseEffectResult {
  text: string;
  type: ExpenseEffectType;
}

/**
 * Computes the user's plain-words financial effect for an expense row or detail view (EL2).
 *
 * Rules:
 * - If you paid and others share it (my_net_minor > 0): "you lent ₹X"
 * - If you paid and you are the only one in the split (my_net_minor === 0): "you paid ₹X"
 * - If someone else paid and you share it (my_share_minor > 0): "you owe ₹X"
 * - If you are not in the split and didn't pay: "not involved"
 */
export function formatExpenseEffect(
  item: {
    paid_by: string;
    amount_minor: number;
    my_share_minor?: number | null;
    my_net_minor?: number | null;
  },
  currentUserId: string
): ExpenseEffectResult {
  const isPayer = item.paid_by.toLowerCase() === currentUserId.toLowerCase();
  const shareMinor = item.my_share_minor ?? 0;
  const netMinor = item.my_net_minor ?? (isPayer ? item.amount_minor - shareMinor : -shareMinor);

  if (isPayer) {
    if (netMinor > 0) {
      return {
        text: `you lent ${formatMoney(netMinor)}`,
        type: 'lent',
      };
    }
    return {
      text: `you paid ${formatMoney(item.amount_minor)}`,
      type: 'paid',
    };
  }

  // Someone else paid
  if (shareMinor > 0) {
    return {
      text: `you owe ${formatMoney(shareMinor)}`,
      type: 'owe',
    };
  }

  return {
    text: 'not involved',
    type: 'not_involved',
  };
}
