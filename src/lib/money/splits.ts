export interface ParticipantInput {
  user_id: string;
  value?: number;
}

export interface ComputedShare {
  user_id: string;
  share_minor: number;
  percent_bp: number | null;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Deterministic split engine TypeScript mirror.
 * Exact mirror of public.compute_shares() in PostgreSQL.
 * Uses integer arithmetic only (no floating point calculations).
 */
export function computeShares(
  type: 'equal' | 'exact' | 'percent',
  amountMinor: number,
  participants: ParticipantInput[]
): ComputedShare[] {
  if (!participants || !Array.isArray(participants) || participants.length === 0) {
    throw new Error('no_participants');
  }

  const count = participants.length;
  if (count > 50) {
    throw new Error('too_many_participants');
  }

  // Validate every participant object and user_id UUID
  for (const p of participants) {
    if (!p || typeof p !== 'object' || typeof p.user_id !== 'string' || !UUID_REGEX.test(p.user_id)) {
      throw new Error('invalid_split_value');
    }
  }

  // Check for duplicate participants
  const uniqueUids = new Set(participants.map((p) => p.user_id.toLowerCase()));
  if (uniqueUids.size !== count) {
    throw new Error('duplicate_participant');
  }

  if (type === 'equal') {
    // Sort participants by lowercase UUID order
    const sorted = [...participants].sort((a, b) =>
      a.user_id.toLowerCase().localeCompare(b.user_id.toLowerCase())
    );

    const base = Math.floor(amountMinor / count);
    const remainder = amountMinor % count;

    return sorted.map((p, index) => ({
      user_id: p.user_id,
      share_minor: base + (index < remainder ? 1 : 0),
      percent_bp: null,
    }));
  }

  if (type === 'exact') {
    let sum = 0;
    for (const p of participants) {
      if (
        typeof p.value !== 'number' ||
        !Number.isInteger(p.value) ||
        p.value < 1 ||
        p.value > 1000000000
      ) {
        throw new Error('invalid_split_value');
      }
      sum += p.value;
    }

    if (sum !== amountMinor) {
      throw new Error('splits_dont_add_up');
    }

    return [...participants]
      .sort((a, b) => a.user_id.toLowerCase().localeCompare(b.user_id.toLowerCase()))
      .map((p) => ({
        user_id: p.user_id,
        share_minor: p.value!,
        percent_bp: null,
      }));
  }

  if (type === 'percent') {
    let sumBp = 0;
    for (const p of participants) {
      if (
        typeof p.value !== 'number' ||
        !Number.isInteger(p.value) ||
        p.value < 1 ||
        p.value > 10000
      ) {
        throw new Error('invalid_split_value');
      }
      sumBp += p.value;
    }

    if (sumBp !== 10000) {
      throw new Error('splits_dont_add_up');
    }

    // Compute base share and remainder (fractional paise)
    let totalBase = 0;
    const computed = participants.map((p) => {
      const bp = p.value!;
      const base = Math.floor((amountMinor * bp) / 10000);
      const frac = (amountMinor * bp) % 10000;
      totalBase += base;
      return {
        user_id: p.user_id,
        bp,
        base,
        frac,
      };
    });

    const leftover = amountMinor - totalBase;

    // Rank by largest fractional remainder descending; ties broken by user_id ascending
    const ranked = [...computed].sort((a, b) => {
      if (b.frac !== a.frac) {
        return b.frac - a.frac;
      }
      return a.user_id.toLowerCase().localeCompare(b.user_id.toLowerCase());
    });

    const awardedUserIds = new Set<string>();
    for (let i = 0; i < leftover; i++) {
      awardedUserIds.add(ranked[i].user_id.toLowerCase());
    }

    // Return in deterministic user_id order
    return [...computed]
      .sort((a, b) => a.user_id.toLowerCase().localeCompare(b.user_id.toLowerCase()))
      .map((c) => ({
        user_id: c.user_id,
        share_minor: c.base + (awardedUserIds.has(c.user_id.toLowerCase()) ? 1 : 0),
        percent_bp: c.bp,
      }));
  }

  throw new Error('invalid_split_type');
}
