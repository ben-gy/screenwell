# Screenwell — Build Review

This file exists only to create a reviewable PR. All code is already deployed on `main`.

**Merge this PR to acknowledge the build.** Closing without merging is also fine.

## Links

- **GitHub Pages:** https://ben-gy.github.io/screenwell/ *(redirects to custom domain once DNS is set)*
- **Custom domain:** https://screenwell.benrichardson.dev *(live after DNS + cert below)*

## What it is

An in-browser screen recorder. Capture a screen, window or tab — with microphone, system audio, and an optional webcam bubble — and get a video file. Nothing is uploaded: `MediaRecorder` encodes locally and hands you a `Blob`. No install, no account, no watermark.

## DNS setup required

Add in Cloudflare (`benrichardson.dev` zone):

| Type | Name | Target | Proxy |
|------|------|--------|-------|
| CNAME | `screenwell` | `ben-gy.github.io` | DNS only (grey cloud) |

Then trigger cert issuance:
```bash
gh api repos/ben-gy/screenwell/pages -X PUT -f cname=""
sleep 3
gh api repos/ben-gy/screenwell/pages -X PUT -f cname="screenwell.benrichardson.dev"
```
