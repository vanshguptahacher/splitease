import { computeShares } from '@/lib/money/splits';
import fixture from './fixtures/split-vectors.json';

interface Participant {
  user_id: string;
  value?: number;
}

interface ExpectedShare {
  user_id: string;
  share_minor: number;
  percent_bp: number | null;
}

interface SplitVector {
  id: number;
  type: 'equal' | 'exact' | 'percent';
  amountMinor: number;
  participants: Participant[];
  expectedShares: ExpectedShare[] | null;
  expectedError: string | null;
}

const vectors: SplitVector[] = fixture.vectors as SplitVector[];

describe('Split Engine - Shared Test Vectors (Jest)', () => {
  it('loads all 18 vectors from tests/fixtures/split-vectors.json', () => {
    expect(fixture.vectors).toHaveLength(18);
  });

  vectors.forEach((v) => {
    if (v.expectedShares) {
      test(`Vector ${v.id}: ${v.type} split for amount ${v.amountMinor} matches expected shares`, () => {
        const result = computeShares(v.type, v.amountMinor, v.participants);
        expect(result).toEqual(v.expectedShares);

        // Invariant: sum of shares must equal total amount exactly
        const sum = result.reduce((acc, curr) => acc + curr.share_minor, 0);
        expect(sum).toBe(v.amountMinor);
      });
    } else if (v.expectedError) {
      test(`Vector ${v.id}: ${v.type} throws expected error "${v.expectedError}"`, () => {
        expect(() => {
          computeShares(v.type, v.amountMinor, v.participants);
        }).toThrow(v.expectedError!);
      });
    }
  });
});
