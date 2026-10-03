import { parseAmountToMinor, formatAmountInput } from '@/lib/money/parse';

describe('Money Parse and Format (parseAmountToMinor & formatAmountInput)', () => {
  describe('parseAmountToMinor', () => {
    it('returns null for empty string or whitespace', () => {
      expect(parseAmountToMinor('')).toBeNull();
      expect(parseAmountToMinor('   ')).toBeNull();
    });

    it('returns null for zero amounts', () => {
      expect(parseAmountToMinor('0')).toBeNull();
      expect(parseAmountToMinor('0.')).toBeNull();
      expect(parseAmountToMinor('0.00')).toBeNull();
    });

    it('parses fractional amount with leading dot ".5" to 50 paise', () => {
      expect(parseAmountToMinor('.5')).toBe(50);
      expect(parseAmountToMinor('.05')).toBe(5);
    });

    it('parses integer rupee amounts correctly ("12" -> 1200 paise)', () => {
      expect(parseAmountToMinor('12')).toBe(1200);
    });

    it('parses single decimal rupee amounts correctly ("12.3" -> 1230 paise)', () => {
      expect(parseAmountToMinor('12.3')).toBe(1230);
    });

    it('parses two decimal rupee amounts correctly ("12.34" -> 1234 paise)', () => {
      expect(parseAmountToMinor('12.34')).toBe(1234);
    });

    it('returns null for more than 2 decimal digits ("12.345" -> null)', () => {
      expect(parseAmountToMinor('12.345')).toBeNull();
      expect(parseAmountToMinor('1.999')).toBeNull();
    });

    it('strips leading zeros correctly ("007" -> 700 paise)', () => {
      expect(parseAmountToMinor('007')).toBe(700);
      expect(parseAmountToMinor('000.50')).toBe(50);
    });

    it('parses maximum allowed amount of ₹1,00,00,000 (1 crore) to 1,000,000,000 paise', () => {
      expect(parseAmountToMinor('10000000')).toBe(1_000_000_000);
    });

    it('rejects amounts above the maximum of ₹1,00,00,000 ("10000000.01" -> null)', () => {
      expect(parseAmountToMinor('10000000.01')).toBeNull();
      expect(parseAmountToMinor('10000001')).toBeNull();
    });

    it('strips Indian grouped commas correctly ("1,00,000" -> 10,000,000 paise)', () => {
      expect(parseAmountToMinor('1,00,000')).toBe(10_000_000);
      expect(parseAmountToMinor('12,34,567.89')).toBe(123_456_789);
    });

    it('rejects invalid characters and double dots', () => {
      expect(parseAmountToMinor('12.3.4')).toBeNull();
      expect(parseAmountToMinor('abc')).toBeNull();
      expect(parseAmountToMinor('₹100')).toBeNull();
      expect(parseAmountToMinor('-50')).toBeNull();
    });
  });

  describe('formatAmountInput', () => {
    it('handles empty input', () => {
      expect(formatAmountInput('')).toBe('');
    });

    it('formats large integers with Indian digit grouping ("1234567" -> "12,34,567")', () => {
      expect(formatAmountInput('1234567')).toBe('12,34,567');
      expect(formatAmountInput('10000000')).toBe('1,00,00,000');
    });

    it('preserves single decimal while typing ("1234.5" -> "1,234.5")', () => {
      expect(formatAmountInput('1234.5')).toBe('1,234.5');
    });

    it('strips leading zeros ("007" -> "7")', () => {
      expect(formatAmountInput('007')).toBe('7');
    });

    it('handles lone dot input ("." -> "0.")', () => {
      expect(formatAmountInput('.')).toBe('0.');
    });

    it('restricts input to maximum 2 decimal places ("1234.567" -> "1,234.56")', () => {
      expect(formatAmountInput('1234.567')).toBe('1,234.56');
    });
  });
});
