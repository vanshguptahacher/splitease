import { formatMoney } from './format';
import { ComputedShare } from './splits';

export interface PreviewResult {
  sentence: string;
  type: 'you_paid' | 'someone_else_paid' | 'not_involved' | 'only_you';
  paidMinor: number;
  shareMinor: number;
  netMinor: number; // positive = get back (lent), negative = owe
}

/**
 * Returns plain-words description of the user's financial effect before saving an expense.
 *
 * UX Rule 4 cases:
 * - you paid: "You paid ₹1,200. You get back ₹960."
 * - someone else paid: "Rahul paid. You owe ₹240."
 * - you are not part of it: "You're not part of this expense."
 * - only you: "Only you. Nobody owes anyone."
 */
export function previewForUser(
  userId: string,
  payerId: string,
  shares: ComputedShare[],
  amountMinor: number,
  payerName?: string
): PreviewResult {
  const normUserId = userId.toLowerCase();
  const normPayerId = payerId.toLowerCase();
  const isPayer = normUserId === normPayerId;

  const myShareItem = shares.find((s) => s.user_id.toLowerCase() === normUserId);
  const myShareMinor = myShareItem ? myShareItem.share_minor : 0;
  const isParticipant = Boolean(myShareItem);

  if (isPayer) {
    // Only you: payer is the sole participant
    if (shares.length === 1 && shares[0].user_id.toLowerCase() === normUserId) {
      return {
        sentence: 'Only you. Nobody owes anyone.',
        type: 'only_you',
        paidMinor: amountMinor,
        shareMinor: amountMinor,
        netMinor: 0,
      };
    }

    const getBack = amountMinor - myShareMinor;
    return {
      sentence: `You paid ${formatMoney(amountMinor)}. You get back ${formatMoney(getBack)}.`,
      type: 'you_paid',
      paidMinor: amountMinor,
      shareMinor: myShareMinor,
      netMinor: getBack,
    };
  }

  // Someone else paid
  if (!isParticipant || myShareMinor === 0) {
    return {
      sentence: "You're not part of this expense.",
      type: 'not_involved',
      paidMinor: 0,
      shareMinor: 0,
      netMinor: 0,
    };
  }

  const displayName = payerName?.trim() || 'Someone';
  return {
    sentence: `${displayName} paid. You owe ${formatMoney(myShareMinor)}.`,
    type: 'someone_else_paid',
    paidMinor: 0,
    shareMinor: myShareMinor,
    netMinor: -myShareMinor,
  };
}
