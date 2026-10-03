import { formatActivitySentence } from '../src/lib/activity/formatActivity';

describe('formatActivitySentence settlement actions (BG6)', () => {
  const CURRENT_USER = 'user-me-1111';
  const USER_PRIYA = 'user-priya-2222';
  const USER_RAHUL = 'user-rahul-3333';
  const fixedDate = new Date('2026-10-04T12:00:00Z');

  it('formats settlement_created pending: "Rahul paid Priya ₹300 · waiting for confirmation"', () => {
    const item = {
      actor_id: USER_RAHUL,
      actor_name: 'Rahul',
      action: 'settlement_created',
      group_name: 'Goa Trip',
      created_at: '2026-10-04T11:00:00Z',
      details: {
        from_user: USER_RAHUL,
        to_user: USER_PRIYA,
        from_name: 'Rahul',
        to_name: 'Priya',
        amount_minor: 30000,
        method: 'cash',
        status: 'pending',
      },
    };

    const res = formatActivitySentence(item, CURRENT_USER, fixedDate);
    expect(res.actionType).toBe('settlement');
    expect(res.primaryText).toBe('Rahul paid Priya ₹300 · waiting for confirmation');
    expect(res.sentence).toContain('Rahul paid Priya ₹300 · waiting for confirmation · Goa Trip');
    expect(res.iconColorType).toBe('warning');
  });

  it('formats settlement_created pending with current user as payer: "You paid Priya ₹300 · waiting for confirmation"', () => {
    const item = {
      actor_id: CURRENT_USER,
      actor_name: 'Vansh',
      action: 'settlement_created',
      group_name: 'Goa Trip',
      created_at: '2026-10-04T11:00:00Z',
      details: {
        from_user: CURRENT_USER,
        to_user: USER_PRIYA,
        from_name: 'Vansh',
        to_name: 'Priya',
        amount_minor: 30000,
        method: 'cash',
        status: 'pending',
      },
    };

    const res = formatActivitySentence(item, CURRENT_USER, fixedDate);
    expect(res.primaryText).toBe('You paid Priya ₹300 · waiting for confirmation');
  });

  it('formats settlement_confirmed: "Priya confirmed ₹300 from Rahul"', () => {
    const item = {
      actor_id: USER_PRIYA,
      actor_name: 'Priya',
      action: 'settlement_confirmed',
      group_name: 'Goa Trip',
      created_at: '2026-10-04T11:30:00Z',
      details: {
        from_user: USER_RAHUL,
        to_user: USER_PRIYA,
        from_name: 'Rahul',
        to_name: 'Priya',
        amount_minor: 30000,
      },
    };

    const res = formatActivitySentence(item, CURRENT_USER, fixedDate);
    expect(res.actionType).toBe('settlement');
    expect(res.primaryText).toBe('Priya confirmed ₹300 from Rahul');
    expect(res.iconColorType).toBe('success');
  });

  it('formats settlement_disputed: "Priya marked a payment from Rahul as not received"', () => {
    const item = {
      actor_id: USER_PRIYA,
      actor_name: 'Priya',
      action: 'settlement_disputed',
      group_name: 'Goa Trip',
      created_at: '2026-10-04T11:45:00Z',
      details: {
        from_user: USER_RAHUL,
        to_user: USER_PRIYA,
        from_name: 'Rahul',
        to_name: 'Priya',
        amount_minor: 30000,
      },
    };

    const res = formatActivitySentence(item, CURRENT_USER, fixedDate);
    expect(res.actionType).toBe('settlement');
    expect(res.primaryText).toBe('Priya marked a payment from Rahul as not received');
    expect(res.iconColorType).toBe('warning');
  });

  it('formats settlement_cancelled: "Rahul cancelled a payment of ₹300"', () => {
    const item = {
      actor_id: USER_RAHUL,
      actor_name: 'Rahul',
      action: 'settlement_cancelled',
      group_name: 'Goa Trip',
      created_at: '2026-10-04T11:50:00Z',
      details: {
        from_user: USER_RAHUL,
        to_user: USER_PRIYA,
        from_name: 'Rahul',
        to_name: 'Priya',
        amount_minor: 30000,
      },
    };

    const res = formatActivitySentence(item, CURRENT_USER, fixedDate);
    expect(res.actionType).toBe('settlement');
    expect(res.primaryText).toBe('Rahul cancelled a payment of ₹300');
    expect(res.iconColorType).toBe('muted');
  });

  it('formats deleted user fallback: "Deleted user paid you ₹300 · waiting for confirmation"', () => {
    const item = {
      actor_id: 'deleted-user-uuid',
      actor_name: '',
      action: 'settlement_created',
      group_name: 'Goa Trip',
      created_at: '2026-10-04T11:55:00Z',
      details: {
        from_user: 'deleted-user-uuid',
        to_user: CURRENT_USER,
        amount_minor: 30000,
        status: 'pending',
      },
    };

    const res = formatActivitySentence(item, CURRENT_USER, fixedDate);
    expect(res.primaryText).toBe('Deleted user paid you ₹300 · waiting for confirmation');
  });
});
