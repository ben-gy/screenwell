// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
/**
 * Screenwell — in-browser screen recorder.
 * Bootstraps the UI, wires the recorder lifecycle, keeps no heavy logic itself.
 */

// feedback:begin (managed by hub/scripts/feedback/backfill.mjs)
import { mountFeedback } from './feedback';
mountFeedback();
// feedback:end

import './styles/main.css';
import type { CaptureSettings, Recording } from './types';
import { composeCapture, micSupported, screenCaptureSupported, type ComposedCapture } from './capture';
import { RecorderController, isActive, type RecModel } from './recorder';
import {
  buildFilename,
  codecLabel,
  formatBytes,
  formatDuration,
  formatThroughput,
  pickVideoMimeType,
} from './format';
import { categoryLogger, emit, mountEventDrawer } from './eventlog';
import { closeModal, initModals, openModal, toast } from './ui';
import { initGlossary } from './glossary';

const SETTINGS_KEY = 'screenwell.settings.v1';
const DEFAULT_SETTINGS: CaptureSettings = { mic: true, systemAudio: true, webcam: false, countdown: 3 };

let settings: CaptureSettings = loadSettings();
let capture: ComposedCapture | null = null;
let recording: Recording | null = null;
let countdownTimer: number | null = null;
let recordStartWall = 0;

const log = {
  system: categoryLogger('system'),
  capture: categoryLogger('capture'),
  record: categoryLogger('record'),
  output: categoryLogger('output'),
};

const controller = new RecorderController({
  onState: renderState,
  onProgress: ({ elapsedMs, bytes }) => {
    setText('timer', formatDuration(elapsedMs));
    setText('size', formatBytes(bytes));
    const wall = performance.now() - recordStartWall;
    setText('throughput', formatThroughput(bytes, wall));
  },
  onComplete: (blob, mimeType, durationMs) => {
    capture?.stop();
    capture = null;
    const url = URL.createObjectURL(blob);
    recording = {
      blob,
      mimeType,
      size: blob.size,
      durationMs,
      filename: buildFilename(mimeType, new Date()),
      url,
    };
    log.output(`Recording ready — ${formatBytes(blob.size)}, ${formatDuration(durationMs)}`, 'ok');
    showResult(recording);
  },
  onError: (message) => {
    capture?.stop();
    capture = null;
    log.record(message, 'err');
    showError(message);
  },
});

function loadSettings(): CaptureSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_SETTINGS };
}
function saveSettings(): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

/* ---------------------------------------------------------------- render */

function render(): void {
  const app = document.getElementById('app')!;
  app.innerHTML = `
    <header class="topbar">
      <a class="brand" href="/">
        <svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
          <rect x="2.5" y="5.5" width="27" height="19" rx="3.5" fill="#0d1420" stroke="#3a4657" stroke-width="1.5"/>
          <circle cx="16" cy="15" r="5.5" fill="#ff5a52"/>
          <rect x="12" y="27" width="8" height="1.8" rx="0.9" fill="#3a4657"/>
        </svg>
        <span class="brand-name">screen<span class="accent">well</span></span>
      </a>
      <nav class="topnav">
        <button type="button" data-modal="how">How it works</button>
        <button type="button" data-modal="threat">Privacy</button>
        <button type="button" data-modal="about">About</button>
        <button type="button" id="toggle-drawer" class="drawer-toggle" aria-pressed="false">Event log</button>
      </nav>
    </header>

    <button type="button" class="trust-banner" data-modal="threat" title="What is and isn't protected">
      <span class="lock">&#128274;</span> Runs entirely in your browser. Your recording is never uploaded.
    </button>

    <main class="main-content">
      <div class="workspace">
        <section class="sources" aria-label="Recording sources">
          <h2 class="panel-title">Sources</h2>
          <label class="src-row"><span><span class="src-name">Microphone</span><span class="src-desc">Your voice</span></span>
            <input type="checkbox" id="opt-mic" ${settings.mic ? 'checked' : ''} /></label>
          <label class="src-row"><span><span class="src-name">System audio</span><span class="src-desc">Sound from the shared screen/tab</span></span>
            <input type="checkbox" id="opt-sys" ${settings.systemAudio ? 'checked' : ''} /></label>
          <label class="src-row"><span><span class="src-name">Webcam bubble</span><span class="src-desc">Camera overlay in the corner</span></span>
            <input type="checkbox" id="opt-cam" ${settings.webcam ? 'checked' : ''} /></label>
          <div class="src-row countdown-row">
            <span><span class="src-name">Countdown</span><span class="src-desc">Seconds before capture</span></span>
            <select id="opt-countdown">
              ${[0, 3, 5, 10].map((n) => `<option value="${n}" ${settings.countdown === n ? 'selected' : ''}>${n === 0 ? 'Off' : n + 's'}</option>`).join('')}
            </select>
          </div>
          <p class="src-hint" id="format-hint"></p>
        </section>

        <section class="stage" aria-label="Recording stage">
          <div class="stage-screen" id="stage-screen">
            <div class="stage-idle" id="stage-idle">
              <svg viewBox="0 0 64 64" class="stage-icon" aria-hidden="true">
                <rect x="6" y="12" width="52" height="34" rx="4" fill="none" stroke="currentColor" stroke-width="2.5"/>
                <circle cx="32" cy="29" r="8" fill="currentColor" opacity="0.85"/>
                <rect x="24" y="52" width="16" height="3" rx="1.5" fill="currentColor"/>
              </svg>
              <p class="stage-idle-text">Ready to record your screen</p>
              <p class="stage-idle-sub">Pick your sources, then press Start. Nothing leaves this tab.</p>
            </div>
            <video id="preview" class="preview" muted playsinline autoplay hidden></video>
            <video id="result" class="preview" controls playsinline hidden></video>
            <div class="countdown-overlay" id="countdown" hidden><span id="countdown-num"></span></div>
            <div class="rec-badge" id="rec-badge" hidden><span class="rec-dot"></span><span id="rec-label">REC</span></div>
          </div>

          <div class="stage-stats" id="stage-stats" hidden>
            <div class="stat"><span class="stat-k">Time</span><span class="stat-v" id="timer">0:00</span></div>
            <div class="stat"><span class="stat-k">Size</span><span class="stat-v" id="size">0 B</span></div>
            <div class="stat"><span class="stat-k">Rate</span><span class="stat-v" id="throughput">0.0 MB/s</span></div>
          </div>

          <div class="stage-error" id="stage-error" hidden>
            <p id="error-msg"></p>
            <button type="button" class="btn btn-ghost" id="btn-retry">Try again</button>
          </div>

          <div class="controls" id="controls">
            <button type="button" class="btn btn-record" id="btn-record">
              <span class="btn-dot"></span><span id="record-label">Start recording</span>
            </button>
            <button type="button" class="btn btn-ghost" id="btn-pause" hidden>Pause</button>
            <button type="button" class="btn btn-ghost" id="btn-again" hidden>Record again</button>
            <div class="result-actions" id="result-actions" hidden>
              <button type="button" class="btn btn-primary" id="btn-download">Download</button>
              <button type="button" class="btn btn-ghost" id="btn-share" hidden>Share</button>
            </div>
          </div>
          <p class="kbd-hint">Shortcuts: <kbd>Space</kbd> start/stop · <kbd>P</kbd> pause/resume · <kbd>Esc</kbd> close</p>
        </section>
      </div>
    </main>

    <aside class="drawer" id="drawer" hidden><div id="drawer-mount"></div></aside>

    <footer class="site-footer">
      Built by <a href="https://benrichardson.dev/" target="_blank" rel="noopener">benrichardson.dev</a>
      · <a href="https://hub.benrichardson.dev" target="_blank" rel="noopener">more tools &amp; sites</a>
    </footer>
  `;

  // Modal openers
  app.querySelectorAll('[data-modal]').forEach((el) =>
    el.addEventListener('click', () => openModal((el as HTMLElement).dataset.modal!)),
  );

  // Source toggles
  bindToggle('opt-mic', (v) => (settings.mic = v));
  bindToggle('opt-sys', (v) => (settings.systemAudio = v));
  bindToggle('opt-cam', (v) => (settings.webcam = v));
  (document.getElementById('opt-countdown') as HTMLSelectElement).addEventListener('change', (e) => {
    settings.countdown = Number((e.target as HTMLSelectElement).value);
    saveSettings();
  });

  // Controls
  document.getElementById('btn-record')!.addEventListener('click', onRecordButton);
  document.getElementById('btn-pause')!.addEventListener('click', onPauseButton);
  document.getElementById('btn-again')!.addEventListener('click', resetToIdle);
  document.getElementById('btn-retry')!.addEventListener('click', resetToIdle);
  document.getElementById('btn-download')!.addEventListener('click', downloadResult);
  document.getElementById('btn-share')!.addEventListener('click', shareResult);
  document.getElementById('toggle-drawer')!.addEventListener('click', toggleDrawer);

  updateFormatHint();
  applySupport();
}

function bindToggle(id: string, set: (v: boolean) => void): void {
  document.getElementById(id)!.addEventListener('change', (e) => {
    set((e.target as HTMLInputElement).checked);
    saveSettings();
    updateFormatHint();
  });
}

function applySupport(): void {
  if (!screenCaptureSupported()) {
    const btn = document.getElementById('btn-record') as HTMLButtonElement;
    btn.disabled = true;
    setText('record-label', 'Screen capture not supported');
    showError('This browser does not support screen capture. Try the latest Chrome, Edge, Firefox or Safari on a desktop.');
    log.system('getDisplayMedia unavailable in this browser', 'err');
  }
  if (!micSupported()) {
    (document.getElementById('opt-mic') as HTMLInputElement).disabled = true;
    (document.getElementById('opt-cam') as HTMLInputElement).disabled = true;
  }
}

function updateFormatHint(): void {
  const supported = typeof MediaRecorder !== 'undefined';
  const mime = supported ? pickVideoMimeType((t) => MediaRecorder.isTypeSupported(t)) : null;
  const hint = document.getElementById('format-hint');
  if (hint) hint.textContent = mime ? `Output: ${codecLabel(mime)}` : 'Recording not supported here';
}

/* ------------------------------------------------------------- lifecycle */

async function onRecordButton(): Promise<void> {
  const s = controller.state;
  if (s === 'idle') {
    await beginRecording();
  } else if (isActive(s)) {
    controller.stop();
    log.record('Stop requested', 'info');
  }
}

function onPauseButton(): void {
  if (controller.state === 'recording') {
    controller.pause();
    log.record('Paused', 'info');
  } else if (controller.state === 'paused') {
    controller.resume();
    log.record('Resumed', 'info');
  }
}

async function beginRecording(): Promise<void> {
  if (typeof MediaRecorder === 'undefined') {
    showError('This browser has no MediaRecorder support.');
    return;
  }
  const mime = pickVideoMimeType((t) => MediaRecorder.isTypeSupported(t));
  if (!mime) {
    showError('No supported recording format in this browser.');
    return;
  }

  hide('stage-error');
  controller.arm();
  log.capture('Requesting screen capture…', 'info');

  try {
    capture = await composeCapture(settings, (m, level) => log.capture(m, level));
  } catch (err) {
    controller.reset();
    const msg = err instanceof Error ? err.message : 'Could not start capture.';
    // A cancelled picker is a normal action, not an error state.
    if (/cancel/i.test(msg)) {
      log.capture(msg, 'warn');
      renderState({ state: 'idle' });
      return;
    }
    showError(msg);
    return;
  }

  // Wire the live preview + the browser's own "Stop sharing".
  const preview = document.getElementById('preview') as HTMLVideoElement;
  preview.srcObject = capture.previewStream;
  capture.onUserStop(() => {
    if (isActive(controller.state)) {
      log.capture('Sharing stopped from the browser', 'info');
      controller.stop();
    }
  });

  // Countdown, then start.
  await runCountdown(settings.countdown);
  if (controller.state !== 'arming') {
    // Aborted during countdown.
    capture?.stop();
    capture = null;
    return;
  }
  try {
    controller.start(capture.stream, mime);
    recordStartWall = performance.now();
    log.record(`Recording started (${codecLabel(mime)})`, 'ok');
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to start the recorder.';
    controller.fail(msg);
  }
}

function runCountdown(seconds: number): Promise<void> {
  return new Promise((resolve) => {
    if (seconds <= 0) {
      resolve();
      return;
    }
    const overlay = document.getElementById('countdown')!;
    const num = document.getElementById('countdown-num')!;
    let n = seconds;
    overlay.hidden = false;
    num.textContent = String(n);
    countdownTimer = window.setInterval(() => {
      n -= 1;
      if (n <= 0 || controller.state !== 'arming') {
        if (countdownTimer !== null) window.clearInterval(countdownTimer);
        countdownTimer = null;
        overlay.hidden = true;
        resolve();
      } else {
        num.textContent = String(n);
      }
    }, 1000);
  });
}

function resetToIdle(): void {
  if (countdownTimer !== null) {
    window.clearInterval(countdownTimer);
    countdownTimer = null;
  }
  capture?.stop();
  capture = null;
  if (recording) {
    URL.revokeObjectURL(recording.url);
    recording = null;
  }
  const result = document.getElementById('result') as HTMLVideoElement;
  result.removeAttribute('src');
  result.srcObject = null;
  controller.reset();
  log.system('Reset — ready for a new recording', 'info');
}

/* ------------------------------------------------------------ view state */

function renderState(model: RecModel): void {
  const { state } = model;
  const idle = document.getElementById('stage-idle')!;
  const preview = document.getElementById('preview') as HTMLVideoElement;
  const result = document.getElementById('result') as HTMLVideoElement;
  const stats = document.getElementById('stage-stats')!;
  const badge = document.getElementById('rec-badge')!;
  const recordBtn = document.getElementById('btn-record') as HTMLButtonElement;
  const pauseBtn = document.getElementById('btn-pause') as HTMLButtonElement;
  const againBtn = document.getElementById('btn-again') as HTMLButtonElement;
  const resultActions = document.getElementById('result-actions')!;
  const recording_ = isActive(state);

  idle.hidden = state !== 'idle';
  preview.hidden = !(state === 'arming' || recording_);
  result.hidden = state !== 'ready';
  stats.hidden = !recording_;
  badge.hidden = !recording_;
  againBtn.hidden = !(state === 'ready' || state === 'error');
  resultActions.hidden = state !== 'ready';
  pauseBtn.hidden = !recording_;

  document.getElementById('rec-badge')!.classList.toggle('paused', state === 'paused');
  setText('rec-label', state === 'paused' ? 'PAUSED' : 'REC');
  setText('pause', state === 'paused' ? 'Resume' : 'Pause');

  recordBtn.hidden = state === 'ready';
  recordBtn.classList.toggle('is-recording', recording_);
  if (state === 'idle') setText('record-label', 'Start recording');
  else if (state === 'arming') setText('record-label', 'Preparing…');
  else if (recording_) setText('record-label', 'Stop recording');
  else if (state === 'finalizing') setText('record-label', 'Finishing…');

  document.body.dataset.recState = state;
}

function showResult(rec: Recording): void {
  const result = document.getElementById('result') as HTMLVideoElement;
  result.src = rec.url;
  result.hidden = false;
  const shareBtn = document.getElementById('btn-share') as HTMLButtonElement;
  shareBtn.hidden = !canShareFile(rec);
  toast('Recording ready — nothing was uploaded.', 'ok');
}

function showError(message: string): void {
  const box = document.getElementById('stage-error');
  if (box) {
    box.hidden = false;
    setText('error-msg', message);
  }
  toast(message, 'err');
}

function hide(id: string): void {
  const el = document.getElementById(id);
  if (el) el.hidden = true;
}

/* --------------------------------------------------------------- output */

function downloadResult(): void {
  if (!recording) return;
  const a = document.createElement('a');
  a.href = recording.url;
  a.download = recording.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  log.output(`Downloaded ${recording.filename}`, 'ok');
}

function canShareFile(rec: Recording): boolean {
  try {
    const file = new File([rec.blob], rec.filename, { type: rec.mimeType });
    return !!navigator.canShare?.({ files: [file] });
  } catch {
    return false;
  }
}

async function shareResult(): Promise<void> {
  if (!recording) return;
  try {
    const file = new File([recording.blob], recording.filename, { type: recording.mimeType });
    await navigator.share({ files: [file], title: 'Screen recording' });
    log.output('Shared via the system share sheet', 'ok');
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return;
    toast('Sharing was not completed.', 'err');
  }
}

/* --------------------------------------------------------------- drawer */

let drawerMounted = false;
function toggleDrawer(): void {
  const drawer = document.getElementById('drawer')!;
  const open = drawer.hidden;
  if (open) openDrawer();
  else closeDrawer();
}
function openDrawer(): void {
  const drawer = document.getElementById('drawer')!;
  const btn = document.getElementById('toggle-drawer')!;
  drawer.hidden = false;
  btn.setAttribute('aria-pressed', 'true');
  btn.classList.add('on');
  if (!drawerMounted) {
    mountEventDrawer(document.getElementById('drawer-mount')!, closeDrawer);
    drawerMounted = true;
  }
}
function closeDrawer(): void {
  const drawer = document.getElementById('drawer')!;
  const btn = document.getElementById('toggle-drawer')!;
  drawer.hidden = true;
  btn.setAttribute('aria-pressed', 'false');
  btn.classList.remove('on');
}
function isDrawerOpen(): boolean {
  return !document.getElementById('drawer')!.hidden;
}

/* ------------------------------------------------------------ shortcuts */

function initShortcuts(): void {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal();
      if (isDrawerOpen()) closeDrawer();
      return;
    }
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (e.code === 'Space') {
      e.preventDefault();
      void onRecordButton();
    } else if (e.key.toLowerCase() === 'p') {
      if (isActive(controller.state)) onPauseButton();
    }
  });
}

function setText(id: string, text: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

/* ------------------------------------------------------------ bootstrap */

function registerServiceWorker(): void {
  if (!import.meta.env.DEV && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* offline support is best-effort */
      });
    });
  }
}

function main(): void {
  render();
  initModals();
  initGlossary();
  initShortcuts();
  renderState({ state: 'idle' });
  emit('system', 'ok', 'Screenwell ready — no server, nothing uploaded');
  registerServiceWorker();
}

main();
