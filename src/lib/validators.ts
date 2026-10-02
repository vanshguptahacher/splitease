import { z } from 'zod';

/**
 * Normalizes email by trimming whitespace and converting to lowercase.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Normalizes name by trimming leading/trailing whitespace and collapsing multiple spaces.
 */
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/**
 * Normalizes UPI ID by trimming, lowercasing, and mapping empty strings to null.
 */
export function normalizeUpiId(upiId?: string | null): string | null {
  if (!upiId) return null;
  const trimmed = upiId.trim().toLowerCase();
  return trimmed === '' ? null : trimmed;
}

/**
 * Strict regex for UPI ID matching database constraint:
 * ^[a-z0-9._-]{2,255}@[a-z][a-z0-9.-]{1,63}$
 */
export const UPI_ID_REGEX = /^[a-z0-9._-]{2,255}@[a-z][a-z0-9.-]{1,63}$/;

/**
 * Zod schema for email address.
 */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Email is required')
  .email('Please enter a valid email address');

/**
 * Zod schema for user display name (1–50 chars, collapsed whitespace, emojis allowed).
 */
export const nameSchema = z
  .string()
  .transform((val) => normalizeName(val))
  .refine((val) => val.length >= 1, 'Name is required')
  .refine((val) => val.length <= 50, 'Name must be 50 characters or less');

/**
 * Zod schema for UPI ID: optional, empty string maps to null, lowercase, valid format.
 */
export const upiSchema = z
  .string()
  .optional()
  .nullable()
  .transform((val) => normalizeUpiId(val))
  .refine(
    (val) => val === null || UPI_ID_REGEX.test(val),
    'Enter a valid UPI ID (e.g. name@bank)'
  );

/**
 * Schema for Profile form input values in React Hook Form.
 */
export const profileFormSchema = z.object({
  name: z
    .string()
    .refine((val) => normalizeName(val).length >= 1, 'Name is required')
    .refine(
      (val) => normalizeName(val).length <= 50,
      'Name must be 50 characters or less'
    ),
  upi_id: z
    .string()
    .optional()
    .refine(
      (val) => {
        const normalized = normalizeUpiId(val);
        return normalized === null || UPI_ID_REGEX.test(normalized);
      },
      'Enter a valid UPI ID (e.g. name@bank)'
    ),
});

export type ProfileFormValues = {
  name: string;
  upi_id?: string;
};
