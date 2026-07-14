/**
 * Pure helpers — container/codec selection, byte & duration formatting,
 * filename building. All side-effect free so they can be unit tested.
 */

/**
 * Candidate output types in preference order. Safari 17+ can record MP4/H.264
 * directly (best for sharing); Chrome/Firefox get VP9/Opus WebM, falling back
 * through VP8 and a bare container.
 */
export const VIDEO_MIME_CANDIDATES: readonly string[] = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=h264,opus',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

/**
 * Pick the first supported output type. `isSupported` is injected so this is
 * testable without a real MediaRecorder (pass `MediaRecorder.isTypeSupported`).
 * Returns null if nothing in the list is supported.
 */
export function pickVideoMimeType(
  isSupported: (type: string) => boolean,
  candidates: readonly string[] = VIDEO_MIME_CANDIDATES,
): string | null {
  for (const type of candidates) {
    try {
      if (isSupported(type)) return type;
    } catch {
      /* isTypeSupported can throw on some engines — treat as unsupported */
    }
  }
  return null;
}

/** File extension for a chosen MIME type. */
export function extForMime(mimeType: string): string {
  return mimeType.toLowerCase().startsWith('video/mp4') ? 'mp4' : 'webm';
}

/** Short human label for a MIME type, e.g. "MP4 · H.264" or "WebM · VP9". */
export function codecLabel(mimeType: string): string {
  const lower = mimeType.toLowerCase();
  const container = lower.startsWith('video/mp4') ? 'MP4' : 'WebM';
  let codec = '';
  if (lower.includes('vp9')) codec = 'VP9';
  else if (lower.includes('vp8')) codec = 'VP8';
  else if (lower.includes('avc1') || lower.includes('h264')) codec = 'H.264';
  return codec ? `${container} · ${codec}` : container;
}

/** Format a byte count as a compact human string. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[i]}`;
}

/** Format milliseconds as M:SS or H:MM:SS. */
export function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Average throughput as MB/s given bytes and elapsed ms. */
export function formatThroughput(bytes: number, ms: number): string {
  if (ms <= 0) return '0.0 MB/s';
  const mbPerSec = bytes / (1024 * 1024) / (ms / 1000);
  return `${mbPerSec.toFixed(1)} MB/s`;
}

/** Zero-padded local timestamp used in filenames. */
export function timestampSlug(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}` +
    `_${p(date.getHours())}-${p(date.getMinutes())}-${p(date.getSeconds())}`
  );
}

/** Build a download filename like `screenwell_2026-07-15_14-03-11.webm`. */
export function buildFilename(mimeType: string, date: Date, prefix = 'screenwell'): string {
  return `${prefix}_${timestampSlug(date)}.${extForMime(mimeType)}`;
}
