import { listBoards, getBoard, saveBoard, deleteBoard } from './db.js';

const MIN_TILES = 2;
const MAX_TILES = 6;
const MAX_RECORD_MS = 15000;
const MAX_IMAGE_SIDE = 1200;
const HOLD_TO_EXIT_MS = 900;
const REPEAT_TAP_GUARD_MS = 700;

const ICONS = {
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  camera: '<svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  image: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5-5-8 8"/></svg>',
  mic: '<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  speaker: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11"/></svg>',
};

const app = document.getElementById('app');
let cleanup = null;
let routeToken = 0;

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key === 'class') el.className = value;
    else if (key === 'html') el.innerHTML = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  el.append(...children.flat().filter(c => c != null && c !== false && c !== ''));
  return el;
}

const icon = name => h('span', { class: 'icon', 'aria-hidden': 'true', html: ICONS[name] });

function urlTracker() {
  const urls = [];
  return {
    make(blob) {
      const url = URL.createObjectURL(blob);
      urls.push(url);
      return url;
    },
    revokeAll() {
      urls.forEach(url => URL.revokeObjectURL(url));
      urls.length = 0;
    },
  };
}

const newTile = () => ({ id: crypto.randomUUID(), label: '', image: null, audio: null });
const usableTiles = board => board.tiles.filter(t => t.image || t.label.trim());
const isReady = board => usableTiles(board).length >= MIN_TILES;
const hasContent = board => board.name.trim() || board.tiles.some(t => t.image || t.audio || t.label.trim());

function boardTitle(board) {
  return board.name.trim()
    || usableTiles(board).map(t => t.label.trim()).filter(Boolean).join(' / ')
    || 'Untitled choice';
}

function speak(text) {
  if (!text?.trim() || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text.trim());
  utterance.lang = navigator.language;
  utterance.rate = 0.9;
  speechSynthesis.speak(utterance);
}

async function shrinkImage(file) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    return blob || file;
  } catch {
    return file;
  }
}

async function route() {
  const token = ++routeToken;
  const previous = cleanup;
  cleanup = null;
  await previous?.();

  const [, view, id] = location.hash.match(/^#\/(edit|use)\/(.+)$/) || [];
  const render = view === 'edit' ? renderEditor : view === 'use' ? renderChoice : renderHome;
  const result = await render(id);
  if (!result) return;
  if (token !== routeToken) {
    await result.cleanup?.();
    return;
  }
  app.replaceChildren(result.el);
  cleanup = result.cleanup;
  result.mounted?.();
  window.scrollTo(0, 0);
}

/* ---------- Home ---------- */

async function createBoard() {
  const board = { id: crypto.randomUUID(), name: '', createdAt: Date.now(), tiles: [newTile(), newTile()] };
  await saveBoard(board);
  navigator.storage?.persist?.().catch(() => {});
  location.hash = `#/edit/${board.id}`;
}

function boardRow(board, urls) {
  const title = boardTitle(board);
  const thumbs = usableTiles(board).slice(0, 3).map(t => t.image
    ? h('img', { src: urls.make(t.image), alt: '' })
    : h('span', { class: 'thumb-text' }, Array.from(t.label.trim())[0]?.toUpperCase()));
  return h('li', { class: 'board-row' },
    h('a', { class: 'board-open', href: isReady(board) ? `#/use/${board.id}` : `#/edit/${board.id}` },
      h('span', { class: 'thumbs' }, thumbs),
      h('span', { class: 'board-name' }, title)),
    h('a', { class: 'btn btn-icon', href: `#/edit/${board.id}`, 'aria-label': `Edit ${title}` }, icon('edit')));
}

async function renderHome() {
  const boards = await listBoards();
  const urls = urlTracker();
  const el = h('div', { class: 'page' },
    h('header', { class: 'topbar' }, h('h1', {}, 'AAC on a Pinch')),
    h('button', { class: 'btn btn-primary btn-xl', type: 'button', onclick: createBoard }, icon('plus'), 'New choice'),
    boards.length
      ? h('ul', { class: 'board-list' }, boards.map(b => boardRow(b, urls)))
      : h('p', { class: 'empty' },
        'Take a photo for each option, add a word or record your voice, then hand over the phone. ',
        'Everything stays on this device.'));
  return { el, cleanup: urls.revokeAll };
}

/* ---------- Editor ---------- */

async function renderEditor(id) {
  const board = await getBoard(id);
  if (!board) {
    location.replace('#/');
    return null;
  }

  const urls = urlTracker();
  const voiceRenderers = new Map();
  let saveTimer = null;
  let recording = null;
  let preview = null;
  let deleted = false;

  const save = () => {
    clearTimeout(saveTimer);
    return deleted ? Promise.resolve() : saveBoard(board);
  };
  const saveSoon = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 400);
  };
  const flushOnHide = () => { if (document.visibilityState === 'hidden') save(); };
  document.addEventListener('visibilitychange', flushOnHide);

  function stopPreview() {
    preview?.pause();
    preview = null;
    window.speechSynthesis?.cancel();
  }

  function playPreview(tile) {
    stopPreview();
    preview = new Audio(urls.make(tile.audio));
    preview.play().catch(() => {});
  }

  async function stopRecording() {
    await recording?.stop();
  }

  async function startRecording(tile) {
    await stopRecording();
    stopPreview();
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      alert('The microphone is blocked. Allow it in the browser settings to record, or leave it empty and the phone will read the word aloud.');
      return;
    }
    const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(t => MediaRecorder.isTypeSupported(t));
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks = [];
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    const stopRecorder = () => { if (recorder.state !== 'inactive') recorder.stop(); };
    const limit = setTimeout(stopRecorder, MAX_RECORD_MS);
    const finished = new Promise(resolve => { recorder.onstop = resolve; }).then(async () => {
      clearTimeout(limit);
      stream.getTracks().forEach(t => t.stop());
      if (chunks.length) {
        tile.audio = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' });
        await save();
      }
      recording = null;
      voiceRenderers.get(tile.id)?.();
    });
    recording = { tileId: tile.id, stop: () => { stopRecorder(); return finished; } };
    recorder.start();
    voiceRenderers.get(tile.id)?.();
  }

  function voiceControls(tile) {
    if (recording?.tileId === tile.id) {
      return [h('button', { class: 'btn btn-rec btn-wide', type: 'button', onclick: () => stopRecording() },
        h('span', { class: 'rec-dot' }), 'Stop recording')];
    }
    if (tile.audio) {
      return [h('div', { class: 'row' },
        h('button', { class: 'btn', type: 'button', onclick: () => playPreview(tile) }, icon('play'), 'Play'),
        h('button', { class: 'btn', type: 'button', onclick: () => startRecording(tile) }, icon('mic'), 'Re-record'),
        h('button', {
          class: 'btn btn-icon btn-danger', type: 'button', 'aria-label': 'Delete recording',
          onclick: async () => {
            tile.audio = null;
            await save();
            voiceRenderers.get(tile.id)?.();
          },
        }, icon('trash')))];
    }
    return [
      h('div', { class: 'row' },
        h('button', { class: 'btn', type: 'button', onclick: () => startRecording(tile) }, icon('mic'), 'Record voice'),
        h('button', { class: 'btn', type: 'button', onclick: () => { stopPreview(); speak(tile.label); } }, icon('speaker'), 'Test')),
      h('p', { class: 'voice-note' }, 'No recording yet, so the phone’s voice will read the word.'),
    ];
  }

  async function setImage(tile, file) {
    if (!file) return;
    tile.image = await shrinkImage(file);
    await save();
    rerenderCard(tile);
    refreshFooter();
  }

  async function removeTile(tile) {
    if ((tile.image || tile.audio) && !confirm('Remove this option?')) return;
    if (recording?.tileId === tile.id) await stopRecording();
    board.tiles = board.tiles.filter(t => t !== tile);
    voiceRenderers.delete(tile.id);
    await save();
    renderTiles();
  }

  function tileCard(tile, index) {
    const filePicker = capture => {
      const input = h('input', { type: 'file', accept: 'image/*', capture, hidden: true });
      input.addEventListener('change', () => setImage(tile, input.files[0]));
      return input;
    };
    const cameraInput = filePicker('environment');
    const galleryInput = filePicker(null);

    const photo = tile.image
      ? h('img', { class: 'photo', src: urls.make(tile.image), alt: tile.label || `Option ${index + 1} photo` })
      : h('button', { class: 'photo photo-empty', type: 'button', onclick: () => cameraInput.click() },
        icon('camera'), h('span', {}, 'Take photo'));

    const label = h('input', {
      class: 'label-input', type: 'text', value: tile.label, maxlength: '40', autocomplete: 'off',
      enterkeyhint: 'done', placeholder: 'Word to say, e.g. This ride', 'aria-label': `Option ${index + 1} word`,
    });
    label.addEventListener('input', () => {
      tile.label = label.value;
      saveSoon();
      refreshFooter();
    });
    label.addEventListener('keydown', e => { if (e.key === 'Enter') label.blur(); });

    const voice = h('div', { class: 'voice' });
    const renderVoice = () => voice.replaceChildren(...voiceControls(tile));
    voiceRenderers.set(tile.id, renderVoice);
    renderVoice();

    return h('section', { class: 'tile-card', 'data-tile': tile.id },
      h('div', { class: 'tile-card-head' },
        h('span', {}, `Option ${index + 1}`),
        board.tiles.length > MIN_TILES && h('button', {
          class: 'btn btn-icon btn-ghost', type: 'button', 'aria-label': `Remove option ${index + 1}`,
          onclick: () => removeTile(tile),
        }, icon('trash'))),
      photo,
      h('div', { class: 'row' },
        h('button', { class: 'btn', type: 'button', onclick: () => cameraInput.click() }, icon('camera'), 'Camera'),
        h('button', { class: 'btn', type: 'button', onclick: () => galleryInput.click() }, icon('image'), 'Gallery'),
        tile.image && h('button', {
          class: 'btn btn-icon btn-danger', type: 'button', 'aria-label': 'Remove photo',
          onclick: async () => {
            tile.image = null;
            await save();
            rerenderCard(tile);
            refreshFooter();
          },
        }, icon('trash'))),
      label,
      voice,
      cameraInput,
      galleryInput);
  }

  const tilesEl = h('div', { class: 'tile-editors' });

  function rerenderCard(tile) {
    tilesEl.querySelector(`[data-tile="${tile.id}"]`)?.replaceWith(tileCard(tile, board.tiles.indexOf(tile)));
  }

  function renderTiles() {
    tilesEl.replaceChildren(...board.tiles.map(tileCard));
    refreshFooter();
  }

  const nameInput = h('input', {
    class: 'name-input', type: 'text', value: board.name, maxlength: '40', autocomplete: 'off',
    placeholder: 'Name (optional)', 'aria-label': 'Choice name',
  });
  nameInput.addEventListener('input', () => {
    board.name = nameInput.value;
    saveSoon();
  });

  const addBtn = h('button', {
    class: 'btn btn-wide', type: 'button',
    onclick: async () => {
      board.tiles.push(newTile());
      await save();
      renderTiles();
    },
  }, icon('plus'), 'Add option');

  const hint = h('p', { class: 'hint' });
  const useBtn = h('a', { class: 'btn btn-primary btn-xl', href: `#/use/${board.id}` }, 'Show choices');
  useBtn.addEventListener('click', e => { if (!isReady(board)) e.preventDefault(); });

  function refreshFooter() {
    const ready = isReady(board);
    addBtn.hidden = board.tiles.length >= MAX_TILES;
    useBtn.classList.toggle('disabled', !ready);
    useBtn.setAttribute('aria-disabled', String(!ready));
    hint.textContent = ready ? '' : 'Add a photo or a word to at least two options.';
  }

  async function removeBoard() {
    if (!confirm('Delete this choice? This cannot be undone.')) return;
    deleted = true;
    await stopRecording();
    await deleteBoard(board.id);
    location.hash = '#/';
  }

  const el = h('div', { class: 'page editor' },
    h('header', { class: 'topbar' },
      h('a', { class: 'btn btn-icon', href: '#/', 'aria-label': 'Back' }, icon('back')),
      nameInput),
    tilesEl,
    addBtn,
    h('button', { class: 'btn btn-ghost btn-danger btn-wide', type: 'button', onclick: removeBoard }, icon('trash'), 'Delete this choice'),
    h('div', { class: 'footer' }, hint, useBtn));

  renderTiles();

  return {
    el,
    cleanup: async () => {
      document.removeEventListener('visibilitychange', flushOnHide);
      stopPreview();
      await stopRecording();
      urls.revokeAll();
      if (deleted) return;
      if (hasContent(board)) {
        await save();
      } else {
        deleted = true;
        clearTimeout(saveTimer);
        await deleteBoard(board.id);
      }
    },
  };
}

/* ---------- Choice mode ---------- */

function holdToExit(onExit) {
  const btn = h('button', { class: 'hold-exit', type: 'button', style: `--hold-ms:${HOLD_TO_EXIT_MS}ms` },
    icon('back'), h('span', {}, 'Hold to exit'));
  let timer = null;
  const cancel = () => {
    clearTimeout(timer);
    btn.classList.remove('holding');
  };
  btn.addEventListener('pointerdown', e => {
    e.preventDefault();
    btn.setPointerCapture?.(e.pointerId);
    btn.classList.add('holding');
    timer = setTimeout(() => {
      cancel();
      onExit();
    }, HOLD_TO_EXIT_MS);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) btn.addEventListener(type, cancel);
  return btn;
}

async function renderChoice(id) {
  const [board, boards] = await Promise.all([getBoard(id), listBoards()]);
  if (!board) {
    location.replace('#/');
    return null;
  }
  if (!isReady(board)) {
    location.replace(`#/edit/${id}`);
    return null;
  }

  const tiles = usableTiles(board);
  const urls = urlTracker();
  const players = new Map();
  for (const tile of tiles) {
    if (!tile.audio) continue;
    const audio = new Audio(urls.make(tile.audio));
    audio.preload = 'auto';
    players.set(tile.id, audio);
  }
  const stopAll = () => {
    players.forEach(a => a.pause());
    window.speechSynthesis?.cancel();
  };

  const grid = h('div', { class: 'choice-grid', 'data-count': String(tiles.length) });
  let lastTap = { id: null, at: 0 };

  function choose(tile, btn) {
    const now = performance.now();
    if (lastTap.id === tile.id && now - lastTap.at < REPEAT_TAP_GUARD_MS) return;
    lastTap = { id: tile.id, at: now };
    stopAll();
    for (const child of grid.children) child.classList.toggle('chosen', child === btn);
    grid.classList.add('has-choice');
    const audio = players.get(tile.id);
    if (audio) {
      audio.currentTime = 0;
      audio.play().catch(() => speak(tile.label));
    } else {
      speak(tile.label);
    }
  }

  grid.append(...tiles.map(tile => {
    const label = tile.label.trim();
    const btn = h('button', { class: tile.image ? 'choice' : 'choice text-only', type: 'button', 'aria-label': label || 'Option' },
      tile.image && h('img', { src: urls.make(tile.image), alt: '', draggable: 'false' }),
      label && h('span', { class: 'choice-label' }, label));
    btn.addEventListener('click', () => choose(tile, btn));
    return btn;
  }));

  const readyBoards = boards.filter(isReady);
  const switcher = readyBoards.length > 1
    ? h('nav', { class: 'switcher', 'aria-label': 'Switch choice' }, readyBoards.map(b => h('a', {
      href: `#/use/${b.id}`,
      'aria-current': b.id === board.id ? 'page' : null,
      onclick: e => {
        e.preventDefault();
        location.replace(`#/use/${b.id}`);
      },
    }, boardTitle(b))))
    : h('span', { class: 'choice-title' }, boardTitle(board));

  const el = h('div', { class: 'choice-screen' },
    h('div', { class: 'choice-bar' }, holdToExit(() => { location.hash = '#/'; }), switcher),
    grid);
  el.addEventListener('contextmenu', e => e.preventDefault());

  let alive = true;
  let wakeLock = null;
  const keepAwake = async () => {
    if (!alive || document.visibilityState !== 'visible' || !navigator.wakeLock) return;
    try {
      const lock = await navigator.wakeLock.request('screen');
      if (alive) wakeLock = lock;
      else lock.release();
    } catch { /* wake lock is best-effort */ }
  };
  document.addEventListener('visibilitychange', keepAwake);

  return {
    el,
    mounted: keepAwake,
    cleanup: () => {
      alive = false;
      document.removeEventListener('visibilitychange', keepAwake);
      wakeLock?.release().catch(() => {});
      stopAll();
      urls.revokeAll();
    },
  };
}

window.addEventListener('hashchange', route);
route();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
