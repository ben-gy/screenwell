/** Shared types for Screenwell. */

/** User-chosen capture sources, persisted to localStorage. */
export interface CaptureSettings {
  /** Capture the microphone via getUserMedia. */
  mic: boolean;
  /** Request system/tab audio in getDisplayMedia. */
  systemAudio: boolean;
  /** Composite a webcam bubble over the screen. */
  webcam: boolean;
  /** Seconds of 3-2-1 countdown before recording begins (0 = none). */
  countdown: number;
}

/** The finished recording. */
export interface Recording {
  blob: Blob;
  mimeType: string;
  /** Bytes. */
  size: number;
  /** Milliseconds of wall-clock recording time. */
  durationMs: number;
  /** Suggested download filename including extension. */
  filename: string;
  /** Object URL for the inline player (revoke on reset). */
  url: string;
}
