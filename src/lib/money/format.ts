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
