// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
/**
 * Recorder state machine.
 *
 * The reducer (`reduce`) is a pure function so the full lifecycle can be
 * unit-tested without any media APIs. `RecorderController` wraps a real
 * MediaRecorder around it and emits progress ticks.
 */

export type RecState =
  | 'idle' // nothing captured yet
  | 'arming' // permission granted, countdown running
  | 'recording'
  | 'paused'
  | 'finalizing' // stop requested, waiting for the final data blob
  | 'ready' // a finished recording is available
  | 'error';

export interface RecModel {
  state: RecState;
  error?: string;
}

export type RecAction =
  | { type: 'arm' } // idle → arming
  | { type: 'armed' } // arming → recording (stream up, recorder started)
  | { type: 'pause' } // recording → paused
  | { type: 'resume' } // paused → recording
  | { type: 'stop' } // recording|paused → finalizing
  | { type: 'finalized' } // finalizing → ready
  | { type: 'fail'; error: string } // any → error
  | { type: 'reset' }; // ready|error|arming → idle

export const INITIAL_MODEL: RecModel = { state: 'idle' };

/** Pure transition function. Invalid transitions return the model unchanged. */
export function reduce(model: RecModel, action: RecAction): RecModel {
  const { state } = model;
  switch (action.type) {
    case 'arm':
      return state === 'idle' ? { state: 'arming' } : model;
    case 'armed':
      return state === 'arming' ? { state: 'recording' } : model;
    case 'pause':
      return state === 'recording' ? { state: 'paused' } : model;
    case 'resume':
      return state === 'paused' ? { state: 'recording' } : model;
    case 'stop':
      return state === 'recording' || state === 'paused' ? { state: 'finalizing' } : model;
    case 'finalized':
      return state === 'finalizing' ? { state: 'ready' } : model;
    case 'fail':
      return { state: 'error', error: action.error };
    case 'reset':
      // Allow bailing out of a half-armed or errored session too.
      return { state: 'idle' };
    default:
      return model;
  }
}

/** True when a recording is actively capturing (used to gate pause/stop UI). */
export function isActive(state: RecState): boolean {
  return state === 'recording' || state === 'paused';
}

export interface ProgressTick {
  /** Wall-clock ms of recording so far (excludes paused time). */
  elapsedMs: number;
  /** Bytes accumulated so far. */
  bytes: number;
}

export interface ControllerCallbacks {
  onState: (model: RecModel) => void;
  onProgress: (tick: ProgressTick) => void;
  onComplete: (blob: Blob, mimeType: string, durationMs: number) => void;
  onError: (message: string) => void;
}

/**
 * Wraps a MediaRecorder + the reducer. The caller supplies the composed
 * MediaStream and the chosen mimeType; the controller owns start/pause/
 * resume/stop and the progress timer.
 */
export class RecorderController {
  private model: RecModel = INITIAL_MODEL;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private bytes = 0;
  private mimeType = '';
  private startedAt = 0;
  private accumulatedMs = 0; // completed run time before the current segment
  private timer: number | null = null;

  constructor(private cb: ControllerCallbacks) {}

  get state(): RecState {
    return this.model.state;
  }

  private dispatch(action: RecAction): void {
    this.model = reduce(this.model, action);
    this.cb.onState(this.model);
  }

  /** Transition idle → arming (countdown). Call before the countdown starts. */
  arm(): void {
    this.dispatch({ type: 'arm' });
  }

  /**
   * Begin recording the given stream. Must be called while in `arming`
   * (i.e. after countdown completes). Throws on unsupported input.
   */
  start(stream: MediaStream, mimeType: string, timesliceMs = 1000): void {
    this.chunks = [];
    this.bytes = 0;
    this.accumulatedMs = 0;
    this.mimeType = mimeType;

    const options: MediaRecorderOptions = mimeType ? { mimeType } : {};
    const recorder = new MediaRecorder(stream, options);
    this.recorder = recorder;

    recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) {
        this.chunks.push(e.data);
        this.bytes += e.data.size;
      }
    };
    recorder.onerror = (e: Event) => {
      const err = (e as unknown as { error?: DOMException }).error;
      this.fail(err?.message || 'The recorder stopped unexpectedly.');
    };
    recorder.onstop = () => this.finalize();

    recorder.start(timesliceMs);
    this.startedAt = performance.now();
    this.dispatch({ type: 'armed' });
    this.startTimer();
  }

  pause(): void {
    if (this.model.state !== 'recording' || !this.recorder) return;
    this.recorder.pause();
    this.accumulatedMs += performance.now() - this.startedAt;
    this.stopTimer();
    this.dispatch({ type: 'pause' });
    this.emitProgress();
  }

  resume(): void {
    if (this.model.state !== 'paused' || !this.recorder) return;
    this.recorder.resume();
    this.startedAt = performance.now();
    this.dispatch({ type: 'resume' });
    this.startTimer();
  }

  /** Request stop. The final blob is delivered via onComplete. */
  stop(): void {
    if (!this.recorder || this.model.state === 'finalizing') return;
    if (this.model.state === 'recording') {
      this.accumulatedMs += performance.now() - this.startedAt;
    }
    this.stopTimer();
    this.dispatch({ type: 'stop' });
    try {
      this.recorder.stop();
    } catch {
      // If the recorder was already inactive, finalize with what we have.
      this.finalize();
    }
  }

  private finalize(): void {
    if (this.model.state === 'ready') return;
    const blob = new Blob(this.chunks, { type: this.mimeType || 'video/webm' });
    this.dispatch({ type: 'finalized' });
    this.cb.onComplete(blob, this.mimeType, Math.round(this.accumulatedMs));
    this.recorder = null;
  }

  fail(message: string): void {
    this.stopTimer();
    this.dispatch({ type: 'fail', error: message });
    this.cb.onError(message);
    try {
      this.recorder?.stop();
    } catch {
      /* ignore */
    }
    this.recorder = null;
  }

  reset(): void {
    this.stopTimer();
    this.chunks = [];
    this.bytes = 0;
    this.accumulatedMs = 0;
    this.recorder = null;
    this.dispatch({ type: 'reset' });
  }

  private currentElapsed(): number {
    const live = this.model.state === 'recording' ? performance.now() - this.startedAt : 0;
    return this.accumulatedMs + live;
  }

  private emitProgress(): void {
    this.cb.onProgress({ elapsedMs: Math.round(this.currentElapsed()), bytes: this.bytes });
  }

  private startTimer(): void {
    this.stopTimer();
    this.timer = window.setInterval(() => this.emitProgress(), 250);
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }
}
