/*
 * The home terminal's interactive layer (docs/decisions/0008-home-terminal-js.md), home page
 * only. Progressive enhancement over the CSS demo: click a pane, or press Enter while it has
 * focus, and a prompt takes its place, seeded with that pane's transcript. Scroll on to
 * another chapter, leave the prompt empty for 20s, or press Esc, and the CSS demo comes back.
 *
 * Canned answers only (src/lib/terminal.ts over src/content/terminal.json). No network, no
 * eval, no innerHTML: every node is built with createElement and textContent or cloned from
 * the page, and nothing typed is kept beyond this page's memory.
 */
import term from '../content/terminal.json';
import { createSession, type Line, type TermData } from '../lib/terminal';

const IDLE_MS = 20_000;
const data = term as TermData;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const wide = matchMedia('(min-width: 64rem)');
const storyMode = () =>
  wide.matches && !reduceMotion.matches && CSS.supports('animation-timeline: view()') && CSS.supports('timeline-scope: --a');

// One session for every pane; it starts where the demos end (the notes list has three notes).
const session = createSession(data);
for (const d of Object.values(data.demos)) for (const s of d.steps) session.run(s.cmd, { record: false });

interface Live {
  live: HTMLElement;
  screen: HTMLElement;
  input: HTMLInputElement;
  stop: () => void;
}
const lives = new WeakMap<HTMLElement, Live>();

/* ---- Output -------------------------------------------------------------------------------- */

function lineNode(line: Line): HTMLElement {
  const el = document.createElement('span');
  el.className = 't-line';
  for (const seg of typeof line === 'string' ? [line] : line) {
    if (typeof seg === 'string') el.append(document.createTextNode(seg));
    else {
      const s = document.createElement('span');
      s.className = `t-${seg[0]}`;
      s.textContent = seg[1];
      el.append(s);
    }
  }
  return el;
}

function promptLine(cmd: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 't-line t-in';
  const ps = document.createElement('span');
  ps.className = 't-ps';
  ps.setAttribute('aria-hidden', 'true');
  ps.textContent = '$ ';
  const k = document.createElement('kbd');
  k.className = 't-cmd';
  k.textContent = cmd;
  el.append(ps, k);
  return el;
}

/** The pixel scenes, cloned from the journey demo's static transcript. */
function sceneNodes(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[data-demo="journey"] .t-scene')].map((n) => {
    const c = n.cloneNode(true) as HTMLElement;
    c.removeAttribute('style');
    return c;
  });
}

/* ---- Live prompt --------------------------------------------------------------------------- */

let uid = 0;

function makeLive(pane: HTMLElement, { sticky = false } = {}): HTMLInputElement {
  const screen = pane.querySelector<HTMLElement>('.t-screen')!;
  const live = document.createElement('div');
  live.className = 't-screen t-live';

  const log = document.createElement('div');
  log.className = 't-feed t-log';
  log.setAttribute('role', 'log');

  // Seed with the pane's final transcript, minus its idle prompt line.
  const seed = screen.querySelector('.t-feed')?.cloneNode(true) as HTMLElement | undefined;
  if (seed) {
    seed.querySelector('.t-end')?.remove();
    seed.querySelectorAll('[style]').forEach((n) => n.removeAttribute('style'));
    seed.querySelectorAll('.typed').forEach((n) => n.classList.remove('typed'));
    log.append(...seed.childNodes);
  }

  const form = document.createElement('form');
  form.className = 't-line t-prompt';
  const id = `t-input-${++uid}`;
  const label = document.createElement('label');
  label.className = 'sr-only';
  label.htmlFor = id;
  label.textContent = 'Type a command (help lists them; Esc leaves)';
  const ps = document.createElement('span');
  ps.className = 't-ps';
  ps.setAttribute('aria-hidden', 'true');
  ps.textContent = '$ ';
  const input = document.createElement('input');
  input.className = 't-input';
  input.id = id;
  input.type = 'text';
  input.autocomplete = 'off';
  input.setAttribute('autocapitalize', 'off');
  input.spellcheck = false;
  input.setAttribute('enterkeyhint', 'send');
  form.append(label, ps, input);

  live.append(log, form);
  // Keep the pane's size, so typing never pushes the page about (story mode sizes it in CSS).
  if (!storyMode() || !pane.closest('.story')) {
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 18;
    live.style.height = `${Math.round(Math.min(Math.max(screen.offsetHeight, 12 * rem), 26 * rem))}px`;
  }
  screen.hidden = true;
  screen.after(live);
  pane.classList.add('is-live');
  // Announce only what is printed from now on, not the seed.
  log.setAttribute('aria-live', 'polite');

  let idle: ReturnType<typeof setTimeout> | undefined;
  let pos = session.history.length;
  const resetIdle = () => {
    clearTimeout(idle);
    if (sticky) return;
    idle = setTimeout(() => {
      if (!input.value) leave(pane, document.activeElement === input);
    }, IDLE_MS);
  };
  resetIdle();

  const scrollEnd = () => {
    live.scrollTop = live.scrollHeight;
  };

  // Output is appended in order; with motion it prints one line (or scene) at a time.
  let queue = Promise.resolve();
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const emit = (nodes: Node[], parent: HTMLElement = log, gap = 24) => {
    if (reduceMotion.matches) {
      parent.append(...nodes);
      scrollEnd();
      return;
    }
    for (const n of nodes) {
      queue = queue.then(async () => {
        parent.append(n);
        scrollEnd();
        await wait(gap);
      });
    }
  };
  const print = (lines: Line[]) => emit(lines.map(lineNode));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const value = input.value;
    input.value = '';
    // Queued like the output, so a quick second command never lands inside the first's answer.
    emit([promptLine(value)]);
    const out = session.run(value);
    pos = session.history.length;
    if (out.kind === 'clear') {
      queue = queue.then(() => log.replaceChildren());
      if (reduceMotion.matches) log.replaceChildren();
    } else if (out.kind === 'exit') {
      leave(pane, true);
      return;
    } else if (out.kind === 'lines') {
      print(out.lines);
    } else {
      print([[['dim', data.journey.intro]]]);
      const list = document.createElement('ol');
      list.className = 't-scenes';
      emit([list]);
      emit(sceneNodes(), list, 260);
      print([[['dim', data.journey.outro]]]);
    }
    scrollEnd();
    resetIdle();
  });

  input.addEventListener('keydown', (e) => {
    resetIdle();
    const history = session.history;
    if (e.key === 'Escape') {
      e.preventDefault();
      // The try-it pane stays live; focus goes back to the pane itself, never to <body>.
      if (sticky) pane.focus({ preventScroll: true });
      else leave(pane, true);
    } else if (e.key === 'ArrowUp') {
      if (!history.length) return;
      e.preventDefault();
      pos = Math.max(0, pos - 1);
      input.value = history[pos] ?? '';
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      pos = Math.min(history.length, pos + 1);
      input.value = history[pos] ?? '';
    }
  });
  input.addEventListener('input', resetIdle);

  lives.set(pane, { live, screen, input, stop: () => clearTimeout(idle) });
  scrollEnd();
  return input;
}

function leave(pane: HTMLElement, refocus: boolean) {
  const st = lives.get(pane);
  if (!st) return;
  st.stop();
  st.live.remove();
  st.screen.hidden = false;
  pane.classList.remove('is-live');
  lives.delete(pane);
  if (refocus) pane.focus({ preventScroll: true });
}

/**
 * Hand a live pane back after a scroll (a chapter change, or the pane leaving the viewport).
 * If its prompt had focus, focus stays on a pane rather than dropping to <body>: in story mode
 * the pane now on screen (the handed-back one fades out), otherwise the pane itself.
 */
function handBack(pane: HTMLElement) {
  const st = lives.get(pane);
  if (!st) return;
  const hadFocus = document.activeElement === st.input;
  leave(pane, false);
  if (!hadFocus) return;
  const onScreen = storyMode() ? panes.find((p) => Number(p.dataset.row) === active) : undefined;
  (onScreen ?? pane).focus({ preventScroll: true });
}

/* ---- Wiring -------------------------------------------------------------------------------- */

const panes = [...document.querySelectorAll<HTMLElement>('.story .term')];
const chapters = [...document.querySelectorAll<HTMLElement>('.story > .split-prose')];
const tryPane = document.querySelector<HTMLElement>('.term[data-demo="try"]');

document.documentElement.classList.add('term-js');

const goLive = (pane: HTMLElement) => {
  for (const p of panes) if (p !== pane) leave(p, false);
  makeLive(pane).focus({ preventScroll: true });
};

function arm(pane: HTMLElement) {
  pane.querySelector('.t-hint')?.removeAttribute('hidden');
  const name = pane.getAttribute('aria-label') || 'Terminal';
  pane.setAttribute('aria-label', `${name}. Interactive: press Enter to type commands.`);
  pane.addEventListener('click', (e) => {
    if ((e.target as Element).closest('a')) return;
    const st = lives.get(pane);
    if (st) {
      if (!String(getSelection())) st.input.focus({ preventScroll: true });
      return;
    }
    goLive(pane);
  });
  pane.addEventListener('keydown', (e) => {
    if (e.target !== pane || lives.has(pane)) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      goLive(pane);
    }
  });
}

panes.forEach(arm);

// In story mode only the pane on screen is in the tab order; otherwise every pane is.
let active = 1;
function setFocusable() {
  const story = storyMode();
  for (const p of panes) p.tabIndex = !story || Number(p.dataset.row) === active ? 0 : -1;
}
setFocusable();

// The chapter crossing the middle of the viewport is the active one.
const crossing = new Set<number>();
const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      const row = Number((e.target as HTMLElement).dataset.row);
      if (e.isIntersecting) crossing.add(row);
      else crossing.delete(row);
    }
    const above = (document.querySelector('.story')?.getBoundingClientRect().top ?? 0) > innerHeight / 2;
    const next = crossing.size ? Math.max(...crossing) : above ? 1 : 0;
    if (next === active) return;
    active = next || active;
    setFocusable();
    // Hand back to the CSS demo once the reader moves on to another chapter.
    for (const p of panes) if (lives.has(p) && Number(p.dataset.row) !== next) handBack(p);
  },
  { rootMargin: '-50% 0px -50% 0px' },
);
chapters.forEach((c) => io.observe(c));

// A live pane also hands back once it leaves the viewport (narrow layouts, or past the story).
const gone = new IntersectionObserver((entries) => {
  for (const e of entries) if (!e.isIntersecting && lives.has(e.target as HTMLElement)) handBack(e.target as HTMLElement);
});
panes.forEach((p) => gone.observe(p));

addEventListener('resize', setFocusable);
reduceMotion.addEventListener('change', setFocusable);

// The try-it terminal is always live.
if (tryPane) {
  tryPane.querySelector('.t-hint')?.removeAttribute('hidden');
  // Focusable, so Esc has somewhere to return focus to; Enter or Space goes back to the prompt.
  tryPane.tabIndex = 0;
  tryPane.setAttribute('aria-label', `${tryPane.getAttribute('aria-label') || 'Terminal'}. Press Enter to type commands.`);
  makeLive(tryPane, { sticky: true });
  tryPane.addEventListener('keydown', (e) => {
    if (e.target !== tryPane || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    lives.get(tryPane)?.input.focus({ preventScroll: true });
  });
  tryPane.addEventListener('click', (e) => {
    if ((e.target as Element).closest('a')) return;
    for (const p of panes) leave(p, false);
    if (!String(getSelection())) lives.get(tryPane)?.input.focus({ preventScroll: true });
  });
}
