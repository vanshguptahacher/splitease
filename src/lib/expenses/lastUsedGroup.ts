import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = '@splitease_last_group_';

/**
 * Retrieves the last used group ID for quick add preselection (EA16).
 */
export async function getLastUsedGroupId(userId: string): Promise<string | null> {
  if (!userId) return null;
  try {
    return await AsyncStorage.getItem(`${PREFIX}${userId}`);
  } catch {
    return null;
  }
}

/**
 * Persists the last used group ID for quick add preselection.
 */
export async function setLastUsedGroupId(userId: string, groupId: string): Promise<void> {
  if (!userId || !groupId) return;
  try {
    await AsyncStorage.setItem(`${PREFIX}${userId}`, groupId);
  } catch {
    // Non-fatal
  }
}

/**
 * Clears the last used group ID (e.g. on sign-out).
 */
export async function clearLastUsedGroupId(userId: string): Promise<void> {
  if (!userId) return;
  try {
    await AsyncStorage.removeItem(`${PREFIX}${userId}`);
  } catch {
    // Non-fatal
  }
}
