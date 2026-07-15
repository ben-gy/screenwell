# Tool Plan: Screenwell

## Overview
- **Name:** Screenwell
- **Repo name:** screenwell
- **Tagline:** Record your screen right in the browser — nothing is ever uploaded.

## Problem It Solves
You need a quick screen recording: a bug repro to send an engineer, a "here's how you do it" clip for a colleague, a demo of a UI flow, a webcam-over-slides explainer. Every "free online screen recorder" either makes you install a desktop app, slaps a watermark on the output, caps you at a few minutes behind a sign-up, or — worst of all — uploads your recording (which might show your inbox, a client's data, an internal dashboard) to their servers to "process" it. Screenwell records the screen, optional microphone, optional system audio, and an optional webcam bubble entirely in the browser. The MediaRecorder produces a video file locally; it never touches a network. No install, no account, no watermark, no upload.

## Why This Must Be Client-Side
- **Privacy** — screen recordings are among the most sensitive files a person makes: they can show emails, passwords typed in the clear, private dashboards, unreleased product, a client's confidential documents. Uploading that to a stranger's SaaS to "render" it is a real, common leak. Screenwell guarantees the bytes never leave the tab.
- **No-account friction / speed** — no sign-up, no queue, no "your video is processing" wait, no watermark. Click, record, save.
- **Offline** — once loaded, Screenwell works with the network fully off (PWA). That is itself the strongest possible proof that nothing is being uploaded.

## Browser APIs / Libraries Used
| API / Library | What it does for us | Fallback if unsupported |
|---------------|----------------------|-------------------------|
| Screen Capture API (`getDisplayMedia`) | Captures the screen / window / tab as a MediaStream, optionally with system audio | Hard requirement — show an unsupported-browser notice |
| MediaRecorder API | Encodes the composed stream to WebM/MP4 in real time, off the main thread (native) | Hard requirement |
| `MediaRecorder.isTypeSupported` | Picks the best available container/codec (mp4/h264 on Safari, vp9/opus WebM on Chrome/Firefox) | Falls back through a candidate list to `video/webm` |
| Web Audio API (`AudioContext`, `MediaStreamAudioDestinationNode`) | Mixes microphone + system audio into one track | If mixing unavailable, use whichever single audio track exists |
| `getUserMedia` | Microphone capture and webcam capture | Optional — recording proceeds video-only if denied |
| Canvas 2D + `canvas.captureStream()` | Composites the webcam "bubble" over the screen video into one output track | Only used when webcam overlay is on; otherwise the raw screen track is recorded (higher quality) |
| `requestAnimationFrame` | Drives the compositor at display rate | N/A |
| Web Share API (`navigator.share` with files) | Share the finished clip to native targets on mobile | Falls back to download |
| Service Worker | Offline PWA shell (versioned cache) | Tool still works online without it |

## Workflow (input → process → output)
1. **Choose sources** — toggle microphone, system audio, and webcam overlay; pick a countdown length. Click **Start recording**.
2. **Grant + record** — the browser's native picker chooses the screen/window/tab. A 3-2-1 countdown, then a live timer, size readout, pause/resume, and a small live preview. All composition/encoding happens locally.
3. **Save** — the finished clip appears in an inline player. Download it, or Share it (mobile). Record again to start over. Nothing was ever sent anywhere.

## Non-Goals
- No in-browser trimming/editing v1 (that needs a decode pipeline — a separate tool). Non-goal this run.
- No MP4 transcode of WebM output (would require ffmpeg.wasm + cross-origin isolation, which GitHub Pages can't set headers for). We record MP4 natively where the browser supports it (Safari), WebM otherwise.
- No cloud sync, no accounts, ever.
- No multi-track/scene mixing like OBS — one screen source + one webcam bubble is the ceiling.

## Target Audience
A developer or support engineer at their desk who needs a 30-second screen recording *right now* to attach to a ticket or Slack, is mildly privacy-conscious (the screen may show internal data), and doesn't want to install OBS or sign up for Loom. Technical, on desktop, in a hurry.

## Style Direction
**Tone:** technical, confident, calm.
**Colour palette:** dark, near-black slate base with a warm coral/red record accent — the "record" language reads naturally in dark (OBS, camera UIs) and the red dot pops against slate. A single accent; everything else is desaturated.
**UI density:** balanced — a clear source panel on the left, a big preview/record stage in the centre.
**Dark/light theme:** dark (technical/creative audience).
**Reference tools for feel:** OBS Studio's dark chrome; Loom's clarity of a single primary action.

## Technical Architecture
- **Stack:** Vanilla TypeScript + Vite. No framework needed — it's one screen with a state machine.
- **Key libraries:** none at runtime. All native browser APIs. (Dev: Vite + Vitest + jsdom.)
- **Worker strategy:** none needed — MediaRecorder performs the CPU-heavy video encoding natively, off the main thread, inside the browser. The optional canvas compositor runs on a lightweight `requestAnimationFrame` loop (just `drawImage` calls). Documented honestly in the Threat Model / README.
- **Storage:** none for user data. `localStorage` for UI preferences only (mic/audio/webcam toggles, countdown length). Recordings live only in memory as a Blob until the user downloads them.

## Privacy & Trust Model
**Protected**
- The screen capture, microphone, system audio, webcam frames, and the encoded video Blob never leave the device. There is no upload endpoint anywhere in the code.
- No account, no cookies for user data, no third-party fonts, no analytics beyond the anonymous Cloudflare page-view beacon.

**Not protected**
- Screenwell cannot stop *you* from recording sensitive content and then sharing the file yourself — the output is a normal video file.
- The finished clip is a plain, unencrypted video. Handle/store it as you would any sensitive file.
- The browser's own screen-picker dialog is provided by the OS/browser, not by Screenwell.

**Trust surface**
- The static site bundle (hash-pinned via the GitHub Pages deploy) and the TLS chain between you and GitHub Pages.
- The browser's native Screen Capture / MediaRecorder implementations.
- A Cloudflare Web Analytics beacon records anonymous page views — no cookies, no fingerprinting, no cross-site tracking; your recording is never sent to it.

## UX Required Surfaces
- Source panel: mic / system-audio / webcam-overlay toggles, countdown selector, quality hint.
- Big record stage with live preview, 3-2-1 countdown, determinate timer + growing-size readout + throughput, pause/resume, stop.
- Event log drawer (Dropwell pattern) streaming every state transition and track decision.
- How-It-Works modal (illustrated steps).
- Threat Model modal (Protected / Not protected / Trust surface).
- About modal with benrichardson.dev + hub.benrichardson.dev + source-repo links.
- Glossary tooltips for jargon (MediaRecorder, VP9, system audio, compositor…).
- Output delivery: inline `<video>` player, download, Web Share (files) where supported.
- Keyboard shortcuts: Space = start/stop, P = pause/resume, Escape = close modal.
- Sticky footer with benrichardson.dev + hub.benrichardson.dev attribution.
