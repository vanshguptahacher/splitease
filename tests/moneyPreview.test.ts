import { previewForUser } from '@/lib/money/preview';
import { ComputedShare } from '@/lib/money/splits';

describe('previewForUser - Plain Words Financial Effect Preview', () => {
  const userMe = '11111111-1111-1111-1111-111111111111';
  const userRahul = '22222222-2222-2222-2222-222222222222';
  const userPriya = '33333333-3333-3333-3333-333333333333';

  it('Case 1: Only you (payer is the sole participant)', () => {
    const shares: ComputedShare[] = [
      { user_id: userMe, share_minor: 120000, percent_bp: null },
    ];

    const result = previewForUser(userMe, userMe, shares, 120000);
    expect(result.type).toBe('only_you');
    expect(result.sentence).toBe('Only you. Nobody owes anyone.');
    expect(result.netMinor).toBe(0);
  });

  it('Case 2: You paid for others (you paid, you get back remainder)', () => {
    // Expense: ₹1,200 total (120000 paise). Me owes ₹240 (24000 paise), get back ₹960 (96000 paise)
    const shares: ComputedShare[] = [
      { user_id: userMe, share_minor: 24000, percent_bp: null },
      { user_id: userRahul, share_minor: 48000, percent_bp: null },
      { user_id: userPriya, share_minor: 48000, percent_bp: null },
    ];

    const result = previewForUser(userMe, userMe, shares, 120000);
    expect(result.type).toBe('you_paid');
    expect(result.sentence).toBe('You paid ₹1,200.00. You get back ₹960.00.');
    expect(result.paidMinor).toBe(120000);
    expect(result.shareMinor).toBe(24000);
    expect(result.netMinor).toBe(96000);
  });

  it('Case 3: Someone else paid and you are part of the split (you owe your share)', () => {
    // Rahul paid ₹1,200. Me owes ₹240.
    const shares: ComputedShare[] = [
      { user_id: userMe, share_minor: 24000, percent_bp: null },
      { user_id: userRahul, share_minor: 96000, percent_bp: null },
    ];

    const result = previewForUser(userMe, userRahul, shares, 120000, 'Rahul');
    expect(result.type).toBe('someone_else_paid');
    expect(result.sentence).toBe('Rahul paid. You owe ₹240.00.');
    expect(result.paidMinor).toBe(0);
    expect(result.shareMinor).toBe(24000);
    expect(result.netMinor).toBe(-24000);
  });

  it('Case 3b: Someone else paid without payer name provided (defaults to "Someone")', () => {
    const shares: ComputedShare[] = [
      { user_id: userMe, share_minor: 24000, percent_bp: null },
      { user_id: userRahul, share_minor: 96000, percent_bp: null },
    ];

    const result = previewForUser(userMe, userRahul, shares, 120000);
    expect(result.sentence).toBe('Someone paid. You owe ₹240.00.');
  });

  it('Case 4: You are not part of the expense (someone else paid for others)', () => {
    const shares: ComputedShare[] = [
      { user_id: userRahul, share_minor: 60000, percent_bp: null },
      { user_id: userPriya, share_minor: 60000, percent_bp: null },
    ];

    const result = previewForUser(userMe, userRahul, shares, 120000, 'Rahul');
    expect(result.type).toBe('not_involved');
    expect(result.sentence).toBe("You're not part of this expense.");
    expect(result.netMinor).toBe(0);
  });
});
