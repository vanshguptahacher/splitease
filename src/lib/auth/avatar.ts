import { launchImageLibraryAsync, ImagePickerAsset } from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { supabase } from '@/lib/supabase/client';
import { log } from '@/lib/log';

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = new Uint8Array(256);
for (let i = 0; i < CHARS.length; i++) {
  LOOKUP[CHARS.charCodeAt(i)] = i;
}

/**
 * Pure Base64 to ArrayBuffer decoder.
 * Compatible with Node, Hermes, Web, and Jest.
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const clean = base64.replace(/=+$/, '');
  const len = clean.length;
  const bufferLength = (len * 3) >> 2;
  const arrayBuffer = new ArrayBuffer(bufferLength);
  const bytes = new Uint8Array(arrayBuffer);

  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const encoded1 = LOOKUP[clean.charCodeAt(i)];
    const encoded2 = LOOKUP[clean.charCodeAt(i + 1)];
    const encoded3 = LOOKUP[clean.charCodeAt(i + 2)];
    const encoded4 = LOOKUP[clean.charCodeAt(i + 3)];

    bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
    if (i + 2 < len) {
      bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
    }
    if (i + 3 < len) {
      bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63);
    }
  }

  return arrayBuffer;
}

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Resolves the public display URL for a user's avatar.
 * Priority:
 * 1. Storage bucket path (custom uploaded photo)
 * 2. OAuth provider URL (Google avatar)
 * 3. null (fallback to deterministic initials)
 */
export function getAvatarDisplayUrl(
  avatarPath?: string | null,
  avatarUrl?: string | null
): string | null {
  if (avatarPath) {
    const { data } = supabase.storage.from('avatars').getPublicUrl(avatarPath);
    return data.publicUrl;
  }
  if (avatarUrl) {
    return avatarUrl;
  }
  return null;
}

export interface PickedAvatarResult {
  localUri: string;
  base64: string;
}

/**
 * Opens system photo picker, lets user crop to square,
 * resizes to 512x512, and compresses as JPEG.
 * Returns null if user cancelled.
 */
export async function pickAndProcessAvatar(): Promise<PickedAvatarResult | null> {
  const result = await launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) {
    return null;
  }

  const asset: ImagePickerAsset = result.assets[0];
  const manipulated = await manipulateAsync(
    asset.uri,
    [{ resize: { width: 512, height: 512 } }],
    { compress: 0.8, format: SaveFormat.JPEG, base64: true }
  );

  if (!manipulated.base64) {
    throw new Error('Image manipulation failed to produce image data');
  }

  return {
    localUri: manipulated.uri,
    base64: manipulated.base64,
  };
}

/**
 * Uploads processed avatar image to Supabase Storage bucket `avatars`.
 * Enforces database constraint path: `<userId>/<uuid>.jpg`.
 */
export async function uploadAvatarImage(
  userId: string,
  base64Data: string
): Promise<string> {
  const uuid = generateUuid();
  const avatarPath = `${userId}/${uuid}.jpg`;
  const arrayBuffer = base64ToArrayBuffer(base64Data);

  const { error } = await supabase.storage.from('avatars').upload(avatarPath, arrayBuffer, {
    contentType: 'image/jpeg',
    upsert: false,
  });

  if (error) {
    log.error('Supabase storage avatar upload failed', { error });
    throw error;
  }

  return avatarPath;
}

/**
 * Best-effort deletion of an avatar file from Supabase Storage.
 */
export async function deleteAvatarFile(avatarPath: string): Promise<void> {
  if (!avatarPath) return;
  try {
    const { error } = await supabase.storage.from('avatars').remove([avatarPath]);
    if (error) {
      log.warn('Could not delete old avatar from storage', { avatarPath, error });
    }
  } catch (err) {
    log.warn('Error deleting old avatar from storage', { avatarPath, err });
  }
}
