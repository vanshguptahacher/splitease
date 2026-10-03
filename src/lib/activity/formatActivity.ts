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

export type ActivityActionType = 'added' | 'edited' | 'deleted' | 'restored' | 'settlement' | 'other';

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
  primaryText: string;
}

/**
 * Formats an activity item per EV2, EV3, EV4, EV5, BG6 requirements:
 * - EV4: "You" for user's own actions
 * - EV5: "Deleted user" for deleted profiles
 * - EV3: Edit entries show amount change ("Rahul changed 'Dinner' ₹1,200 → ₹1,500")
 * - EV2: "Rahul added 'Dinner' ₹1,200 · Goa Trip · 2h ago"
 * - BG6: Settlement entries ("Rahul paid Priya ₹300 · waiting for confirmation", "Priya confirmed ₹300 from Rahul", etc.)
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

  // Settlement Actions (BG6, Task 3)
  if (action.startsWith('settlement_')) {
    const fromUserId = typeof details.from_user === 'string' ? details.from_user : '';
    const toUserId = typeof details.to_user === 'string' ? details.to_user : '';
    const rawFromName = typeof details.from_name === 'string' ? details.from_name : '';
    const rawToName = typeof details.to_name === 'string' ? details.to_name : '';

    const fromName = fromUserId === currentUserId
      ? 'You'
      : (rawFromName || (fromUserId ? 'Deleted user' : 'Member'));
    const toName = toUserId === currentUserId
      ? 'you'
      : (rawToName || (toUserId ? 'Deleted user' : 'Member'));

    let actionClause = '';
    let iconName = 'cash-outline';
    let iconColorType: 'success' | 'primary' | 'danger' | 'warning' | 'muted' = 'primary';

    if (action === 'settlement_created') {
      if (details.status === 'confirmed') {
        const subject = toUserId === currentUserId ? 'You' : toName;
        const counterpart = fromUserId === currentUserId ? 'you' : fromName;
        actionClause = `${subject} confirmed ${amountText} from ${counterpart}`;
        iconName = 'checkmark-circle-outline';
        iconColorType = 'success';
      } else {
        actionClause = `${fromName} paid ${toName} ${amountText} · waiting for confirmation`;
        iconName = 'cash-outline';
        iconColorType = 'warning';
      }
    } else if (action === 'settlement_confirmed') {
      const subject = toUserId === currentUserId ? 'You' : toName;
      const counterpart = fromUserId === currentUserId ? 'you' : fromName;
      actionClause = `${subject} confirmed ${amountText} from ${counterpart}`;
      iconName = 'checkmark-circle-outline';
      iconColorType = 'success';
    } else if (action === 'settlement_disputed') {
      const subject = toUserId === currentUserId ? 'You' : toName;
      const counterpart = fromUserId === currentUserId ? 'you' : fromName;
      actionClause = `${subject} marked a payment from ${counterpart} as not received`;
      iconName = 'alert-circle-outline';
      iconColorType = 'warning';
    } else if (action === 'settlement_cancelled') {
      actionClause = `${actor} cancelled a payment${amountText ? ` of ${amountText}` : ''}`;
      iconName = 'close-circle-outline';
      iconColorType = 'muted';
    } else {
      actionClause = `${actor} updated a payment${amountText ? ` of ${amountText}` : ''}`;
      iconName = 'information-circle-outline';
      iconColorType = 'muted';
    }

    const parts = [actionClause, groupName, timeAgo];
    return {
      sentence: parts.join(' · '),
      actor,
      actionType: 'settlement',
      description: '',
      amountText,
      groupName,
      timeAgo,
      iconName,
      iconColorType,
      primaryText: actionClause,
    };
  }

  // 1. Added
  if (action === 'expense_added' || action.includes('added')) {
    const actionClause = `${actor} added ${description}${amountText ? ` ${amountText}` : ''}`;
    const parts = [actionClause, groupName, timeAgo];
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
      primaryText: actionClause,
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
      primaryText: actionClause,
    };
  }

  // 3. Deleted
  if (action === 'expense_deleted' || action.includes('deleted')) {
    const actionClause = `${actor} deleted ${description}${amountText ? ` ${amountText}` : ''}`;
    const parts = [actionClause, groupName, timeAgo];
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
      primaryText: actionClause,
    };
  }

  // 4. Restored
  if (action === 'expense_restored' || action.includes('restored')) {
    const actionClause = `${actor} restored ${description}${amountText ? ` ${amountText}` : ''}`;
    const parts = [actionClause, groupName, timeAgo];
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
      primaryText: actionClause,
    };
  }

  // Fallback
  const fallbackClause = `${actor} updated ${groupName}`;
  return {
    sentence: `${fallbackClause} · ${timeAgo}`,
    actor,
    actionType: 'other',
    description,
    amountText,
    groupName,
    timeAgo,
    iconName: 'information-circle-outline',
    iconColorType: 'muted',
    primaryText: fallbackClause,
  };
}
