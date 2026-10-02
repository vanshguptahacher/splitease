import {
  normalizeEmail,
  normalizeName,
  normalizeUpiId,
  emailSchema,
  nameSchema,
  upiSchema,
  profileFormSchema,
} from '@/lib/validators';

describe('validators', () => {
  describe('normalizeEmail and emailSchema', () => {
    it('normalizes email with uppercase and whitespace', () => {
      expect(normalizeEmail('  Test.User@Example.COM  ')).toBe('test.user@example.com');
    });

    it('validates correct email with emailSchema', () => {
      const res = emailSchema.safeParse('  HELLO@WORLD.COM  ');
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data).toBe('hello@world.com');
      }
    });

    it('rejects invalid email formats', () => {
      expect(emailSchema.safeParse('').success).toBe(false);
      expect(emailSchema.safeParse('not-an-email').success).toBe(false);
      expect(emailSchema.safeParse('@missinguser.com').success).toBe(false);
      expect(emailSchema.safeParse('user@').success).toBe(false);
    });
  });

  describe('normalizeName and nameSchema', () => {
    it('trims and collapses internal whitespaces', () => {
      expect(normalizeName('   John    Doe   Smith   ')).toBe('John Doe Smith');
    });

    it('accepts valid 1-character name', () => {
      const res = nameSchema.safeParse('A');
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data).toBe('A');
      }
    });

    it('accepts valid 50-character name', () => {
      const longName = 'A'.repeat(50);
      const res = nameSchema.safeParse(longName);
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data).toBe(longName);
      }
    });

    it('rejects 51-character name', () => {
      const tooLong = 'A'.repeat(51);
      const res = nameSchema.safeParse(tooLong);
      expect(res.success).toBe(false);
    });

    it('rejects empty or whitespace-only name', () => {
      expect(nameSchema.safeParse('').success).toBe(false);
      expect(nameSchema.safeParse('     ').success).toBe(false);
    });

    it('supports unicode emojis in name', () => {
      const res = nameSchema.safeParse('Vansh 🚀');
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data).toBe('Vansh 🚀');
      }
    });
  });

  describe('normalizeUpiId and upiSchema', () => {
    it('converts empty string, spaces, or undefined to null', () => {
      expect(normalizeUpiId('')).toBeNull();
      expect(normalizeUpiId('   ')).toBeNull();
      expect(normalizeUpiId(null)).toBeNull();
      expect(normalizeUpiId(undefined)).toBeNull();

      const emptyRes = upiSchema.safeParse('');
      expect(emptyRes.success).toBe(true);
      if (emptyRes.success) {
        expect(emptyRes.data).toBeNull();
      }

      const nullRes = upiSchema.safeParse(null);
      expect(nullRes.success).toBe(true);
      if (nullRes.success) {
        expect(nullRes.data).toBeNull();
      }
    });

    it('normalizes valid UPI ID to lowercase and trimmed', () => {
      const res = upiSchema.safeParse('  VanshGupta@OkICICI  ');
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data).toBe('vanshgupta@okicici');
      }
    });

    it('accepts valid Indian UPI handles', () => {
      const handles = [
        'user@okhdfcbank',
        '9876543210@paytm',
        'john.doe@ibl',
        'my_shop-123@axl',
      ];
      for (const handle of handles) {
        const res = upiSchema.safeParse(handle);
        expect(res.success).toBe(true);
      }
    });

    it('rejects invalid UPI IDs', () => {
      const invalidHandles = [
        'missinghandle',
        '@okhdfcbank',
        'user@',
        'u@okhdfc', // user prefix < 2 chars
        'user@123', // bank handle doesn't start with letter
        'user space@okaxis',
      ];
      for (const handle of invalidHandles) {
        const res = upiSchema.safeParse(handle);
        expect(res.success).toBe(false);
      }
    });
  });

  describe('profileFormSchema', () => {
    it('validates valid profile form with both name and upi_id', () => {
      const res = profileFormSchema.safeParse({
        name: '  Rahul Sharma  ',
        upi_id: 'RAHUL@OKSBI',
      });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.name).toBe('  Rahul Sharma  ');
        expect(normalizeName(res.data.name)).toBe('Rahul Sharma');
        expect(normalizeUpiId(res.data.upi_id)).toBe('rahul@oksbi');
      }
    });

    it('validates profile with empty upi_id', () => {
      const res = profileFormSchema.safeParse({
        name: 'Rahul Sharma',
        upi_id: '',
      });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(normalizeUpiId(res.data.upi_id)).toBeNull();
      }
    });

    it('fails when name is invalid even if upi_id is valid', () => {
      const res = profileFormSchema.safeParse({
        name: '   ',
        upi_id: 'rahul@oksbi',
      });
      expect(res.success).toBe(false);
    });
  });
});
