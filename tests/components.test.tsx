import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import { EmptyState } from '../src/components/EmptyState';
import { MoneyText } from '../src/components/MoneyText';
import { appLightTheme } from '../src/lib/theme';

async function renderWithTheme(ui: React.ReactElement) {
  return await render(<PaperProvider theme={appLightTheme}>{ui}</PaperProvider>);
}

describe('EmptyState component', () => {
  it('renders title and message correctly', async () => {
    const { getByText } = await renderWithTheme(
      <EmptyState
        title="No groups yet"
        message="Create your first group to start splitting bills."
      />
    );

    expect(getByText('No groups yet')).toBeTruthy();
    expect(getByText('Create your first group to start splitting bills.')).toBeTruthy();
  });

  it('renders action button and triggers onAction callback when clicked', async () => {
    const handleAction = jest.fn();
    const { getByText } = await renderWithTheme(
      <EmptyState
        title="No expenses"
        message="Add an expense to get started."
        actionTitle="Add Expense"
        onAction={handleAction}
      />
    );

    const button = getByText('Add Expense');
    expect(button).toBeTruthy();
    fireEvent.press(button);
    expect(handleAction).toHaveBeenCalledTimes(1);
  });
});

describe('MoneyText component', () => {
  it('renders formatted currency amount', async () => {
    const { getByText } = await renderWithTheme(<MoneyText amountMinor={12345} />);
    expect(getByText('₹123.45')).toBeTruthy();
  });

  it('renders label when showLabel is true', async () => {
    const { getByText } = await renderWithTheme(
      <MoneyText amountMinor={50000} showLabel tone="owed" />
    );
    expect(getByText('YOU ARE OWED')).toBeTruthy();
    expect(getByText('₹500.00')).toBeTruthy();
  });

  it('renders negative amounts with owe label', async () => {
    const { getByText } = await renderWithTheme(
      <MoneyText amountMinor={-250} showLabel tone="owe" />
    );
    expect(getByText('YOU OWE')).toBeTruthy();
    expect(getByText('-₹2.50')).toBeTruthy();
  });
});
