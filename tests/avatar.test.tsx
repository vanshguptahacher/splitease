import React from 'react';
import { render } from '@testing-library/react-native';
import { Avatar, getInitials } from '../src/components/Avatar';

describe('Avatar & getInitials', () => {
  describe('getInitials', () => {
    it('extracts two initials from full name', () => {
      expect(getInitials('Vansh Gupta')).toBe('VG');
      expect(getInitials('John Doe')).toBe('JD');
    });

    it('extracts first two letters from single word name', () => {
      expect(getInitials('Vansh')).toBe('VA');
      expect(getInitials('Alex')).toBe('AL');
    });

    it('returns fallback U for empty or whitespace strings', () => {
      expect(getInitials('')).toBe('U');
      expect(getInitials('   ')).toBe('U');
      expect(getInitials(null)).toBe('U');
      expect(getInitials(undefined)).toBe('U');
    });
  });

  describe('Avatar component render', () => {
    it('renders initials when no URL is provided (Case A12)', async () => {
      const { getByText } = await render(<Avatar name="Vansh Gupta" />);
      expect(getByText('VG')).toBeTruthy();
    });

    it('renders image when valid photo URL is provided', async () => {
      const { getByLabelText } = await render(
        <Avatar
          url="https://lh3.googleusercontent.com/a/photo.jpg"
          name="Vansh Gupta"
          accessibilityLabel="Profile photo"
        />
      );
      expect(getByLabelText('Profile photo')).toBeTruthy();
    });
  });
});
