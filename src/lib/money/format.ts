/**
 * Money is always stored as integer paise.
 * This function is display-only; never use it for calculations.
 *
 * Formats paise into INR string with Indian digit grouping:
 * e.g., 12345678 -> "₹1,23,456.78"
 */
export function formatMoney(amountMinor: number): string {
  const sign = amountMinor < 0 ? '-' : '';
  const abs = Math.abs(amountMinor);
  const rupees = Math.floor(abs / 100).toString();
  const paise = (abs % 100).toString().padStart(2, '0');

  // Indian grouping: last 3 digits, then groups of 2 (e.g. 1,23,456)
  const grouped =
    rupees.length > 3
      ? rupees.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + rupees.slice(-3)
      : rupees;

  return `${sign}₹${grouped}.${paise}`;
}

/**
 * Formats paise into compact INR string:
 * Drops trailing '.00' so 120000 -> "₹1,200", while keeping decimals if present (e.g. "₹1,200.50").
 */
export function formatMoneyCompact(amountMinor: number): string {
  const formatted = formatMoney(amountMinor);
  return formatted.endsWith('.00') ? formatted.slice(0, -3) : formatted;
}

/**
 * Formats an amount (either integer paise or a raw input text string)
 * into a screen-reader friendly description: e.g. "1,200 rupees and 50 paise".
 * Handles singular ("1 rupee", "1 paisa") and zero states ("0 rupees").
 * Required for EU6 accessibility compliance.
 */
export function toAccessibleMoneyString(amount: number | string): string {
  let rupees = 0;
  let paise = 0;

  if (typeof amount === 'number') {
    const abs = Math.abs(amount);
    rupees = Math.floor(abs / 100);
    paise = abs % 100;
  } else if (typeof amount === 'string') {
    const cleaned = amount.replace(/[\s,₹]/g, '');
    if (!cleaned) return '0 rupees';
    const parts = cleaned.split('.');
    rupees = Number(parts[0] || '0');
    if (isNaN(rupees)) rupees = 0;
    const decimalsStr = (parts[1] || '').padEnd(2, '0').slice(0, 2);
    paise = Number(decimalsStr);
    if (isNaN(paise)) paise = 0;
  }

  const formattedRupees = rupees.toLocaleString('en-IN');
  const rupeeUnit = rupees === 1 ? 'rupee' : 'rupees';
  const paisaUnit = paise === 1 ? 'paisa' : 'paise';

  if (rupees === 0 && paise === 0) {
    return '0 rupees';
  }
  if (rupees > 0 && paise === 0) {
    return `${formattedRupees} ${rupeeUnit}`;
  }
  if (rupees === 0 && paise > 0) {
    return `${paise} ${paisaUnit}`;
  }
  return `${formattedRupees} ${rupeeUnit} and ${paise} ${paisaUnit}`;
}
