/**
 * Date formatting and boundary helpers for expenses.
 * Complies with Decision D17:
 * - Defaults to today (local device date).
 * - Maximum allowable date: tomorrow (time-zone tolerance).
 * - Minimum allowable date: 10 years ago.
 * - Stored as calendar date string 'YYYY-MM-DD' without time zone.
 */

export function getTodayDateString(): string {
  return formatCalendarDate(new Date());
}

export function formatCalendarDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseCalendarDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function getMinExpenseDate(): Date {
  const now = new Date();
  return new Date(now.getFullYear() - 10, now.getMonth(), now.getDate());
}

export function getMaxExpenseDate(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
}

export function formatDateChipLabel(dateStr: string): string {
  const todayStr = getTodayDateString();
  if (dateStr === todayStr) {
    return 'Today';
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = formatCalendarDate(yesterday);
  if (dateStr === yesterdayStr) {
    return 'Yesterday';
  }

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = formatCalendarDate(tomorrow);
  if (dateStr === tomorrowStr) {
    return 'Tomorrow';
  }

  const date = parseCalendarDate(dateStr);
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  });
}

export function formatDateSectionHeader(dateStr: string): string {
  const todayStr = getTodayDateString();
  if (dateStr === todayStr) {
    return 'Today';
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = formatCalendarDate(yesterday);
  if (dateStr === yesterdayStr) {
    return 'Yesterday';
  }

  const date = parseCalendarDate(dateStr);
  const isCurrentYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: isCurrentYear ? undefined : 'numeric',
  });
}

export interface ExpenseDateSection<T> {
  title: string;
  date: string;
  data: T[];
}

/**
 * Groups an array of items with `expense_date` into SectionList sections
 * preserving order (newest first).
 */
export function groupExpensesByDate<T extends { expense_date: string }>(
  items: T[]
): ExpenseDateSection<T>[] {
  const sections: ExpenseDateSection<T>[] = [];
  const map = new Map<string, ExpenseDateSection<T>>();

  for (const item of items) {
    let section = map.get(item.expense_date);
    if (!section) {
      section = {
        title: formatDateSectionHeader(item.expense_date),
        date: item.expense_date,
        data: [],
      };
      map.set(item.expense_date, section);
      sections.push(section);
    }
    section.data.push(item);
  }

  return sections;
}

