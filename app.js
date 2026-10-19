'use strict';

const state = { words: [], kanji: [], done: new Set(), wordLimit: 48, kanjiLimit: 120, activeKanji: null, returnFocus: null };
const KEY = 'nihongo-n4-progress-v1';
const $ = (selector) => document.querySelector(selector);

function loadProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (Array.isArray(saved)) state.done = new Set(saved.filter(x => typeof x === 'string'));
  } catch { state.done = new Set(); }
}

function saveProgress() {
  try { localStorage.setItem(KEY, JSON.stringify([...state.done])); } catch { /* Browser storage may be unavailable. */ }
}

function showView(name, updateHash = true) {
  if (!['accueil', 'vocabulaire', 'kanji'].includes(name)) name = 'accueil';
  document.querySelectorAll('.view').forEach(section => section.classList.toggle('active', section.id === name));
  document.querySelectorAll('[data-view]').forEach(button => {
    const active = button.dataset.view === name;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  if (updateHash && location.hash !== `#${name}`) history.replaceState(null, '', `#${name}`);
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function makeWordCard(word) {
  const card = element('article', 'word-card');
  const top = element('div', 'word-top');
  const name = element('div');
  name.append(element('div', 'word-jp', word.word), element('div', 'word-reading', word.reading));
  const button = element('button', 'learned', state.done.has(word.id) ? '✓' : '+');
  button.type = 'button';
  button.dataset.id = word.id;
  button.setAttribute('aria-pressed', String(state.done.has(word.id)));
  button.setAttribute('aria-label', `${state.done.has(word.id) ? 'Retirer des mots acquis' : 'Marquer comme acquis'} : ${word.word}`);
  top.append(name, button);
  card.append(top, element('p', 'word-meaning', word.fr || word.en));
  if (word.fr) card.append(element('p', 'word-extra', `EN : ${word.en}`));
  const meta = element('div', 'word-meta');
  meta.append(element('span', 'badge', word.level));
  if (word.compound) meta.append(element('span', 'badge', 'Composé'));
  card.append(meta);
  return card;
}

function matchesWord(word) {
  const q = $('#search').value.trim().toLocaleLowerCase();
  const collection = $('#collection').value;
  const level = $('#level').value;
  const writing = $('#writing').value;
  const status = $('#status').value;
  if (collection === 'priority' && !word.fr) return false;
  if (level !== 'all' && word.level !== level) return false;
  if (writing === 'compound' && !word.compound) return false;
  if (writing === 'kanji' && !word.kanji.length) return false;
  if (writing === 'kana' && word.kanji.length) return false;
  if (status === 'done' && !state.done.has(word.id)) return false;
  if (status === 'todo' && state.done.has(word.id)) return false;
  return !q || [word.word, word.reading, word.fr, word.en].some(value => String(value).toLocaleLowerCase().includes(q));
}

function renderWords() {
  const filtered = state.words.filter(matchesWord);
  const visible = filtered.slice(0, state.wordLimit);
  $('#word-list').replaceChildren(...visible.map(makeWordCard));
  $('#result-count').textContent = `${filtered.length.toLocaleString('fr-FR')} mot${filtered.length > 1 ? 's' : ''}`;
  $('#empty').hidden = filtered.length !== 0;
  $('#show-more').hidden = visible.length >= filtered.length;
  $('#progress-count').textContent = state.done.size.toLocaleString('fr-FR');
}

function renderKanji() {
  const q = $('#kanji-search').value.trim();
  const filtered = state.kanji.filter(item => !q || item.character.includes(q));
  const tiles = filtered.slice(0, state.kanjiLimit).map(item => {
    const tile = element('button', 'kanji-tile');
    tile.type = 'button';
    tile.dataset.kanji = item.character;
    tile.setAttribute('aria-label', `${item.character}, ${item.words.length} mots. Ouvrir la fiche.`);
    tile.append(element('strong', '', item.character), element('span', '', `${item.words.length} mots`));
    return tile;
  });
  $('#kanji-grid').replaceChildren(...tiles);
  $('#kanji-count').textContent = `${filtered.length.toLocaleString('fr-FR')} kanji`;
  $('#more-kanji').hidden = filtered.length <= state.kanjiLimit;
}

function openKanji(character, trigger) {
  const entry = state.kanji.find(item => item.character === character);
  if (!entry) return;
  state.activeKanji = character;
  state.returnFocus = trigger || document.activeElement;
  $('#dialog-title').textContent = character;
  $('#dialog-subtitle').textContent = `${entry.words.length} mots du corpus contenant ce kanji`;
  $('#dialog-list').replaceChildren(...entry.words.map(makeWordCard));
  $('#kanji-dialog').showModal();
  document.body.classList.add('modal-open');
  $('#dialog-close').focus();
}

function closeKanji() {
  $('#kanji-dialog').close();
}

function validateWords(payload) {
  if (!payload || !Array.isArray(payload.words)) throw new Error('Format de données invalide');
  return payload.words.filter(word => word && typeof word.id === 'string' && typeof word.word === 'string' && typeof word.reading === 'string' && typeof word.en === 'string' && Array.isArray(word.kanji) && ['N4', 'N5'].includes(word.level));
}

async function init() {
  loadProgress();
  showView(location.hash.slice(1), false);
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => showView(button.dataset.view)));
  $('.brand').addEventListener('click', event => { event.preventDefault(); showView('accueil'); });
  $('#start-button').addEventListener('click', () => { $('#collection').value = 'priority'; showView('vocabulaire'); });
  $('#browse-button').addEventListener('click', () => { $('#collection').value = 'all'; showView('vocabulaire'); renderWords(); });
  window.addEventListener('hashchange', () => showView(location.hash.slice(1), false));
  ['search', 'collection', 'level', 'writing', 'status'].forEach(id => $(`#${id}`).addEventListener('input', () => { state.wordLimit = 48; renderWords(); }));
  $('#reset-filters').addEventListener('click', () => { $('#search').value = ''; $('#collection').value = 'all'; $('#level').value = 'all'; $('#writing').value = 'all'; $('#status').value = 'all'; renderWords(); });
  $('#show-more').addEventListener('click', () => { state.wordLimit += 48; renderWords(); });
  $('#kanji-search').addEventListener('input', () => { state.kanjiLimit = 120; renderKanji(); });
  $('#more-kanji').addEventListener('click', () => { state.kanjiLimit += 120; renderKanji(); });
  $('#kanji-grid').addEventListener('click', event => { const trigger = event.target.closest('[data-kanji]'); if (trigger) openKanji(trigger.dataset.kanji, trigger); });
  $('#dialog-close').addEventListener('click', closeKanji);
  $('#kanji-dialog').addEventListener('click', event => { if (event.target === $('#kanji-dialog')) closeKanji(); });
  $('#kanji-dialog').addEventListener('close', () => { document.body.classList.remove('modal-open'); state.returnFocus?.focus(); state.activeKanji = null; });
  document.addEventListener('click', event => {
    const button = event.target.closest('.learned');
    if (!button) return;
    const id = button.dataset.id;
    state.done.has(id) ? state.done.delete(id) : state.done.add(id);
    saveProgress();
    renderWords();
    if ($('#kanji-dialog').open && state.activeKanji) {
      const oldScroll = $('#dialog-list').scrollTop;
      const entry = state.kanji.find(item => item.character === state.activeKanji);
      $('#dialog-list').replaceChildren(...entry.words.map(makeWordCard));
      $('#dialog-list').scrollTop = oldScroll;
    }
  });
  try {
    const response = await fetch('./data/vocabulary.json', { cache: 'default' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.words = validateWords(await response.json());
    const groups = new Map();
    state.words.forEach(word => word.kanji.forEach(character => {
      if (!groups.has(character)) groups.set(character, []);
      groups.get(character).push(word);
    }));
    state.kanji = [...groups].map(([character, words]) => ({ character, words })).sort((a, b) => b.words.length - a.words.length || a.character.localeCompare(b.character, 'ja'));
    $('#total-count').textContent = state.words.length.toLocaleString('fr-FR');
    $('#priority-count').textContent = state.words.filter(word => word.fr).length.toLocaleString('fr-FR');
    $('#loading').hidden = true;
    renderWords();
    renderKanji();
  } catch (error) {
    $('#loading').textContent = 'Impossible de charger les mots. Recharge la page. Pour un aperçu local, utilise un serveur HTTP (voir le README).';
    console.error('Chargement du vocabulaire :', error);
  }
}

init();
