/**
 * Media acquisition & composition.
 *
 * Turns the user's chosen sources (screen + optional mic + optional system
 * audio + optional webcam bubble) into a single MediaStream ready for the
 * MediaRecorder. All of this is native browser plumbing — no uploads.
 */

import type { CaptureSettings } from './types';

export interface ComposedCapture {
  /** The stream handed to MediaRecorder. */
  stream: MediaStream;
  /** The raw screen video track, for the live preview element. */
  previewStream: MediaStream;
  /** Tear down every underlying track, context and animation loop. */
  stop: () => void;
  /** Registers a callback fired if the user hits the browser's "Stop sharing". */
  onUserStop: (fn: () => void) => void;
}

export interface CaptureLogger {
  (message: string, level?: 'info' | 'ok' | 'warn' | 'err'): void;
}

/** Feature-detection used to disable unsupported toggles up front. */
export function screenCaptureSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;
}
export function micSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

/**
 * Acquire and compose all sources. Throws with a friendly message if the user
 * cancels the screen picker or the browser is unsupported.
 */
export async function composeCapture(
  settings: CaptureSettings,
  log: CaptureLogger,
): Promise<ComposedCapture> {
  if (!screenCaptureSupported()) {
    throw new Error('This browser does not support screen capture (getDisplayMedia).');
  }

  const cleanups: Array<() => void> = [];
  const userStopHandlers: Array<() => void> = [];

  // 1. Screen (with system audio if requested).
  let display: MediaStream;
  try {
    display = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 30 } as MediaTrackConstraints,
      audio: settings.systemAudio,
    });
  } catch (err) {
    if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'AbortError')) {
      throw new Error('Screen sharing was cancelled.');
    }
    throw new Error('Could not start screen capture.');
  }
  const screenTrack = display.getVideoTracks()[0];
  if (!screenTrack) {
    display.getTracks().forEach((t) => t.stop());
    throw new Error('No screen video track was produced.');
  }
  cleanups.push(() => display.getTracks().forEach((t) => t.stop()));
  log('Screen capture started', 'ok');

  // The browser's own "Stop sharing" button ends the screen track.
  screenTrack.addEventListener('ended', () => userStopHandlers.forEach((fn) => fn()));

  const systemAudioTracks = display.getAudioTracks();
  if (settings.systemAudio) {
    if (systemAudioTracks.length) log('System audio track captured', 'ok');
    else log('System audio was not shared by the browser/OS', 'warn');
  }

  // 2. Microphone (optional).
  let micStream: MediaStream | null = null;
  if (settings.mic) {
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      cleanups.push(() => micStream?.getTracks().forEach((t) => t.stop()));
      log('Microphone captured', 'ok');
    } catch {
      log('Microphone permission denied — recording without mic', 'warn');
    }
  }

  // 3. Webcam (optional, for the overlay bubble).
  let webcamStream: MediaStream | null = null;
  if (settings.webcam) {
    try {
      webcamStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
      });
      cleanups.push(() => webcamStream?.getTracks().forEach((t) => t.stop()));
      log('Webcam captured for overlay', 'ok');
    } catch {
      log('Webcam permission denied — recording without overlay', 'warn');
    }
  }

  // 4. Audio mix. Combine system audio + mic into one track via Web Audio.
  const audioSources: MediaStream[] = [];
  if (systemAudioTracks.length) audioSources.push(new MediaStream(systemAudioTracks));
  if (micStream) audioSources.push(micStream);

  let mixedAudioTrack: MediaStreamTrack | null = null;
  let audioContext: AudioContext | null = null;
  if (audioSources.length === 1) {
    mixedAudioTrack = audioSources[0].getAudioTracks()[0] ?? null;
  } else if (audioSources.length > 1) {
    try {
      audioContext = new AudioContext();
      const dest = audioContext.createMediaStreamDestination();
      for (const s of audioSources) {
        audioContext.createMediaStreamSource(s).connect(dest);
      }
      mixedAudioTrack = dest.stream.getAudioTracks()[0] ?? null;
      cleanups.push(() => void audioContext?.close().catch(() => {}));
      log('Mixed microphone + system audio', 'ok');
    } catch {
      // Fall back to the first available track if mixing fails.
      mixedAudioTrack = audioSources[0].getAudioTracks()[0] ?? null;
      log('Audio mixing unavailable — using a single track', 'warn');
    }
  }

  // 5. Video. With a webcam overlay we composite on a canvas; otherwise we
  //    record the raw screen track directly (sharper, no re-encode).
  let outputVideoTrack: MediaStreamTrack;
  let stopCompositor: (() => void) | null = null;
  if (webcamStream) {
    const composited = startCompositor(screenTrack, webcamStream, log);
    outputVideoTrack = composited.track;
    stopCompositor = composited.stop;
    cleanups.push(() => stopCompositor?.());
  } else {
    outputVideoTrack = screenTrack;
  }

  // 6. Assemble the output stream.
  const outputTracks: MediaStreamTrack[] = [outputVideoTrack];
  if (mixedAudioTrack) outputTracks.push(mixedAudioTrack);
  const stream = new MediaStream(outputTracks);

  return {
    stream,
    previewStream: new MediaStream([outputVideoTrack]),
    stop: () => {
      for (const c of cleanups.reverse()) {
        try {
          c();
        } catch {
          /* ignore */
        }
      }
    },
    onUserStop: (fn: () => void) => userStopHandlers.push(fn),
  };
}

/**
 * Draw the screen track full-frame with the webcam as a rounded bubble in the
 * bottom-right corner, on a canvas whose captureStream() becomes the output
 * video track. Runs on requestAnimationFrame — lightweight drawImage calls.
 */
function startCompositor(
  screenTrack: MediaStreamTrack,
  webcamStream: MediaStream,
  log: CaptureLogger,
): { track: MediaStreamTrack; stop: () => void } {
  const settings = screenTrack.getSettings();
  const width = settings.width || 1280;
  const height = settings.height || 720;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const screenVideo = document.createElement('video');
  screenVideo.srcObject = new MediaStream([screenTrack]);
  screenVideo.muted = true;
  void screenVideo.play().catch(() => {});

  const camVideo = document.createElement('video');
  camVideo.srcObject = webcamStream;
  camVideo.muted = true;
  void camVideo.play().catch(() => {});

  // Bubble geometry: ~22% of width, 16:9 → square-ish circle, margin.
  const bubble = Math.round(Math.min(width, height) * 0.22);
  const margin = Math.round(bubble * 0.18);
  const cx = width - bubble / 2 - margin;
  const cy = height - bubble / 2 - margin;
  const radius = bubble / 2;

  let raf = 0;
  let stopped = false;

  const draw = () => {
    if (stopped) return;
    try {
      ctx.drawImage(screenVideo, 0, 0, width, height);

      // Webcam bubble — cover-fit into the circle.
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      const cw = camVideo.videoWidth || 640;
      const ch = camVideo.videoHeight || 480;
      const scale = Math.max(bubble / cw, bubble / ch);
      const dw = cw * scale;
      const dh = ch * scale;
      ctx.drawImage(camVideo, cx - dw / 2, cy - dh / 2, dw, dh);
      ctx.restore();

      // Ring around the bubble.
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.lineWidth = Math.max(2, bubble * 0.02);
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.stroke();
    } catch {
      /* frame not ready yet */
    }
    raf = requestAnimationFrame(draw);
  };

  // Fallback: some browsers throttle rAF when the tab is backgrounded, which
  // would freeze the composite. A low-frequency interval keeps frames flowing.
  const keepAlive = window.setInterval(() => {
    if (!stopped && document.hidden) draw();
  }, 200);

  raf = requestAnimationFrame(draw);
  log('Webcam overlay compositor running', 'ok');

  const stream = canvas.captureStream(30);
  const track = stream.getVideoTracks()[0];

  return {
    track,
    stop: () => {
      stopped = true;
      cancelAnimationFrame(raf);
      window.clearInterval(keepAlive);
      track.stop();
      screenVideo.srcObject = null;
      camVideo.srcObject = null;
    },
  };
}
