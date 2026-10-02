import AsyncStorage from '@react-native-async-storage/async-storage';

const PENDING_LINK_KEY = '@splitease/pending_link';

/**
 * Normalizes deep link URLs (e.g. splitease://group/123 -> /group/123)
 */
export function normalizeDeepLink(url: string): string | null {
  if (!url || typeof url !== 'string' || !url.trim()) return null;

  try {
    let cleanUrl = url.trim();
    // Strip scheme prefix (e.g. splitease://, exp://, etc.)
    const schemeMatch = cleanUrl.match(/^[a-zA-Z0-9+.-]+:\/\/(.*)$/);
    const pathAndQuery = schemeMatch ? schemeMatch[1] : cleanUrl;

    const withoutLeadingSlashes = pathAndQuery.replace(/^\/+/, '');
    if (!withoutLeadingSlashes) return null;

    const [pathPart, queryPart] = withoutLeadingSlashes.split('?');
    if (!pathPart) return null;

    const fullPath = `/${pathPart}`;

    // Do not save auth routes as pending links
    if (
      fullPath.includes('welcome') ||
      fullPath.includes('login') ||
      fullPath.includes('otp') ||
      fullPath === '/'
    ) {
      return null;
    }

    if (queryPart && queryPart.trim().length > 0) {
      return `${fullPath}?${queryPart.trim()}`;
    }

    return fullPath;
  } catch {
    return null;
  }
}

export async function savePendingLink(url: string): Promise<void> {
  try {
    const normalized = normalizeDeepLink(url);
    if (normalized) {
      await AsyncStorage.setItem(PENDING_LINK_KEY, normalized);
    }
  } catch {
    // Non-fatal
  }
}

export async function getPendingLink(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(PENDING_LINK_KEY);
  } catch {
    return null;
  }
}

export async function clearPendingLink(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PENDING_LINK_KEY);
  } catch {
    // Non-fatal
  }
}

export async function consumePendingLink(): Promise<string | null> {
  try {
    const link = await AsyncStorage.getItem(PENDING_LINK_KEY);
    if (link) {
      await AsyncStorage.removeItem(PENDING_LINK_KEY);
    }
    return link;
  } catch {
    return null;
  }
}
