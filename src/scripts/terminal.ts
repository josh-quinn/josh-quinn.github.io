/*
 * The home terminal's script (docs/decisions/0008-home-terminal-js.md and its Amendment 1),
 * home page only. Two jobs:
 *
 * 1. Demo controller. An IntersectionObserver finds the section most in view; its pane gets
 *    .is-active (story mode shows it) and .is-playing, re-added so its CSS loop restarts from
 *    the start. The loop itself is CSS (a steps() clock in terminal.css); this script never
 *    animates frame by frame and never maps scroll position to a frame.
 * 2. Mock terminal. Click a pane, or press Enter on it: its loop pauses where it is
 *    (.is-paused, animation-play-state) and a prompt appears below the frame. Scroll to another
 *    section, leave the prompt empty for 20s, or press Esc, and the loop starts again.
 *
 * Canned answers only (src/lib/terminal.ts over src/content/terminal.json). No network, no
 * eval, no innerHTML: every node is built with createElement and textContent or cloned from the
 * page, and nothing typed is kept beyond this page's memory.
 */
import term from '../content/terminal.json';
import { createSession, type Line, type TermData } from '../lib/terminal';

const IDLE_MS = 20_000;
// JSON imports type the fs tree too loosely for its recursive type: cast through unknown.
const data = term as unknown as TermData;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const wide = matchMedia('(min-width: 64rem)');
const storyMode = () => wide.matches && !reduceMotion.matches;

// One session for every pane; it starts where the demos end (the notes list has three notes).
const session = createSession(data);
for (const d of Object.values(data.demos)) for (const s of d.steps) session.run(s.cmd, { record: false });

interface Live {
  log: HTMLElement;
  form: HTMLElement;
  screen: HTMLElement;
  feed: HTMLElement | null;
  input: HTMLInputElement;
  stop: () => void;
}
const lives = new WeakMap<HTMLElement, Live>();
// Every live prompt's "cwd $" label: the panes share one session, so a cd anywhere moves them all.
const promptLabels = new Set<HTMLElement>();
const refreshPrompts = () => {
  for (const el of promptLabels) el.textContent = `${session.prompt()} $ `;
};

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

function promptLine(where: string, cmd: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 't-line';
  const ps = document.createElement('span');
  ps.className = 't-ps';
  ps.setAttribute('aria-hidden', 'true');
  ps.textContent = `${where} $ `;
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
    c.classList.remove('t-r');
    return c;
  });
}

/* ---- Loops --------------------------------------------------------------------------------- */

/** Start a pane's loop from the beginning (re-adding the class restarts its CSS clock). */
function play(pane: HTMLElement) {
  pane.classList.remove('is-playing', 'is-paused');
  void pane.offsetWidth;
  pane.classList.add('is-playing');
}

function stop(pane: HTMLElement) {
  pane.classList.remove('is-playing', 'is-paused');
}

/* ---- Line editing -------------------------------------------------------------------------- */

const wordStartBefore = (v: string, i: number) => {
  let j = i;
  while (j > 0 && v[j - 1] === ' ') j--;
  while (j > 0 && v[j - 1] !== ' ') j--;
  return j;
};

const wordEndAfter = (v: string, i: number) => {
  let j = i;
  while (j < v.length && v[j] === ' ') j++;
  while (j < v.length && v[j] !== ' ') j++;
  return j;
};

/* ---- Live prompt --------------------------------------------------------------------------- */

let uid = 0;

function makeLive(pane: HTMLElement, { sticky = false } = {}): HTMLInputElement {
  const screen = pane.querySelector<HTMLElement>('.t-screen')!;
  const feed = screen.querySelector<HTMLElement>('.t-feed');
  // Pause where it is. The screen keeps its height, so the page does not move when the
  // unshown rest of the demo folds away under the prompt.
  if (!sticky && pane.classList.contains('is-playing')) {
    screen.style.minHeight = `${screen.offsetHeight}px`;
    pane.classList.add('is-paused');
  }

  const log = document.createElement('div');
  log.className = 't-log';
  log.setAttribute('role', 'log');

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
  ps.textContent = `${session.prompt()} $ `;
  promptLabels.add(ps);

  // The input is the real, labelled control; .t-echo draws its text and the block cursor.
  const field = document.createElement('span');
  field.className = 't-field';
  const input = document.createElement('input');
  input.className = 't-input';
  input.id = id;
  input.type = 'text';
  input.autocomplete = 'off';
  input.setAttribute('autocapitalize', 'off');
  input.spellcheck = false;
  input.setAttribute('enterkeyhint', 'send');
  const echo = document.createElement('span');
  echo.className = 't-echo';
  echo.setAttribute('aria-hidden', 'true');
  const before = document.createElement('span');
  const block = document.createElement('span');
  block.className = 't-block';
  const after = document.createElement('span');
  echo.append(before, block, after);
  field.append(echo, input);
  form.append(label, ps, field);

  const draw = () => {
    const v = input.value;
    const at = input.selectionStart ?? v.length;
    before.textContent = v.slice(0, at);
    block.textContent = v[at] ?? ' ';
    after.textContent = v.slice(at + 1);
    echo.scrollLeft = input.scrollLeft;
  };
  const setLine = (value: string, caret = value.length) => {
    input.value = value;
    input.setSelectionRange(caret, caret);
    draw();
  };
  draw();

  screen.append(log, form);
  screen.classList.add('t-live-on');
  pane.classList.add('is-live');
  // Announce only what is printed from now on.
  log.setAttribute('aria-live', 'polite');

  let idle: ReturnType<typeof setTimeout> | undefined;
  // History is shared by every pane. Browsing starts at the newest entry each time the input
  // gets focus; the line being typed is kept as a draft that arrow down past the newest restores.
  let pos = session.history.length;
  let draft = '';
  // The line whose Tab candidates were just printed: another Tab on it moves focus on instead.
  let listed: string | null = null;
  const resetIdle = () => {
    clearTimeout(idle);
    if (sticky) return;
    idle = setTimeout(() => {
      if (!input.value) leave(pane, document.activeElement === input);
    }, IDLE_MS);
  };
  resetIdle();

  const scrollEnd = () => {
    screen.scrollTop = screen.scrollHeight;
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
  const clear = () => {
    const wipe = () => {
      log.replaceChildren();
      if (feed) feed.hidden = true;
    };
    if (reduceMotion.matches) wipe();
    else queue = queue.then(wipe);
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const value = input.value;
    const where = session.prompt();
    setLine('');
    // Queued like the output, so a quick second command never lands inside the first's answer.
    emit([promptLine(where, value)]);
    const out = session.run(value);
    refreshPrompts();
    pos = session.history.length;
    draft = '';
    if (out.kind === 'clear') clear();
    else if (out.kind === 'exit') {
      leave(pane, true);
      return;
    } else if (out.kind === 'lines') print(out.lines);
    else {
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
    // Cmd/Meta combinations belong to the browser (Cmd+W closes the tab): never intercept them.
    if (e.metaKey) return;
    resetIdle();
    const v = input.value;
    const at = input.selectionStart ?? v.length;
    const history = session.history;
    const plain = !e.ctrlKey && !e.altKey;
    if (e.key === 'Escape') {
      e.preventDefault();
      // The try-it pane stays live; focus goes back to the pane itself, never to <body>.
      if (sticky) pane.focus({ preventScroll: true });
      else leave(pane, true);
    } else if (e.key === 'Tab' && plain && !e.shiftKey) {
      // No trap: an empty line, or nothing to complete, lets Tab move focus on.
      // The same: a Tab that would only print the candidates already shown for this line.
      const c = session.complete(v);
      if (c.kind === 'none' || (c.kind === 'one' && c.value === v)) return;
      if (c.kind === 'many' && c.value === v && listed === v) return;
      e.preventDefault();
      if (c.kind === 'one') setLine(c.value);
      else if (c.value !== v) setLine(c.value);
      else {
        emit([promptLine(session.prompt(), v), lineNode(c.candidates.join('  '))]);
        listed = v;
      }
    } else if (e.key === 'ArrowUp' && plain) {
      if (!history.length) return;
      e.preventDefault();
      if (pos >= history.length) draft = v;
      pos = Math.max(0, Math.min(pos, history.length) - 1);
      setLine(history[pos] ?? '');
    } else if (e.key === 'ArrowDown' && plain) {
      e.preventDefault();
      if (pos >= history.length) return;
      pos += 1;
      setLine(pos >= history.length ? draft : (history[pos] ?? ''));
    } else if (e.ctrlKey && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'l') clear();
      else if (k === 'a') setLine(v, 0);
      else if (k === 'e') setLine(v, v.length);
      else if (k === 'w') setLine(v.slice(0, wordStartBefore(v, at)) + v.slice(at), wordStartBefore(v, at));
      else if (k === 'u') setLine(v.slice(at), 0);
      else return;
      e.preventDefault();
    } else if (e.altKey && !e.ctrlKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      setLine(v, e.key === 'ArrowLeft' ? wordStartBefore(v, at) : wordEndAfter(v, at));
    }
  });
  for (const ev of ['input', 'keyup', 'mouseup', 'select', 'focus', 'blur']) input.addEventListener(ev, draw);
  input.addEventListener('focus', () => {
    pos = session.history.length;
    draft = '';
  });
  input.addEventListener('input', () => {
    listed = null;
  });
  input.addEventListener('input', resetIdle);

  lives.set(pane, { log, form, screen, feed, input, stop: () => clearTimeout(idle) });
  scrollEnd();
  return input;
}

function leave(pane: HTMLElement, refocus: boolean) {
  const st = lives.get(pane);
  if (!st) return;
  st.stop();
  st.log.remove();
  st.form.remove();
  promptLabels.delete(st.form.querySelector<HTMLElement>('.t-ps')!);
  st.screen.classList.remove('t-live-on');
  st.screen.style.removeProperty('min-height');
  if (st.feed) st.feed.hidden = false;
  pane.classList.remove('is-live');
  lives.delete(pane);
  // The loop starts again from the beginning; a pane that is not on screen stays still.
  if (Number(pane.dataset.row) === shownRow) play(pane);
  else stop(pane);
  if (refocus) pane.focus({ preventScroll: true });
}

const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';
const shown = (el: Element) => {
  const r = el.getBoundingClientRect();
  return el.checkVisibility({ visibilityProperty: true }) && r.bottom > 0 && r.top < innerHeight;
};

/** Where focus goes when a focused prompt is handed back: always visible, never <body>. */
function focusTarget(pane: HTMLElement): HTMLElement | null {
  if (!storyMode()) return pane;
  // Story mode: the pane now on screen (the handed-back one is hidden; past the story, the
  // last pane while it is still in view), else the first focusable thing after the story.
  const onScreen = panes.find((p) => Number(p.dataset.row) === shownRow);
  if (onScreen && shown(onScreen)) return onScreen;
  const story = document.querySelector('.story');
  const after = [...document.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => story && story.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING && !story.contains(el) && el.checkVisibility({ visibilityProperty: true }),
  );
  // Prefer one the reader can see now, so focus does not scroll the page away.
  return after.find(shown) ?? after[0] ?? tryPane;
}

/**
 * Hand a live pane back after a scroll (another section, or the pane leaving the viewport).
 * If its prompt had focus, focus moves to something visible (focusTarget). Call it only after
 * the classes and tab order for the new active section are in place.
 */
function handBack(pane: HTMLElement) {
  const st = lives.get(pane);
  if (!st) return;
  const hadFocus = document.activeElement === st.input;
  leave(pane, false);
  if (hadFocus) focusTarget(pane)?.focus({ preventScroll: true });
}

/* ---- Wiring -------------------------------------------------------------------------------- */

const panes = [...document.querySelectorAll<HTMLElement>('.story .term')];
const tryPane = document.querySelector<HTMLElement>('.term[data-demo="try"]');
let active = 0;
// The row whose pane shows: the active one, or, just past the story, the last pane while it is
// still in view (it scrolls away with the story).
let shownRow = 0;

document.documentElement.classList.add('term-js');

const goLive = (pane: HTMLElement) => {
  for (const p of panes) if (p !== pane) leave(p, false);
  (lives.get(pane)?.input ?? makeLive(pane)).focus({ preventScroll: true });
};

function arm(pane: HTMLElement) {
  pane.querySelector('.t-hint')?.removeAttribute('hidden');
  const name = pane.getAttribute('aria-label') || 'Terminal';
  pane.setAttribute('aria-label', `${name}. Interactive: press Enter to type commands.`);
  pane.addEventListener('click', (e) => {
    if ((e.target as Element).closest('a')) return;
    if (lives.has(pane) && String(getSelection())) return;
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
function setFocusable() {
  const story = storyMode();
  for (const p of panes) p.tabIndex = !story || Number(p.dataset.row) === shownRow ? 0 : -1;
}

/** Make a section active: show its pane and restart its loop; the other panes stand still. */
function setActive(next: number) {
  if (next === active) return;
  active = next;
  const last = panes.at(-1);
  const lastInView = !!last && last.getBoundingClientRect().bottom > 0;
  shownRow = active || (storyMode() && lastInView ? Number(last!.dataset.row) : 0);
  // Classes and tab order first, so the pane focus may move to is already visible ...
  for (const p of panes) {
    const on = Number(p.dataset.row) === shownRow;
    p.classList.toggle('is-active', on);
    if (lives.has(p)) continue;
    if (on) play(p);
    else stop(p);
  }
  setFocusable();
  // ... then hand back any prompt left on a pane that no longer shows, and move focus off a
  // pane that has just been hidden.
  for (const p of panes) if (lives.has(p) && Number(p.dataset.row) !== shownRow) handBack(p);
  const f = document.activeElement as HTMLElement | null;
  if (storyMode() && f && panes.includes(f) && Number(f.dataset.row) !== shownRow) focusTarget(f)?.focus({ preventScroll: true });
}

// The section most in view is the active one: its pane and its prose, by visible height.
const seen = new Map<Element, number>();
const pick = () => {
  const score = new Map<number, number>();
  for (const [el, h] of seen) {
    const row = Number((el as HTMLElement).dataset.row);
    score.set(row, (score.get(row) ?? 0) + h);
  }
  let best = 0;
  let most = 0;
  for (const [row, h] of score) if (h > most || (h === most && h > 0 && row < best)) [best, most] = [row, h];
  if (best) return best;
  // Above the story the first section counts as active; below it, none does.
  return (document.querySelector('.story')?.getBoundingClientRect().top ?? 0) > 0 ? 1 : 0;
};
const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) seen.set(e.target, e.isIntersecting ? e.intersectionRect.height : 0);
    setActive(pick());
  },
  { threshold: Array.from({ length: 21 }, (_, i) => i / 20) },
);
for (const el of document.querySelectorAll<HTMLElement>('.story > .split-media, .story > .split-prose')) {
  const row = el.matches('.split-media') ? el.querySelector<HTMLElement>('.term')?.dataset.row : el.dataset.row;
  if (row) el.dataset.row = row;
  io.observe(el);
}
setActive(1);

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
