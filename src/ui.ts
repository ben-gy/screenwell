/**
 * UI chrome — modal management and transient toasts.
 * Modal bodies are defined here and lazily shown; the app wires openers by id.
 */

interface ModalDef {
  title: string;
  body: string;
}

/** A glossary-linked term. `label` is shown; `term` keys into GLOSSARY. */
function g(label: string, term = label): string {
  return `<span class="glossary-link" data-term="${term.toLowerCase()}" role="button" tabindex="0">${label}</span>`;
}

const MODALS: Record<string, ModalDef> = {
  how: {
    title: 'How Screenwell works',
    body: `
      <ol class="steps">
        <li><strong>You pick the sources.</strong> Toggle microphone, ${g('system audio')} and a webcam bubble, then press Start. Your browser draws its own picker so you choose exactly which screen, window or tab to share.</li>
        <li><strong>Everything is composed locally.</strong> If the webcam overlay is on, a small ${g('compositor')} paints your camera as a circular bubble over the screen. ${g('Web Audio')} mixes your mic and system sound into one track. No frame or sample leaves the tab.</li>
        <li><strong>${g('MediaRecorder')} encodes in real time.</strong> The composed stream is encoded to ${g('WebM')} (or ${g('MP4', 'h.264')} on Safari) by the browser natively — the CPU-heavy work runs off the main thread, inside your browser.</li>
        <li><strong>You save the result.</strong> The finished clip is a ${g('Blob')} held in memory. Download it or share it. Record again to discard and start over. Nothing was ever uploaded.</li>
      </ol>
      <p class="modal-note">Loaded once, Screenwell keeps working offline as a ${g('PWA')} — the strongest proof there is no server involved.</p>
    `,
  },
  threat: {
    title: 'Threat model',
    body: `
      <div class="tm">
        <section>
          <h4 class="tm-good">Protected</h4>
          <ul>
            <li>Your screen capture, microphone, system audio, webcam frames and the encoded video never leave your device. There is no upload endpoint anywhere in the code.</li>
            <li>No account, no cookies for your data, no third-party fonts, no tracking beyond an anonymous page-view count.</li>
            <li>Once loaded, the tool runs fully offline.</li>
          </ul>
        </section>
        <section>
          <h4 class="tm-warn">Not protected</h4>
          <ul>
            <li>Screenwell can't stop you from recording sensitive content and then sharing the file yourself — the output is an ordinary video.</li>
            <li>The finished clip is a plain, unencrypted video file. Store and send it as carefully as any sensitive document.</li>
            <li>The screen-picker dialog is provided by your operating system and browser, not by Screenwell.</li>
          </ul>
        </section>
        <section>
          <h4 class="tm-info">Trust surface</h4>
          <ul>
            <li>The static site bundle (hash-pinned by the GitHub Pages deploy) and the TLS chain between you and GitHub Pages.</li>
            <li>Your browser's native Screen Capture and ${g('MediaRecorder')} implementations.</li>
            <li>A Cloudflare Web Analytics beacon records anonymous page views — no cookies, no fingerprinting, no cross-site tracking; your recording is never sent to it.</li>
          </ul>
        </section>
      </div>
    `,
  },
  about: {
    title: 'About Screenwell',
    body: `
      <p>Screenwell is a free, in-browser screen recorder. Capture a screen, window or tab — with microphone, system audio and an optional webcam bubble — and get a video file, without installing anything, creating an account, or uploading a single byte.</p>
      <p>It's part of a small collection of privacy-first browser tools. No file you touch here is ever sent to a server.</p>
      <ul class="about-links">
        <li><a href="https://benrichardson.dev/" target="_blank" rel="noopener">benrichardson.dev</a> — who made this</li>
        <li><a href="https://sites.benrichardson.dev" target="_blank" rel="noopener">sites.benrichardson.dev</a> — the full directory of tools &amp; sites</li>
        <li><a href="https://github.com/ben-gy/screenwell" target="_blank" rel="noopener">Source on GitHub</a> — read exactly what it does</li>
      </ul>
      <p class="modal-note">No cookies for your data · no fingerprinting · no third-party fonts · anonymous, cookie-less page-view counts via Cloudflare Web Analytics.</p>
    `,
  },
};

let overlay: HTMLElement | null = null;

export function initModals(): void {
  overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal-head">
        <h3 id="modal-title"></h3>
        <button class="modal-close" type="button" aria-label="Close">&times;</button>
      </div>
      <div class="modal-body"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || (e.target as HTMLElement).closest('.modal-close')) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay && !overlay.hidden) closeModal();
  });
}

export function openModal(id: keyof typeof MODALS | string): void {
  const def = MODALS[id];
  if (!def || !overlay) return;
  (overlay.querySelector('#modal-title') as HTMLElement).textContent = def.title;
  (overlay.querySelector('.modal-body') as HTMLElement).innerHTML = def.body;
  overlay.hidden = false;
  (overlay.querySelector('.modal-close') as HTMLElement)?.focus();
}

export function closeModal(): void {
  if (overlay) overlay.hidden = true;
}

let toastTimer: number | null = null;
export function toast(message: string, kind: 'info' | 'ok' | 'err' = 'info'): void {
  let el = document.querySelector('.toast') as HTMLElement | null;
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.dataset.kind = kind;
  el.classList.add('show');
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el?.classList.remove('show'), 3200);
}
