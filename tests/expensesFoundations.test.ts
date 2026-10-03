import { EXPENSE_CATEGORIES, getCategory } from '../src/lib/expenses/categories';
import { createClientRequestId } from '../src/lib/expenses/clientRequestId';
import { getParticipantNotMemberId, toFriendlyMessage } from '../src/lib/errors';
import {
  applyKeypadInput,
  formatAmountInput,
  parseAmountToMinor,
  toAccessibleMoneyString,
} from '../src/lib/money';

describe('Phase 4.5 Foundations: Categories', () => {
  it('defines exactly the 10 PRD fixed categories', () => {
    expect(EXPENSE_CATEGORIES).toHaveLength(10);
    const keys = EXPENSE_CATEGORIES.map((c) => c.key);
    expect(keys).toEqual([
      'food',
      'groceries',
      'travel',
      'stay',
      'fuel',
      'shopping',
      'bills',
      'entertainment',
      'rent',
      'other',
    ]);
  });

  it('retrieves category by key or falls back to other', () => {
    const food = getCategory('food');
    expect(food.label).toBe('Food');
    expect(food.emoji).toBe('🍽️');

    const groceries = getCategory('groceries');
    expect(groceries.label).toBe('Groceries');
    expect(groceries.emoji).toBe('🛒');

    const unknown = getCategory('unknown_xyz');
    expect(unknown.key).toBe('other');
    expect(unknown.label).toBe('Other');

    const nullCategory = getCategory(null);
    expect(nullCategory.key).toBe('other');
  });
});

describe('Phase 4.5 Foundations: clientRequestId', () => {
  it('generates a valid UUID v4', () => {
    const id1 = createClientRequestId();
    const id2 = createClientRequestId();
    expect(id1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(id2).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(id1).not.toBe(id2);
  });
});

describe('Phase 4.5 Foundations: Phase 4 Error Mappings', () => {
  it('maps all Phase 4 expense error codes to friendly messages', () => {
    expect(toFriendlyMessage(new Error('expense_not_found'))).toBe(
      'This expense no longer exists.'
    );
    expect(toFriendlyMessage(new Error('not_allowed'))).toBe(
      'Only the person who added this expense or a group admin can change it.'
    );
    expect(toFriendlyMessage(new Error('expense_locked'))).toBe(
      "This expense includes someone who left the group, so it's locked. Add a new expense to correct it."
    );
    expect(toFriendlyMessage(new Error('expense_changed'))).toBe(
      "Someone just changed this expense. We've loaded the latest version."
    );
    expect(toFriendlyMessage(new Error('invalid_amount'))).toBe(
      'Enter an amount between ₹0.01 and ₹1,00,00,000.'
    );
    expect(toFriendlyMessage(new Error('invalid_date'))).toBe('Choose a valid date.');
    expect(toFriendlyMessage(new Error('invalid_description'))).toBe(
      'Keep the description under 100 characters.'
    );
    expect(toFriendlyMessage(new Error('invalid_category'))).toBe(
      'Pick a category from the list.'
    );
    expect(toFriendlyMessage(new Error('invalid_split_type'))).toBe(
      'Something went wrong. Please try again.'
    );
    expect(toFriendlyMessage(new Error('no_participants'))).toBe('Pick at least one person.');
    expect(toFriendlyMessage(new Error('too_many_participants'))).toBe(
      'A split can include at most 50 people.'
    );
    expect(toFriendlyMessage(new Error('duplicate_participant'))).toBe(
      'Something went wrong. Please try again.'
    );
    expect(toFriendlyMessage(new Error('invalid_split_value'))).toBe(
      'Check the amounts you entered for each person.'
    );
    expect(toFriendlyMessage(new Error('splits_dont_add_up'))).toBe(
      "The split doesn't add up to the total."
    );
    expect(toFriendlyMessage(new Error('payer_not_member'))).toBe(
      'The person who paid is no longer in this group.'
    );
  });

  it('handles participant_not_member with details and name resolver', () => {
    const errorWithDetail = {
      message: 'participant_not_member',
      details: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
    };

    // Without resolver
    expect(toFriendlyMessage(errorWithDetail)).toBe(
      'Someone in this split is no longer in this group.'
    );

    // With resolver
    const resolver = (id: string) => (id.startsWith('a1b2') ? 'Rahul' : undefined);
    expect(toFriendlyMessage(errorWithDetail, resolver)).toBe(
      'Rahul is no longer in this group.'
    );

    // Helper extract ID
    expect(getParticipantNotMemberId(errorWithDetail)).toBe(
      'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d'
    );
  });
});

describe('Phase 4.5 Foundations: AmountKeypad Keystroke Transitions (EM1-EM10)', () => {
  it('EM3: lone dot becomes "0." and second dot is ignored', () => {
    const r1 = applyKeypadInput('', '.');
    expect(r1.nextValue).toBe('0.');

    const r2 = applyKeypadInput('0.', '.');
    expect(r2.nextValue).toBe('0.');

    const r3 = applyKeypadInput('12.3', '.');
    expect(r3.nextValue).toBe('12.3');
  });

  it('EM3: leading zero replaced by non-zero digit ("007" -> 7)', () => {
    const r1 = applyKeypadInput('0', '0');
    expect(r1.nextValue).toBe('0');

    const r2 = applyKeypadInput('0', '7');
    expect(r2.nextValue).toBe('7');
  });

  it('EM2: third decimal digit is ignored', () => {
    const r1 = applyKeypadInput('12.34', '5');
    expect(r1.nextValue).toBe('12.34');
    expect(r1.exceedsMax).toBeFalsy();
  });

  it('EM5: ₹1,00,00,000 maximum cap enforced', () => {
    // Exactly 1 crore (10,000,000)
    const atMax = applyKeypadInput('1000000', '0');
    expect(atMax.nextValue).toBe('10000000');
    expect(atMax.exceedsMax).toBeFalsy();

    // Adding another digit past 1 crore is blocked
    const overMaxDigit = applyKeypadInput('10000000', '0');
    expect(overMaxDigit.nextValue).toBe('10000000');
    expect(overMaxDigit.exceedsMax).toBe(true);

    // Adding .00 to 1 crore is allowed
    const withDot = applyKeypadInput('10000000', '.');
    expect(withDot.nextValue).toBe('10000000.');
    const withZero = applyKeypadInput('10000000.', '0');
    expect(withZero.nextValue).toBe('10000000.0');
    const withTwoZeros = applyKeypadInput('10000000.0', '0');
    expect(withTwoZeros.nextValue).toBe('10000000.00');

    // Adding non-zero paise over 1 crore is blocked
    const withOnePaisa = applyKeypadInput('10000000.', '1');
    expect(withOnePaisa.nextValue).toBe('10000000.');
    expect(withOnePaisa.exceedsMax).toBe(true);
  });

  it('EM6: ₹0.01 is valid', () => {
    let val = '';
    val = applyKeypadInput(val, '.').nextValue; // "0."
    val = applyKeypadInput(val, '0').nextValue; // "0.0"
    val = applyKeypadInput(val, '1').nextValue; // "0.01"
    expect(val).toBe('0.01');
    expect(parseAmountToMinor(val)).toBe(1);
  });

  it('EM7: backspace removes one char, clear resets to empty', () => {
    expect(applyKeypadInput('123', 'backspace').nextValue).toBe('12');
    expect(applyKeypadInput('1', 'backspace').nextValue).toBe('');
    expect(applyKeypadInput('', 'backspace').nextValue).toBe('');
    expect(applyKeypadInput('12345', 'clear').nextValue).toBe('');
  });

  it('EM1 & EM10: live Indian grouping formatting', () => {
    expect(formatAmountInput('1234567')).toBe('12,34,567');
    expect(formatAmountInput('1234567.5')).toBe('12,34,567.5');
    expect(formatAmountInput('10000000')).toBe('1,00,00,000');
    expect(formatAmountInput('100')).toBe('100');
    expect(formatAmountInput('1000')).toBe('1,000');
    expect(formatAmountInput('')).toBe('');
  });
});

describe('Phase 4.5 Foundations: Accessibility Audio Formatting (EU6)', () => {
  it('formats amounts for screen readers correctly', () => {
    expect(toAccessibleMoneyString('1234.50')).toBe('1,234 rupees and 50 paise');
    expect(toAccessibleMoneyString(123450)).toBe('1,234 rupees and 50 paise');
    expect(toAccessibleMoneyString('100')).toBe('100 rupees');
    expect(toAccessibleMoneyString(10000)).toBe('100 rupees');
    expect(toAccessibleMoneyString('0.50')).toBe('50 paise');
    expect(toAccessibleMoneyString('0.01')).toBe('1 paisa');
    expect(toAccessibleMoneyString('1.01')).toBe('1 rupee and 1 paisa');
    expect(toAccessibleMoneyString('1.00')).toBe('1 rupee');
    expect(toAccessibleMoneyString('')).toBe('0 rupees');
    expect(toAccessibleMoneyString(0)).toBe('0 rupees');
  });
});
