import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ExpenseForm } from '@/components/expenses/ExpenseForm';

export default function AddExpenseModalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <ExpenseForm
      mode="add"
      groupId={id || ''}
    />
  );
}
