import { ActivityListItem } from '@/lib/api/expenses';
import { formatMoney } from '@/lib/money/format';

/**
 * Formats paise into compact INR string:
 * Drops trailing '.00' so 120000 -> "₹1,200", while keeping decimals if present (e.g. "₹1,200.50").
 */
export function formatMoneyCompact(amountMinor: number): string {
  const formatted = formatMoney(amountMinor);
  return formatted.endsWith('.00') ? formatted.slice(0, -3) : formatted;
}

/**
 * Returns human-friendly relative time string:
 * "Just now", "5m ago", "2h ago", "Yesterday", "3d ago", "2w ago"
 */
export function formatTimeAgo(isoString: string, now: Date = new Date()): string {
  const date = new Date(isoString);
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 4) return `${diffWeeks}w ago`;

  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export type ActivityActionType = 'added' | 'edited' | 'deleted' | 'restored' | 'other';

export interface FormattedActivity {
  sentence: string;
  actor: string;
  actionType: ActivityActionType;
  description: string;
  amountText: string;
  groupName: string;
  timeAgo: string;
  iconName: string;
  iconColorType: 'success' | 'primary' | 'danger' | 'warning' | 'muted';
}

/**
 * Formats an activity item per EV2, EV3, EV4, EV5 requirements:
 * - EV4: "You" for user's own actions
 * - EV5: "Deleted user" for deleted profiles
 * - EV3: Edit entries show amount change ("Rahul changed 'Dinner' ₹1,200 → ₹1,500")
 * - EV2: "Rahul added 'Dinner' ₹1,200 · Goa Trip · 2h ago"
 */
export function formatActivitySentence(
  item: Pick<ActivityListItem, 'actor_id' | 'actor_name' | 'action' | 'details' | 'created_at'> & {
    group_name?: string;
  },
  currentUserId: string,
  now?: Date
): FormattedActivity {
  // Actor resolution (EV4, EV5)
  const isSelf = !!currentUserId && item.actor_id === currentUserId;
  const actor = isSelf
    ? 'You'
    : item.actor_name && item.actor_name.trim() !== ''
    ? item.actor_name
    : 'Deleted user';

  const groupName = item.group_name || 'Group';
  const timeAgo = formatTimeAgo(item.created_at, now);

  const details = item.details || {};
  const rawDesc = typeof details.description === 'string' && details.description.trim() !== ''
    ? details.description.trim()
    : 'Expense';
  const description = `'${rawDesc}'`;

  const amountMinor = typeof details.amount_minor === 'number' ? details.amount_minor : null;
  const oldAmountMinor = typeof details.old_amount_minor === 'number' ? details.old_amount_minor : null;

  const amountText = amountMinor !== null ? formatMoneyCompact(amountMinor) : '';
  const oldAmountText = oldAmountMinor !== null ? formatMoneyCompact(oldAmountMinor) : '';

  const action = (item.action || '').toLowerCase();

  // 1. Added
  if (action === 'expense_added' || action.includes('added')) {
    const parts = [
      `${actor} added ${description}${amountText ? ` ${amountText}` : ''}`,
      groupName,
      timeAgo,
    ];
    return {
      sentence: parts.join(' · '),
      actor,
      actionType: 'added',
      description,
      amountText,
      groupName,
      timeAgo,
      iconName: 'add-circle',
      iconColorType: 'success',
    };
  }

  // 2. Edited (EV3)
  if (action === 'expense_edited' || action.includes('edited') || action.includes('changed')) {
    let actionClause: string;
    if (oldAmountText && amountText && oldAmountText !== amountText) {
      actionClause = `${actor} changed ${description} ${oldAmountText} → ${amountText}`;
    } else if (amountText) {
      actionClause = `${actor} changed ${description} ${amountText}`;
    } else {
      actionClause = `${actor} edited ${description}`;
    }

    const parts = [actionClause, groupName, timeAgo];
    return {
      sentence: parts.join(' · '),
      actor,
      actionType: 'edited',
      description,
      amountText,
      groupName,
      timeAgo,
      iconName: 'create-outline',
      iconColorType: 'primary',
    };
  }

  // 3. Deleted
  if (action === 'expense_deleted' || action.includes('deleted')) {
    const parts = [
      `${actor} deleted ${description}${amountText ? ` ${amountText}` : ''}`,
      groupName,
      timeAgo,
    ];
    return {
      sentence: parts.join(' · '),
      actor,
      actionType: 'deleted',
      description,
      amountText,
      groupName,
      timeAgo,
      iconName: 'trash-outline',
      iconColorType: 'danger',
    };
  }

  // 4. Restored
  if (action === 'expense_restored' || action.includes('restored')) {
    const parts = [
      `${actor} restored ${description}${amountText ? ` ${amountText}` : ''}`,
      groupName,
      timeAgo,
    ];
    return {
      sentence: parts.join(' · '),
      actor,
      actionType: 'restored',
      description,
      amountText,
      groupName,
      timeAgo,
      iconName: 'refresh-outline',
      iconColorType: 'success',
    };
  }

  // Fallback
  return {
    sentence: `${actor} updated ${groupName} · ${timeAgo}`,
    actor,
    actionType: 'other',
    description,
    amountText,
    groupName,
    timeAgo,
    iconName: 'information-circle-outline',
    iconColorType: 'muted',
  };
}
