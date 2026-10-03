import { formatMoneyCompact, toAccessibleMoneyString } from './format';
import { SettlementStatus } from '@/types/database';

export type BalanceState = 'owed' | 'owe' | 'settled';
export type SuggestedActionType = 'settle_up' | 'mark_received' | 'none';

export interface NetSummaryText {
  text: string;
  state: BalanceState;
  amountText?: string;
  accessibleText: string;
}

export interface SuggestedPaymentItem {
  seq: number;
  from_user: string;
  to_user: string;
  amount_minor: number;
}

export interface FormattedSuggestedPayment {
  seq: number;
  fromUser: string;
  toUser: string;
  fromName: string;
  toName: string;
  amountMinor: number;
  amountText: string;
  sentence: string;
  action: SuggestedActionType;
  actionLabel?: string;
  isUserInvolved: boolean;
  accessibleText: string;
}

export interface MemberBalanceItem {
  user_id: string;
  net_minor: number;
}

export interface FormattedMemberBalance {
  userId: string;
  displayName: string;
  isCurrentUser: boolean;
  netMinor: number;
  text: string;
  state: BalanceState;
  amountText?: string;
  accessibleText: string;
}

export interface FormattedGroupRowBalance {
  text: string;
  state: BalanceState;
  accessibleText: string;
}

export const SUGGESTIONS_COPY = 'Suggested payments update when expenses change.';
export const ALL_SETTLED_TITLE = 'All settled up';
export const ALL_SETTLED_SUBTITLE = 'No outstanding balances or payments in this group.';

/**
 * Turns a member's net minor balance into plain words for the Top Card (Case BU1).
 * Server calculates balance; this purely formats.
 *
 * e.g.,
 * net > 0 -> "You are owed ₹960"
 * net < 0 -> "You owe ₹240"
 * net === 0 -> "All settled up"
 */
export function formatNetSummary(netMinor: number): NetSummaryText {
  if (netMinor > 0) {
    const amountText = formatMoneyCompact(netMinor);
    return {
      text: `You are owed ${amountText}`,
      state: 'owed',
      amountText,
      accessibleText: `You are owed ${toAccessibleMoneyString(netMinor)}`,
    };
  }

  if (netMinor < 0) {
    const absMinor = Math.abs(netMinor);
    const amountText = formatMoneyCompact(absMinor);
    return {
      text: `You owe ${amountText}`,
      state: 'owe',
      amountText,
      accessibleText: `You owe ${toAccessibleMoneyString(absMinor)}`,
    };
  }

  return {
    text: ALL_SETTLED_TITLE,
    state: 'settled',
    accessibleText: ALL_SETTLED_TITLE,
  };
}

/**
 * Formats a suggested payment row into human sentences (Case BU2).
 *
 * e.g.,
 * Caller is payer: "You owe Priya ₹300" with action "Settle up"
 * Caller is receiver: "Rahul owes you ₹300" with action "Mark as received"
 * Caller is neither: "Rahul pays Priya ₹300" with no action button
 */
export function formatSuggestedPayment(
  payment: SuggestedPaymentItem,
  currentUserId: string,
  nameResolver: (userId: string) => string
): FormattedSuggestedPayment {
  const isPayer = payment.from_user === currentUserId;
  const isReceiver = payment.to_user === currentUserId;
  const isUserInvolved = isPayer || isReceiver;

  const rawFromName = nameResolver(payment.from_user) || 'Unknown';
  const rawToName = nameResolver(payment.to_user) || 'Unknown';

  const fromName = isPayer ? 'You' : rawFromName;
  const toName = isReceiver ? 'you' : rawToName;
  const amountText = formatMoneyCompact(payment.amount_minor);
  const accessibleAmount = toAccessibleMoneyString(payment.amount_minor);

  let sentence = '';
  let action: SuggestedActionType = 'none';
  let actionLabel: string | undefined;
  let accessibleText = '';

  if (isPayer) {
    sentence = `You owe ${toName} ${amountText}`;
    action = 'settle_up';
    actionLabel = 'Settle up';
    accessibleText = `You owe ${toName} ${accessibleAmount}. Settle up button available.`;
  } else if (isReceiver) {
    sentence = `${fromName} owes you ${amountText}`;
    action = 'mark_received';
    actionLabel = 'Mark as received';
    accessibleText = `${fromName} owes you ${accessibleAmount}. Mark as received button available.`;
  } else {
    sentence = `${fromName} pays ${toName} ${amountText}`;
    action = 'none';
    actionLabel = undefined;
    accessibleText = `${fromName} pays ${toName} ${accessibleAmount}.`;
  }

  return {
    seq: payment.seq,
    fromUser: payment.from_user,
    toUser: payment.to_user,
    fromName,
    toName,
    amountMinor: payment.amount_minor,
    amountText,
    sentence,
    action,
    actionLabel,
    isUserInvolved,
    accessibleText,
  };
}

/**
 * Formats a member's row for "Everyone's balances" list (Case BU3).
 * Wording: "gets back ₹X" / "owes ₹X" / "settled".
 */
export function formatMemberBalance(
  member: MemberBalanceItem,
  currentUserId: string,
  nameResolver: (userId: string) => string
): FormattedMemberBalance {
  const isCurrentUser = member.user_id === currentUserId;
  const resolvedName = nameResolver(member.user_id) || 'Unknown';
  const displayName = isCurrentUser ? 'You' : resolvedName;

  if (member.net_minor > 0) {
    const amountText = formatMoneyCompact(member.net_minor);
    const text = `gets back ${amountText}`;
    return {
      userId: member.user_id,
      displayName,
      isCurrentUser,
      netMinor: member.net_minor,
      text,
      state: 'owed',
      amountText,
      accessibleText: `${displayName} gets back ${toAccessibleMoneyString(member.net_minor)}`,
    };
  }

  if (member.net_minor < 0) {
    const absMinor = Math.abs(member.net_minor);
    const amountText = formatMoneyCompact(absMinor);
    const text = `owes ${amountText}`;
    return {
      userId: member.user_id,
      displayName,
      isCurrentUser,
      netMinor: member.net_minor,
      text,
      state: 'owe',
      amountText,
      accessibleText: `${displayName} owes ${toAccessibleMoneyString(absMinor)}`,
    };
  }

  return {
    userId: member.user_id,
    displayName,
    isCurrentUser,
    netMinor: 0,
    text: 'settled',
    state: 'settled',
    accessibleText: `${displayName} is settled`,
  };
}

/**
 * Sorts member balance list for display (Case BU3):
 * "You first, then largest absolute amount"
 */
export function sortMembersForBalances(
  members: MemberBalanceItem[],
  currentUserId: string
): MemberBalanceItem[] {
  return [...members].sort((a, b) => {
    const aIsMe = a.user_id === currentUserId;
    const bIsMe = b.user_id === currentUserId;
    if (aIsMe && !bIsMe) return -1;
    if (!aIsMe && bIsMe) return 1;

    // Largest absolute amount first
    const absDiff = Math.abs(b.net_minor) - Math.abs(a.net_minor);
    if (absDiff !== 0) return absDiff;

    // Stable secondary sort on user_id
    return a.user_id.localeCompare(b.user_id);
  });
}

/**
 * Formats balance for group list cards on Home / Groups tab (Cases HO2, HO3).
 *
 * e.g.,
 * net > 0 -> "you're owed ₹960"
 * net < 0 -> "you owe ₹300"
 * net === 0 -> "settled up"
 */
export function formatGroupRowBalance(netMinor: number): FormattedGroupRowBalance {
  if (netMinor > 0) {
    const amountText = formatMoneyCompact(netMinor);
    return {
      text: `you're owed ${amountText}`,
      state: 'owed',
      accessibleText: `You are owed ${toAccessibleMoneyString(netMinor)} in this group`,
    };
  }

  if (netMinor < 0) {
    const absMinor = Math.abs(netMinor);
    const amountText = formatMoneyCompact(absMinor);
    return {
      text: `you owe ${amountText}`,
      state: 'owe',
      accessibleText: `You owe ${toAccessibleMoneyString(absMinor)} in this group`,
    };
  }

  return {
    text: 'settled up',
    state: 'settled',
    accessibleText: 'You are settled up in this group',
  };
}

/**
 * Returns chip and badge metadata for a settlement status (Case SH1).
 */
export function formatSettlementStatus(status: SettlementStatus | string): {
  label: string;
  chipLabel: string;
  state: 'warning' | 'success' | 'error' | 'muted';
} {
  switch (status) {
    case 'pending':
      return {
        label: 'Waiting for confirmation',
        chipLabel: 'Waiting',
        state: 'warning',
      };
    case 'confirmed':
      return {
        label: 'Confirmed',
        chipLabel: 'Confirmed',
        state: 'success',
      };
    case 'disputed':
      return {
        label: 'Not received',
        chipLabel: 'Not received',
        state: 'error',
      };
    case 'cancelled':
      return {
        label: 'Cancelled',
        chipLabel: 'Cancelled',
        state: 'muted',
      };
    default:
      return {
        label: status,
        chipLabel: status,
        state: 'muted',
      };
  }
}
