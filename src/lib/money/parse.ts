const MAX_AMOUNT_MINOR = 1_000_000_000; // ₹1,00,00,000 (1 crore in paise)
const MIN_AMOUNT_MINOR = 1; // ₹0.01 (1 paisa)

/**
 * Parses user-entered currency text into integer paise.
 * Uses string manipulation and BigInt/integer logic only (NO floating point).
 *
 * Valid ranges: ₹0.01 to ₹1,00,00,000 (1 to 1,000,000,000 paise).
 * Returns null for invalid format, > 2 decimals, or out of range.
 */
export function parseAmountToMinor(text: string): number | null {
  if (!text || typeof text !== 'string') return null;

  // Strip whitespace and commas
  const cleaned = text.replace(/[\s,]/g, '');
  if (!cleaned) return null;

  // Reject invalid characters (only digits and a single optional decimal dot)
  if (!/^\d*(\.\d*)?$/.test(cleaned) || cleaned === '.') return null;

  const parts = cleaned.split('.');
  if (parts.length > 2) return null;

  let [rupeesStr, decimalsStr = ''] = parts;

  // More than 2 decimal digits is invalid
  if (decimalsStr.length > 2) return null;

  // Pad decimals to 2 digits ("5" -> "50", "" -> "00", "25" -> "25")
  const paddedDecimals = decimalsStr.padEnd(2, '0');

  // Strip leading zeros from rupees portion
  const normalizedRupees = rupeesStr.replace(/^0+/, '') || '0';

  // If both rupees and decimals are zero (e.g. "0", "0.", "0.00"), amount is 0 which is below min
  if (normalizedRupees === '0' && paddedDecimals === '00') {
    return null;
  }

  // Combine rupees and paise as integer string without floats
  const totalStr = normalizedRupees === '0' ? paddedDecimals.replace(/^0+/, '') || '0' : normalizedRupees + paddedDecimals;

  const amountMinor = Number(totalStr);

  if (!Number.isSafeInteger(amountMinor)) {
    return null;
  }

  if (amountMinor < MIN_AMOUNT_MINOR || amountMinor > MAX_AMOUNT_MINOR) {
    return null;
  }

  return amountMinor;
}

/**
 * Formats a live user-typed input string with Indian digit grouping
 * while preserving typing state (such as trailing dot or partial decimals).
 *
 * e.g. "1234567" -> "12,34,567"
 *      "1234.5"  -> "1,234.5"
 *      "007"     -> "7"
 *      "."       -> "0."
 */
export function formatAmountInput(text: string): string {
  if (!text) return '';

  // Remove commas, spaces, currency symbols, and non-digit/non-dot characters
  let cleaned = text.replace(/[^\d.]/g, '');
  if (!cleaned) return '';

  // Handle leading dot
  if (cleaned.startsWith('.')) {
    cleaned = '0' + cleaned;
  }

  // Only allow the first decimal point
  const firstDotIndex = cleaned.indexOf('.');
  if (firstDotIndex !== -1) {
    const beforeDot = cleaned.slice(0, firstDotIndex);
    const afterDot = cleaned.slice(firstDotIndex + 1).replace(/\./g, '').slice(0, 2);
    cleaned = beforeDot + '.' + afterDot;
  }

  const parts = cleaned.split('.');
  let rupees = parts[0];
  const hasDot = parts.length > 1 || cleaned.endsWith('.');
  const decimals = parts[1] ?? '';

  // Strip leading zeros unless followed by dot or lone zero
  if (rupees.length > 1 && rupees.startsWith('0')) {
    rupees = rupees.replace(/^0+/, '') || '0';
  }

  // Apply Indian grouping to rupees: last 3 digits, then groups of 2
  const groupedRupees =
    rupees.length > 3
      ? rupees.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + rupees.slice(-3)
      : rupees;

  if (hasDot) {
    return `${groupedRupees}.${decimals}`;
  }

  return groupedRupees;
}

export type KeypadKey =
  | '0'
  | '1'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | '.'
  | 'backspace'
  | 'clear';

export interface KeypadTransitionResult {
  nextValue: string;
  exceedsMax?: boolean;
}

/**
 * Pure transition function for amount keypad keystrokes.
 * Enforces:
 * - EM2: 3rd decimal digit ignored
 * - EM3: Leading zeros ("007" -> 7), lone dot becomes "0.", only one dot allowed
 * - EM5: ₹1,00,00,000 maximum cap (1 crore = 1,000,000,000 paise).
 * - EM7: Backspace removes one char, clear resets to empty string.
 */
export function applyKeypadInput(
  current: string,
  key: KeypadKey
): KeypadTransitionResult {
  if (key === 'clear') {
    return { nextValue: '' };
  }

  if (key === 'backspace') {
    if (!current) return { nextValue: '' };
    return { nextValue: current.slice(0, -1) };
  }

  if (key === '.') {
    if (!current) {
      return { nextValue: '0.' };
    }
    if (current.includes('.')) {
      return { nextValue: current };
    }
    return { nextValue: current + '.' };
  }

  // Digits '0' through '9'
  if (current === '0') {
    if (key === '0') return { nextValue: '0' };
    return { nextValue: key };
  }

  if (current.includes('.')) {
    const [, decimals = ''] = current.split('.');
    if (decimals.length >= 2) {
      // Third decimal ignored (EM2)
      return { nextValue: current };
    }
  }

  const candidate = current + key;
  const parts = candidate.split('.');
  const rupeesPart = parts[0] || '0';
  const decimalsPart = (parts[1] || '').padEnd(2, '0').slice(0, 2);

  const rupeesNum = Number(rupeesPart);
  const decimalsNum = Number(decimalsPart);

  // ₹1,00,00,000 cap (EM5)
  if (rupeesNum > 10_000_000 || (rupeesNum === 10_000_000 && decimalsNum > 0)) {
    return { nextValue: current, exceedsMax: true };
  }

  return { nextValue: candidate };
}
