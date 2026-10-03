import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import { AmountDisplay } from '../src/components/expenses/AmountDisplay';
import { AmountKeypad } from '../src/components/expenses/AmountKeypad';
import { appLightTheme } from '../src/lib/theme';

async function renderWithTheme(ui: React.ReactElement) {
  return await render(<PaperProvider theme={appLightTheme}>{ui}</PaperProvider>);
}

describe('AmountDisplay component', () => {
  it('renders default placeholder "0" when no amount is given', async () => {
    const { getByText, getByLabelText } = await renderWithTheme(<AmountDisplay />);
    expect(getByText('0')).toBeTruthy();
    expect(getByText('₹ ')).toBeTruthy();
    expect(getByLabelText('0 rupees')).toBeTruthy();
  });

  it('renders live typed string with Indian grouping and accessible label (EM1, EU6)', async () => {
    const { getByText, getByLabelText } = await renderWithTheme(
      <AmountDisplay amountText="1234567.5" />
    );
    expect(getByText('12,34,567.5')).toBeTruthy();
    expect(getByLabelText('12,34,567 rupees and 50 paise')).toBeTruthy();
  });

  it('renders minor paise amount correctly', async () => {
    const { getByText, getByLabelText } = await renderWithTheme(
      <AmountDisplay amountMinor={10050} />
    );
    expect(getByText('100.50')).toBeTruthy();
    expect(getByLabelText('100 rupees and 50 paise')).toBeTruthy();
  });
});

describe('AmountKeypad component', () => {
  it('renders all 12 keys with proper accessibility labels (EU1, EU6)', async () => {
    const { getByLabelText } = await renderWithTheme(
      <AmountKeypad value="" onChange={jest.fn()} />
    );

    for (let i = 0; i <= 9; i++) {
      expect(getByLabelText(String(i))).toBeTruthy();
    }
    expect(getByLabelText('Decimal point')).toBeTruthy();
    expect(getByLabelText('Delete')).toBeTruthy();
  });

  it('typing digits calls onChange with updated value', async () => {
    const handleChange = jest.fn();
    const { getByLabelText } = await renderWithTheme(
      <AmountKeypad value="12" onChange={handleChange} />
    );

    fireEvent.press(getByLabelText('5'));
    expect(handleChange).toHaveBeenCalledWith('125');
  });

  it('pressing backspace removes a character (EM7)', async () => {
    const handleChange = jest.fn();
    const { getByLabelText } = await renderWithTheme(
      <AmountKeypad value="125" onChange={handleChange} />
    );

    fireEvent.press(getByLabelText('Delete'));
    expect(handleChange).toHaveBeenCalledWith('12');
  });

  it('long-pressing backspace clears all (EM7)', async () => {
    const handleChange = jest.fn();
    const { getByLabelText } = await renderWithTheme(
      <AmountKeypad value="12345" onChange={handleChange} />
    );

    fireEvent(getByLabelText('Delete'), 'longPress');
    expect(handleChange).toHaveBeenCalledWith('');
  });

  it('exceeding 1 crore triggers onExceedMax (EM5)', async () => {
    const handleChange = jest.fn();
    const handleExceedMax = jest.fn();
    const { getByLabelText } = await renderWithTheme(
      <AmountKeypad
        value="10000000"
        onChange={handleChange}
        onExceedMax={handleExceedMax}
      />
    );

    fireEvent.press(getByLabelText('5'));
    expect(handleExceedMax).toHaveBeenCalled();
    expect(handleChange).not.toHaveBeenCalled();
  });
});
