import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  clearPendingLink,
  consumePendingLink,
  getPendingLink,
  normalizeDeepLink,
  savePendingLink,
} from '../src/lib/auth/pendingLink';

describe('pendingLink helpers', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  describe('normalizeDeepLink', () => {
    it('normalizes custom scheme deep link to route path', () => {
      expect(normalizeDeepLink('splitease://group/123')).toBe('/group/123');
    });

    it('normalizes web URLs (universal links)', () => {
      expect(normalizeDeepLink('https://splitease.app/join/ABCD-EFGH')).toBe('/join/ABCD-EFGH');
    });

    it('normalizes links with trailing slash (Case GJ17)', () => {
      expect(normalizeDeepLink('splitease://join/')).toBe('/join');
    });

    it('preserves query parameters', () => {
      expect(normalizeDeepLink('splitease://join/invite_code?ref=user456')).toBe(
        '/join/invite_code?ref=user456'
      );
    });

    it('ignores auth routes so login loops are prevented', () => {
      expect(normalizeDeepLink('splitease://(auth)/welcome')).toBeNull();
      expect(normalizeDeepLink('splitease://welcome')).toBeNull();
      expect(normalizeDeepLink('splitease://otp')).toBeNull();
    });

    it('returns null for invalid URLs', () => {
      expect(normalizeDeepLink('')).toBeNull();
      expect(normalizeDeepLink('splitease://')).toBeNull();
    });
  });

  describe('storage operations', () => {
    it('saves, retrieves, and clears pending links', () => {
      return (async () => {
        await savePendingLink('splitease://group/456');
        const saved = await getPendingLink();
        expect(saved).toBe('/group/456');

        await clearPendingLink();
        const cleared = await getPendingLink();
        expect(cleared).toBeNull();
      })();
    });

    it('consumes pending link by reading and deleting in one step', () => {
      return (async () => {
        await savePendingLink('splitease://group/789');
        const consumed = await consumePendingLink();
        expect(consumed).toBe('/group/789');

        const afterConsume = await getPendingLink();
        expect(afterConsume).toBeNull();
      })();
    });
  });
});
