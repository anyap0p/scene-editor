/** Default playback speed multiplier (1 = normal). */
export const DEFAULT_PLAYBACK_SPEED = 1;

export function isGifSrc(src?: string): boolean {
  if (!src) return false;
  if (src.startsWith('data:image/gif')) return true;
  const path = src.split('?')[0].split('#')[0].toLowerCase();
  return path.endsWith('.gif');
}

export function playbackSpeedOf(speed?: number): number {
  if (speed == null || !Number.isFinite(speed)) return DEFAULT_PLAYBACK_SPEED;
  return Math.min(4, Math.max(0.1, speed));
}

/** Scene-local media time in seconds, scaled by playback speed. */
export function scaledLocalTime(sceneTime: number, start: number, speed?: number): number {
  return Math.max(0, (sceneTime - start) * playbackSpeedOf(speed));
}
