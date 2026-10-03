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

export interface SettleComparisonParams {
  direction: 'payer' | 'receiver';
  counterpartName: string;
  enteredMinor: number;
  expectedMinor: number;
}

/**
 * Returns live preview wording under amount in Settle Up sheet (Cases SC10, SC11, SC12).
 * Compares entered amount against expected debt/due without calculating balances.
 */
export function formatSettleComparisonText({
  direction,
  counterpartName,
  enteredMinor,
  expectedMinor,
}: SettleComparisonParams): string {
  if (enteredMinor <= 0) {
    return 'Enter an amount to settle.';
  }

  const diff = enteredMinor - expectedMinor;

  if (direction === 'payer') {
    if (diff === 0) {
      return `You'll be settled with ${counterpartName} once they confirm.`;
    }
    if (diff < 0) {
      const remainingMinor = Math.abs(diff);
      return `You'll still owe ${counterpartName} ${formatMoneyCompact(remainingMinor)}.`;
    }
    const extraMinor = diff;
    return `That's ${formatMoneyCompact(extraMinor)} more than you owe. ${counterpartName} will owe you ${formatMoneyCompact(extraMinor)} back.`;
  } else {
    if (diff === 0) {
      return `You'll be settled with ${counterpartName}.`;
    }
    if (diff < 0) {
      const remainingMinor = Math.abs(diff);
      return `${counterpartName} will still owe you ${formatMoneyCompact(remainingMinor)}.`;
    }
    const extraMinor = diff;
    return `That's ${formatMoneyCompact(extraMinor)} more than ${counterpartName} owes. You will owe ${counterpartName} ${formatMoneyCompact(extraMinor)} back.`;
  }
}

export interface FormattedPendingSettlement {
  id: string;
  isActionableByMe: boolean;
  role: 'receiver' | 'payer';
  title: string;
  subtitle?: string;
  amountMinor: number;
  amountText: string;
  method: string;
  status: SettlementStatus | string;
  canConfirm: boolean;
  canDispute: boolean;
  canCancel: boolean;
  counterpartName: string;
  accessibleText: string;
}

/**
 * Formats a pending or disputed settlement for the Pending section of the Balances tab (Case BU4).
 */
export function formatPendingSettlement(
  settlement: {
    id: string;
    from_user: string;
    to_user: string;
    amount_minor: number;
    method: string;
    status: SettlementStatus | string;
    note?: string | null;
  },
  currentUserId: string,
  nameResolver: (userId: string) => string
): FormattedPendingSettlement {
  const isReceiver = settlement.to_user === currentUserId;
  const amountText = formatMoneyCompact(settlement.amount_minor);
  const methodLabel = settlement.method === 'cash' ? 'cash' : 'other';

  const payerName = nameResolver(settlement.from_user) || 'Member';
  const receiverName = nameResolver(settlement.to_user) || 'Member';
  const counterpartName = isReceiver ? payerName : receiverName;

  if (isReceiver) {
    if (settlement.status === 'disputed') {
      const title = `${payerName} paid you ${amountText} (${methodLabel})`;
      const subtitle = 'Marked as not received by you';
      return {
        id: settlement.id,
        isActionableByMe: true,
        role: 'receiver',
        title,
        subtitle,
        amountMinor: settlement.amount_minor,
        amountText,
        method: settlement.method,
        status: settlement.status,
        canConfirm: true, // ST3: receiver can still confirm disputed
        canDispute: false,
        canCancel: false,
        counterpartName,
        accessibleText: `${title}. ${subtitle}. Confirm button available.`,
      };
    }

    // Pending for receiver (ST1, ST2)
    const title = `${payerName} says they paid you ${amountText} (${methodLabel})`;
    return {
      id: settlement.id,
      isActionableByMe: true,
      role: 'receiver',
      title,
      subtitle: settlement.note ? `Note: ${settlement.note}` : undefined,
      amountMinor: settlement.amount_minor,
      amountText,
      method: settlement.method,
      status: settlement.status,
      canConfirm: true,
      canDispute: true,
      canCancel: false,
      counterpartName,
      accessibleText: `${title}. Confirm and dispute buttons available.`,
    };
  }

  // Caller is payer (ST4, ST5)
  if (settlement.status === 'disputed') {
    const title = `${receiverName} says they didn't receive this (${amountText})`;
    return {
      id: settlement.id,
      isActionableByMe: true, // Payer should cancel
      role: 'payer',
      title,
      subtitle: settlement.note ? `Note: ${settlement.note}` : undefined,
      amountMinor: settlement.amount_minor,
      amountText,
      method: settlement.method,
      status: settlement.status,
      canConfirm: false,
      canDispute: false,
      canCancel: true,
      counterpartName,
      accessibleText: `${title}. Cancel payment button available.`,
    };
  }

  // Pending for payer (waiting for receiver)
  const title = `Waiting for ${receiverName} to confirm ${amountText}`;
  return {
    id: settlement.id,
    isActionableByMe: false,
    role: 'payer',
    title,
    subtitle: settlement.note ? `Note: ${settlement.note}` : undefined,
    amountMinor: settlement.amount_minor,
    amountText,
    method: settlement.method,
    status: settlement.status,
    canConfirm: false,
    canDispute: false,
    canCancel: true,
    counterpartName,
    accessibleText: `${title}. Cancel button available.`,
  };
}

/**
 * Sorts pending settlements: items needing caller's action first (receiver),
 * then caller's waiting payments (payer) (Case BU4).
 */
export function sortPendingSettlements<T extends { role: 'receiver' | 'payer'; created_at?: string }>(
  items: T[]
): T[] {
  return [...items].sort((a, b) => {
    if (a.role === 'receiver' && b.role !== 'receiver') return -1;
    if (a.role !== 'receiver' && b.role === 'receiver') return 1;

    if (a.created_at && b.created_at) {
      return b.created_at.localeCompare(a.created_at);
    }
    return 0;
  });
}

export interface HomeBalanceSummaryInput {
  owed_to_me_minor: number;
  i_owe_minor: number;
  net_minor: number;
  groups_with_dues: number;
  pending_for_me: number;
}

export interface FormattedHomeSummary {
  primaryText: string;
  secondaryText?: string;
  state: BalanceState;
  pendingBadgeText?: string;
  pendingCount: number;
  hasDues: boolean;
  accessibleText: string;
}

/**
 * Formats cross-group balance summary for Home / Groups tab top card (Cases HO1, HO7, HO10).
 *
 * e.g.,
 * HO1: "You are owed ₹960 in total"
 * HO1: "You owe ₹300 in total"
 * HO1: "All settled up"
 * HO10: Both owed and owe -> "You are owed ₹660 overall" with "Owed ₹960 · You owe ₹300"
 * HO9: "1 payment to confirm" badge
 */
export function formatHomeBalanceSummary(summary: HomeBalanceSummaryInput): FormattedHomeSummary {
  const { owed_to_me_minor, i_owe_minor, net_minor, pending_for_me } = summary;
  const pendingBadgeText =
    pending_for_me > 0
      ? `${pending_for_me} ${pending_for_me === 1 ? 'payment' : 'payments'} to confirm`
      : undefined;

  // Case HO10: Owed in one group and owe in another
  if (owed_to_me_minor > 0 && i_owe_minor > 0) {
    const owedText = formatMoneyCompact(owed_to_me_minor);
    const oweText = formatMoneyCompact(i_owe_minor);
    const netState: BalanceState = net_minor > 0 ? 'owed' : net_minor < 0 ? 'owe' : 'settled';
    const netFormatted = formatMoneyCompact(Math.abs(net_minor));

    let primaryText = '';
    if (net_minor > 0) {
      primaryText = `You are owed ${netFormatted} overall`;
    } else if (net_minor < 0) {
      primaryText = `You owe ${netFormatted} overall`;
    } else {
      primaryText = 'All settled up overall';
    }

    const secondaryText = `Owed ${owedText} · You owe ${oweText}`;
    return {
      primaryText,
      secondaryText,
      state: netState,
      pendingBadgeText,
      pendingCount: pending_for_me,
      hasDues: true,
      accessibleText: `${primaryText}. ${secondaryText}.${pendingBadgeText ? ` ${pendingBadgeText}.` : ''}`,
    };
  }

  // Only owed
  if (owed_to_me_minor > 0) {
    const amountText = formatMoneyCompact(owed_to_me_minor);
    const primaryText = `You are owed ${amountText} in total`;
    return {
      primaryText,
      secondaryText: undefined,
      state: 'owed',
      pendingBadgeText,
      pendingCount: pending_for_me,
      hasDues: true,
      accessibleText: `${primaryText}.${pendingBadgeText ? ` ${pendingBadgeText}.` : ''}`,
    };
  }

  // Only owe
  if (i_owe_minor > 0) {
    const amountText = formatMoneyCompact(i_owe_minor);
    const primaryText = `You owe ${amountText} in total`;
    return {
      primaryText,
      secondaryText: undefined,
      state: 'owe',
      pendingBadgeText,
      pendingCount: pending_for_me,
      hasDues: true,
      accessibleText: `${primaryText}.${pendingBadgeText ? ` ${pendingBadgeText}.` : ''}`,
    };
  }

  // All settled up (HO1, HO3)
  return {
    primaryText: 'All settled up',
    secondaryText: 'No outstanding balances in any group',
    state: 'settled',
    pendingBadgeText,
    pendingCount: pending_for_me,
    hasDues: false,
    accessibleText: `All settled up. No outstanding balances in any group.${pendingBadgeText ? ` ${pendingBadgeText}.` : ''}`,
  };
}

export interface FormattedSettlementHistoryRow {
  id: string;
  sentence: string;
  fromName: string;
  toName: string;
  amountText: string;
  methodLabel: string;
  statusLabel: string;
  statusChip: string;
  statusState: 'warning' | 'success' | 'error' | 'muted';
  note?: string | null;
  createdAt: string;
  timeAgo: string;
  canConfirm: boolean;
  canDispute: boolean;
  canCancel: boolean;
  canUndo: boolean;
  accessibleText: string;
}

/**
 * Formats a settlement history item for list display (Cases SH1, SH2, SH3, SH4).
 * Row text: "Rahul paid Priya ₹300 · Cash · Confirmed"
 */
export function formatSettlementHistoryRow(
  item: {
    id: string;
    from_user: string;
    to_user: string;
    amount_minor: number;
    method: string;
    status: SettlementStatus | string;
    note?: string | null;
    created_at: string;
    can_confirm: boolean;
    can_dispute: boolean;
    can_cancel: boolean;
    can_undo: boolean;
  },
  currentUserId: string,
  nameResolver: (userId: string) => string
): FormattedSettlementHistoryRow {
  const isPayer = item.from_user === currentUserId;
  const isReceiver = item.to_user === currentUserId;

  const rawFrom = nameResolver(item.from_user) || 'Deleted user';
  const rawTo = nameResolver(item.to_user) || 'Deleted user';

  const fromName = isPayer ? 'You' : rawFrom;
  const toName = isReceiver ? 'you' : rawTo;

  const amountText = formatMoneyCompact(item.amount_minor);
  const methodLabel = item.method === 'cash' ? 'Cash' : item.method === 'upi' ? 'UPI' : 'Other';
  const statusMeta = formatSettlementStatus(item.status);

  // SH2: "Rahul paid Priya ₹300 · Cash · Confirmed"
  const actionVerb = item.status === 'confirmed' ? 'paid' : 'sent';
  const sentence = `${fromName} ${actionVerb} ${toName} ${amountText} · ${methodLabel} · ${statusMeta.chipLabel}`;

  // Time formatting helper
  const date = new Date(item.created_at);
  const diffSec = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  let timeAgo = 'Just now';
  if (diffSec >= 60 && diffSec < 3600) {
    timeAgo = `${Math.floor(diffSec / 60)}m ago`;
  } else if (diffSec >= 3600 && diffSec < 86400) {
    timeAgo = `${Math.floor(diffSec / 3600)}h ago`;
  } else if (diffSec >= 86400) {
    timeAgo = `${Math.floor(diffSec / 86400)}d ago`;
  }

  return {
    id: item.id,
    sentence,
    fromName,
    toName,
    amountText,
    methodLabel,
    statusLabel: statusMeta.label,
    statusChip: statusMeta.chipLabel,
    statusState: statusMeta.state,
    note: item.note,
    createdAt: item.created_at,
    timeAgo,
    canConfirm: item.can_confirm,
    canDispute: item.can_dispute,
    canCancel: item.can_cancel,
    canUndo: item.can_undo,
    accessibleText: `${sentence}. ${item.note ? `Note: ${item.note}.` : ''}`,
  };
}
