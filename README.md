# screenwell

**Record your screen right in the browser — nothing is ever uploaded.**

Live: https://screenwell.benrichardson.dev

---

## what it is

Screenwell is a free, in-browser screen recorder. Capture a screen, window or tab — with your microphone, the system/tab audio, and an optional webcam bubble in the corner — and get a video file. No install, no account, no watermark, and no upload.

Screen recordings are among the most sensitive files people make: they can show inboxes, dashboards, passwords typed in the clear, a client's confidential documents, unreleased product. Every "free online screen recorder" either makes you install a desktop app, caps you behind a sign-up, stamps a watermark on the output, or uploads your recording to their servers to "process" it. Screenwell does the whole job locally — the browser's `MediaRecorder` encodes the video in memory and hands you a file. The bytes never touch a network.

It's built for the developer or support engineer who needs a 30-second clip *right now* to attach to a ticket or Slack, and would rather not install OBS or trust a SaaS with what's on their screen.

## how it works

```
 getDisplayMedia ─┐
   (screen video) │
                  ├─► [ optional canvas compositor: screen + webcam bubble ]
 getUserMedia ────┘                     │
   (webcam)                             ▼
                              one output video track
 getUserMedia (mic) ─┐                  │
                     ├─► Web Audio mix ──┤
 system audio ───────┘   (one track)    ▼
                                   MediaStream ──► MediaRecorder ──► Blob ──► download / share
```

1. **Sources.** You toggle microphone, system audio and the webcam bubble, pick a countdown, and press Start. The browser draws its own picker so you choose exactly what to share.
2. **Compose, locally.** If the webcam overlay is on, a small `requestAnimationFrame` compositor paints the camera as a circular bubble over the screen video into one track via `canvas.captureStream()`. Otherwise the raw screen track is recorded directly (sharper). The Web Audio API mixes mic + system audio into a single track.
3. **Record.** `MediaRecorder` encodes the composed stream to MP4/H.264 (Safari) or WebM/VP9 (Chrome/Firefox) in real time — the heavy encoding runs natively, off the main thread.
4. **Save.** The finished clip is a `Blob` held in memory. Download it, or share it via the system share sheet on mobile. Record again to discard.

## browser APIs used

- **Screen Capture API (`getDisplayMedia`)** — captures a screen/window/tab as a live stream, with optional system audio.
- **MediaRecorder** — real-time, native video encoding to WebM/MP4.
- **`MediaRecorder.isTypeSupported`** — picks the best container/codec per browser.
- **Web Audio API** (`AudioContext`, `MediaStreamAudioDestinationNode`) — mixes microphone + system audio into one track.
- **`getUserMedia`** — microphone and webcam capture.
- **Canvas 2D + `canvas.captureStream()`** — composites the webcam bubble over the screen into one output track.
- **Web Share API** (`navigator.share` with files) — native sharing on mobile, with a download fallback.
- **Service Worker** — offline PWA shell (versioned cache).

## security / privacy model

**Protected**
- Screen capture, microphone, system audio, webcam frames and the encoded video never leave your device. There is no upload endpoint anywhere in the code.
- No account, no cookies for your data, no third-party fonts, no tracking beyond an anonymous page-view count.
- Once loaded, Screenwell runs fully offline.

**Not protected**
- Screenwell can't stop you from recording sensitive content and then sharing the file yourself — the output is an ordinary video.
- The finished clip is a plain, unencrypted video file. Store and send it as carefully as any sensitive document.
- The screen-picker dialog is provided by your OS and browser, not by Screenwell.

**Trust model**
- The static site bundle (hash-pinned by the GitHub Pages deploy) and the TLS chain between you and GitHub Pages.
- Your browser's native Screen Capture and MediaRecorder implementations.
- A Cloudflare Web Analytics beacon records anonymous page views — no cookies, no fingerprinting, no cross-site tracking; your recording is never sent to it.

## stack

- Vite 6 + vanilla TypeScript
- No runtime dependencies — all native browser APIs
- Vitest for unit tests (format/codec selection + the recorder state machine)
- GitHub Pages for hosting, deployed via GitHub Actions

No cookies, no fingerprinting, no third-party fonts. Anonymous, cookie-less page-view counts via Cloudflare Web Analytics — no personal data, no cross-site tracking.

## local development

```bash
npm install
npm run dev      # vite dev server on :5173
npm test         # run vitest suite
npm run build    # produce dist/ for deploy
npm run preview  # serve dist/ locally
```

## deploying

A push to `main` triggers `.github/workflows/deploy.yml`, which runs tests, builds, and deploys `dist/` to GitHub Pages. The custom domain is set via `public/CNAME` — point a `CNAME` DNS record for `screenwell.benrichardson.dev` at `ben-gy.github.io`.

## license

[GNU Affero General Public License v3.0 or later](./LICENSE), with an attribution
requirement added under section 7(b) — see
[ADDITIONAL-TERMS.md](./ADDITIONAL-TERMS.md).

In short: you may run, modify, redistribute and even sell this, but if you
distribute it — or run a modified version where other people can reach it — you
have to publish your source under the same licence and keep the attribution. A
separate commercial licence without those obligations is available on request:
<hi@ben.gy>.

Third-party components keep their own licences — see
[THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md).
