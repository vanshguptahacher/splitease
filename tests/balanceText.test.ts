import {
  formatGroupRowBalance,
  formatMemberBalance,
  formatNetSummary,
  formatSettlementStatus,
  formatSuggestedPayment,
  sortMembersForBalances,
  SUGGESTIONS_COPY,
  ALL_SETTLED_TITLE,
  ALL_SETTLED_SUBTITLE,
} from '../src/lib/money/balanceText';

describe('balanceText.ts pure functions', () => {
  const CURRENT_USER = 'user-me-1111';
  const USER_PRIYA = 'user-priya-2222';
  const USER_RAHUL = 'user-rahul-3333';
  const USER_VIKRAM = 'user-vikram-4444';

  const nameMap: Record<string, string> = {
    [CURRENT_USER]: 'Vansh',
    [USER_PRIYA]: 'Priya',
    [USER_RAHUL]: 'Rahul',
    [USER_VIKRAM]: 'Vikram',
  };

  const nameResolver = (id: string) => nameMap[id] || 'Unknown';

  describe('formatNetSummary (BU1)', () => {
    it('formats positive net as "You are owed ₹X" (green/owed state)', () => {
      const res = formatNetSummary(96000); // ₹960.00
      expect(res.text).toBe('You are owed ₹960');
      expect(res.state).toBe('owed');
      expect(res.amountText).toBe('₹960');
      expect(res.accessibleText).toBe('You are owed 960 rupees');
    });

    it('formats positive net with paise correctly', () => {
      const res = formatNetSummary(125050); // ₹1,250.50
      expect(res.text).toBe('You are owed ₹1,250.50');
      expect(res.state).toBe('owed');
      expect(res.amountText).toBe('₹1,250.50');
      expect(res.accessibleText).toBe('You are owed 1,250 rupees and 50 paise');
    });

    it('formats negative net as "You owe ₹X" (orange/owe state) without minus sign', () => {
      const res = formatNetSummary(-24000); // -₹240.00
      expect(res.text).toBe('You owe ₹240');
      expect(res.state).toBe('owe');
      expect(res.amountText).toBe('₹240');
      expect(res.accessibleText).toBe('You owe 240 rupees');
    });

    it('formats negative net with paise correctly', () => {
      const res = formatNetSummary(-3333); // -₹33.33
      expect(res.text).toBe('You owe ₹33.33');
      expect(res.state).toBe('owe');
      expect(res.amountText).toBe('₹33.33');
      expect(res.accessibleText).toBe('You owe 33 rupees and 33 paise');
    });

    it('formats zero net as "All settled up" (settled state)', () => {
      const res = formatNetSummary(0);
      expect(res.text).toBe(ALL_SETTLED_TITLE);
      expect(res.state).toBe('settled');
      expect(res.amountText).toBeUndefined();
      expect(res.accessibleText).toBe(ALL_SETTLED_TITLE);
    });
  });

  describe('formatSuggestedPayment (BU2)', () => {
    it('when current user is payer: returns "You owe [Name] ₹X" and action "Settle up"', () => {
      const payment = {
        seq: 1,
        from_user: CURRENT_USER,
        to_user: USER_PRIYA,
        amount_minor: 30000,
      };

      const res = formatSuggestedPayment(payment, CURRENT_USER, nameResolver);
      expect(res.sentence).toBe('You owe Priya ₹300');
      expect(res.action).toBe('settle_up');
      expect(res.actionLabel).toBe('Settle up');
      expect(res.isUserInvolved).toBe(true);
      expect(res.fromName).toBe('You');
      expect(res.toName).toBe('Priya');
      expect(res.amountText).toBe('₹300');
    });

    it('when current user is receiver: returns "[Name] owes you ₹X" and action "Mark as received"', () => {
      const payment = {
        seq: 2,
        from_user: USER_RAHUL,
        to_user: CURRENT_USER,
        amount_minor: 45050,
      };

      const res = formatSuggestedPayment(payment, CURRENT_USER, nameResolver);
      expect(res.sentence).toBe('Rahul owes you ₹450.50');
      expect(res.action).toBe('mark_received');
      expect(res.actionLabel).toBe('Mark as received');
      expect(res.isUserInvolved).toBe(true);
      expect(res.fromName).toBe('Rahul');
      expect(res.toName).toBe('you');
      expect(res.amountText).toBe('₹450.50');
    });

    it('when current user is neither: returns "[Name] pays [Name] ₹X" with action "none"', () => {
      const payment = {
        seq: 3,
        from_user: USER_RAHUL,
        to_user: USER_PRIYA,
        amount_minor: 120000,
      };

      const res = formatSuggestedPayment(payment, CURRENT_USER, nameResolver);
      expect(res.sentence).toBe('Rahul pays Priya ₹1,200');
      expect(res.action).toBe('none');
      expect(res.actionLabel).toBeUndefined();
      expect(res.isUserInvolved).toBe(false);
      expect(res.fromName).toBe('Rahul');
      expect(res.toName).toBe('Priya');
      expect(res.amountText).toBe('₹1,200');
    });
  });

  describe('formatMemberBalance (BU3)', () => {
    it('formats member with positive net as "gets back ₹X"', () => {
      const res = formatMemberBalance(
        { user_id: USER_PRIYA, net_minor: 50000 },
        CURRENT_USER,
        nameResolver
      );
      expect(res.displayName).toBe('Priya');
      expect(res.isCurrentUser).toBe(false);
      expect(res.text).toBe('gets back ₹500');
      expect(res.state).toBe('owed');
    });

    it('formats current user with positive net as "You" / "gets back ₹X"', () => {
      const res = formatMemberBalance(
        { user_id: CURRENT_USER, net_minor: 75000 },
        CURRENT_USER,
        nameResolver
      );
      expect(res.displayName).toBe('You');
      expect(res.isCurrentUser).toBe(true);
      expect(res.text).toBe('gets back ₹750');
      expect(res.state).toBe('owed');
    });

    it('formats member with negative net as "owes ₹X"', () => {
      const res = formatMemberBalance(
        { user_id: USER_RAHUL, net_minor: -30000 },
        CURRENT_USER,
        nameResolver
      );
      expect(res.displayName).toBe('Rahul');
      expect(res.text).toBe('owes ₹300');
      expect(res.state).toBe('owe');
    });

    it('formats settled member (0 net) as "settled"', () => {
      const res = formatMemberBalance(
        { user_id: USER_VIKRAM, net_minor: 0 },
        CURRENT_USER,
        nameResolver
      );
      expect(res.displayName).toBe('Vikram');
      expect(res.text).toBe('settled');
      expect(res.state).toBe('settled');
      expect(res.amountText).toBeUndefined();
    });
  });

  describe('sortMembersForBalances (BU3)', () => {
    it('sorts current user first, then largest absolute amount descending', () => {
      const members = [
        { user_id: USER_RAHUL, net_minor: -10000 }, // abs: 100
        { user_id: USER_PRIYA, net_minor: 50000 },  // abs: 500
        { user_id: CURRENT_USER, net_minor: -2000 }, // me (abs: 20)
        { user_id: USER_VIKRAM, net_minor: -80000 }, // abs: 800
      ];

      const sorted = sortMembersForBalances(members, CURRENT_USER);
      expect(sorted[0].user_id).toBe(CURRENT_USER); // You first!
      expect(sorted[1].user_id).toBe(USER_VIKRAM);  // abs 800
      expect(sorted[2].user_id).toBe(USER_PRIYA);   // abs 500
      expect(sorted[3].user_id).toBe(USER_RAHUL);   // abs 100
    });
  });

  describe('formatGroupRowBalance (HO2, HO3)', () => {
    it('formats positive as "you\'re owed ₹X"', () => {
      const res = formatGroupRowBalance(96000);
      expect(res.text).toBe("you're owed ₹960");
      expect(res.state).toBe('owed');
    });

    it('formats negative as "you owe ₹X"', () => {
      const res = formatGroupRowBalance(-30000);
      expect(res.text).toBe('you owe ₹300');
      expect(res.state).toBe('owe');
    });

    it('formats zero as "settled up"', () => {
      const res = formatGroupRowBalance(0);
      expect(res.text).toBe('settled up');
      expect(res.state).toBe('settled');
    });
  });

  describe('formatSettlementStatus (SH1)', () => {
    it('returns proper labels and chips for all statuses', () => {
      expect(formatSettlementStatus('pending')).toEqual({
        label: 'Waiting for confirmation',
        chipLabel: 'Waiting',
        state: 'warning',
      });
      expect(formatSettlementStatus('confirmed')).toEqual({
        label: 'Confirmed',
        chipLabel: 'Confirmed',
        state: 'success',
      });
      expect(formatSettlementStatus('disputed')).toEqual({
        label: 'Not received',
        chipLabel: 'Not received',
        state: 'error',
      });
      expect(formatSettlementStatus('cancelled')).toEqual({
        label: 'Cancelled',
        chipLabel: 'Cancelled',
        state: 'muted',
      });
    });
  });

  describe('constants', () => {
    it('has exact required copy text', () => {
      expect(SUGGESTIONS_COPY).toBe('Suggested payments update when expenses change.');
      expect(ALL_SETTLED_TITLE).toBe('All settled up');
      expect(ALL_SETTLED_SUBTITLE).toBe('No outstanding balances or payments in this group.');
    });
  });
});
