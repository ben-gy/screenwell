import { describe, expect, it } from 'vitest';
import {
  buildFilename,
  codecLabel,
  extForMime,
  formatBytes,
  formatDuration,
  formatThroughput,
  pickVideoMimeType,
  timestampSlug,
  VIDEO_MIME_CANDIDATES,
} from '../src/format';

describe('pickVideoMimeType', () => {
  it('returns the first supported candidate in preference order', () => {
    const supported = (t: string) => t.startsWith('video/webm;codecs=vp9');
    expect(pickVideoMimeType(supported)).toBe('video/webm;codecs=vp9,opus');
  });

  it('prefers MP4/H.264 when the engine supports it (Safari-like)', () => {
    const supported = (t: string) => t.startsWith('video/mp4');
    expect(pickVideoMimeType(supported)).toBe('video/mp4;codecs=avc1.42E01E,mp4a.40.2');
  });

  it('falls through to bare video/webm', () => {
    const supported = (t: string) => t === 'video/webm';
    expect(pickVideoMimeType(supported)).toBe('video/webm');
  });

  it('returns null when nothing is supported', () => {
    expect(pickVideoMimeType(() => false)).toBeNull();
  });

  it('treats a throwing isTypeSupported as unsupported', () => {
    const supported = (t: string) => {
      if (t.startsWith('video/mp4')) throw new Error('boom');
      return t === 'video/webm';
    };
    expect(pickVideoMimeType(supported)).toBe('video/webm');
  });

  it('every candidate maps to a known extension', () => {
    for (const c of VIDEO_MIME_CANDIDATES) {
      expect(['mp4', 'webm']).toContain(extForMime(c));
    }
  });
});

describe('extForMime', () => {
  it('maps mp4 types to mp4', () => {
    expect(extForMime('video/mp4;codecs=avc1')).toBe('mp4');
  });
  it('maps everything else to webm', () => {
    expect(extForMime('video/webm;codecs=vp9')).toBe('webm');
    expect(extForMime('')).toBe('webm');
  });
});

describe('codecLabel', () => {
  it('labels VP9 WebM', () => {
    expect(codecLabel('video/webm;codecs=vp9,opus')).toBe('WebM · VP9');
  });
  it('labels H.264 MP4', () => {
    expect(codecLabel('video/mp4;codecs=avc1.42E01E,mp4a.40.2')).toBe('MP4 · H.264');
  });
  it('labels a bare container without a codec', () => {
    expect(codecLabel('video/webm')).toBe('WebM');
  });
});

describe('formatBytes', () => {
  it('handles bytes, KB, MB, GB', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe('3.0 GB');
  });
  it('guards against negatives and NaN', () => {
    expect(formatBytes(-10)).toBe('0 B');
    expect(formatBytes(NaN)).toBe('0 B');
  });
  it('drops decimals for large magnitudes', () => {
    expect(formatBytes(150 * 1024 * 1024)).toBe('150 MB');
  });
});

describe('formatDuration', () => {
  it('formats under an hour as M:SS', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(9000)).toBe('0:09');
    expect(formatDuration(75000)).toBe('1:15');
  });
  it('formats over an hour as H:MM:SS', () => {
    expect(formatDuration(3661000)).toBe('1:01:01');
  });
  it('clamps negatives to zero', () => {
    expect(formatDuration(-500)).toBe('0:00');
  });
});

describe('formatThroughput', () => {
  it('computes MB/s', () => {
    expect(formatThroughput(1024 * 1024, 1000)).toBe('1.0 MB/s');
    expect(formatThroughput(5 * 1024 * 1024, 2000)).toBe('2.5 MB/s');
  });
  it('returns zero for non-positive elapsed time', () => {
    expect(formatThroughput(1024, 0)).toBe('0.0 MB/s');
  });
});

describe('timestampSlug & buildFilename', () => {
  const d = new Date(2026, 6, 15, 14, 3, 11); // 2026-07-15 14:03:11 local

  it('zero-pads all fields', () => {
    expect(timestampSlug(new Date(2026, 0, 2, 9, 5, 4))).toBe('2026-01-02_09-05-04');
  });
  it('builds a webm filename', () => {
    expect(buildFilename('video/webm;codecs=vp9', d)).toBe('screenwell_2026-07-15_14-03-11.webm');
  });
  it('builds an mp4 filename', () => {
    expect(buildFilename('video/mp4', d)).toBe('screenwell_2026-07-15_14-03-11.mp4');
  });
  it('honours a custom prefix', () => {
    expect(buildFilename('video/webm', d, 'clip')).toBe('clip_2026-07-15_14-03-11.webm');
  });
});
