import { generateUuid } from '@/lib/uuid';

/**
 * Creates a unique client request ID (UUID) per form session.
 * Reused on every retry of the same save to ensure idempotency.
 */
export function createClientRequestId(): string {
  return generateUuid();
}
