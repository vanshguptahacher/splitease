import { formatMoney } from '../src/lib/money';

describe('formatMoney (Indian digit grouping)', () => {
  it('formats 0 paise as ₹0.00', () => {
    expect(formatMoney(0)).toBe('₹0.00');
  });

  it('formats 5 paise as ₹0.05', () => {
    expect(formatMoney(5)).toBe('₹0.05');
  });

  it('formats 12345 paise as ₹123.45', () => {
    expect(formatMoney(12345)).toBe('₹123.45');
  });

  it('formats 100000 paise as ₹1,000.00', () => {
    expect(formatMoney(100000)).toBe('₹1,000.00');
  });

  it('formats 12345678 paise as ₹1,23,456.78', () => {
    expect(formatMoney(12345678)).toBe('₹1,23,456.78');
  });

  it('formats 99999999 paise as ₹9,99,999.99', () => {
    expect(formatMoney(99999999)).toBe('₹9,99,999.99');
  });

  it('formats negative amounts correctly (-250 paise -> -₹2.50)', () => {
    expect(formatMoney(-250)).toBe('-₹2.50');
  });
});
