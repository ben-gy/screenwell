/** Jargon → plain-English definitions for click-to-define tooltips. */
export const GLOSSARY: Record<string, string> = {
  getdisplaymedia:
    'The Screen Capture API. It asks the browser to hand your page a live video stream of a screen, window or tab — the browser draws the picker; Screenwell never sees your other windows.',
  mediarecorder:
    'A built-in browser API that encodes a live audio/video stream into a compressed video file (WebM or MP4) in real time. The heavy encoding runs natively, off the main thread.',
  'system audio':
    'The sound your computer is playing (a video, a call, music) captured alongside the screen. Support varies: Chrome can share tab or system audio, some browsers only tab audio.',
  vp9: 'A modern, efficient open video codec used inside WebM files. Screenwell prefers it on Chrome/Firefox for small, sharp recordings.',
  'h.264':
    'A widely-compatible video codec (also called AVC). Safari can record MP4/H.264 directly, which plays almost everywhere without conversion.',
  webm: 'An open video container format used by Chrome and Firefox recordings. Plays in modern browsers; convert to MP4 if you need it in older editors.',
  compositor:
    'The small drawing loop that paints your webcam as a circular bubble on top of the screen video, frame by frame, into one combined picture.',
  'web audio':
    'A browser audio-processing API. Screenwell uses it only to mix your microphone and system audio into a single track — locally, never uploaded.',
  pwa: 'Progressive Web App — once loaded, Screenwell is cached by a service worker and keeps working with the network switched off. Offline is proof nothing is uploaded.',
  blob: 'An in-memory chunk of binary data. Your finished recording lives as a Blob in the tab until you download it; it is never sent anywhere.',
};

let tooltipEl: HTMLElement | null = null;

/** Wire up click-to-define behaviour for any `.glossary-link[data-term]`. */
export function initGlossary(): void {
  document.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement)?.closest('.glossary-link') as HTMLElement | null;
    if (target) {
      e.preventDefault();
      const term = (target.dataset.term || target.textContent || '').toLowerCase().trim();
      const def = GLOSSARY[term];
      if (def) showTooltip(target, def);
      return;
    }
    if (tooltipEl && !(e.target as HTMLElement)?.closest('.glossary-tip')) hideTooltip();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideTooltip();
  });
  window.addEventListener('scroll', hideTooltip, true);
}

function showTooltip(anchor: HTMLElement, text: string): void {
  hideTooltip();
  const tip = document.createElement('div');
  tip.className = 'glossary-tip';
  tip.textContent = text;
  document.body.appendChild(tip);
  const r = anchor.getBoundingClientRect();
  const top = r.bottom + 8;
  let left = r.left;
  const maxLeft = window.innerWidth - tip.offsetWidth - 12;
  if (left > maxLeft) left = Math.max(12, maxLeft);
  tip.style.top = `${top}px`;
  tip.style.left = `${left}px`;
  tooltipEl = tip;
}

function hideTooltip(): void {
  tooltipEl?.remove();
  tooltipEl = null;
}
