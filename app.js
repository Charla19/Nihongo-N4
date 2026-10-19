'use strict';

const state = { words: [], kanji: [], done: new Set(), wordLimit: 48, kanjiLimit: 120, activeKanji: null, returnFocus: null };
const KEY = 'nihongo-n4-progress-v1';
const ACCOUNT_KEY = 'nihongo-n4-account-v1-';
const PENDING_KEY = 'nihongo-n4-pending-v1-';
const $ = (selector) => document.querySelector(selector);
const cloud = new NihongoCloud();
let installPrompt = null;
let pendingEmail = '';
let syncing = false;
let syncTimer = null;
let verifiedCloudThisSession = false;

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installPrompt = event;
  $('#install-button').hidden = false;
});

window.addEventListener('appinstalled', () => {
  installPrompt = null;
  $('#install-button').hidden = true;
  $('#install-status').textContent = 'Nihongo N4 est installé sur cet appareil.';
});

function storedSet(key) {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '[]');
    return new Set(Array.isArray(saved) ? saved.filter(x => typeof x === 'string') : []);
  } catch { return new Set(); }
}

function storedPending(userId) {
  try {
    const saved = JSON.parse(localStorage.getItem(PENDING_KEY + userId) || '{}');
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
  } catch { return {}; }
}

function savePending(userId, pending) {
  try { localStorage.setItem(PENDING_KEY + userId, JSON.stringify(pending)); } catch { /* Storage may be unavailable. */ }
}

function loadProgress() {
  state.done = storedSet(KEY);
}

function saveProgress() {
  const key = cloud.user ? ACCOUNT_KEY + cloud.user.id : KEY;
  try { localStorage.setItem(key, JSON.stringify([...state.done])); } catch { /* Browser storage may be unavailable. */ }
}

function activateAccount() {
  const userId = cloud.user.id;
  verifiedCloudThisSession = false;
  let hasAccountCache = false;
  try { hasAccountCache = localStorage.getItem(ACCOUNT_KEY + userId) !== null; } catch { /* Use guest progress below. */ }
  state.done = hasAccountCache ? storedSet(ACCOUNT_KEY + userId) : storedSet(KEY);
  if (!hasAccountCache) {
    const pending = storedPending(userId);
    state.done.forEach(id => { pending[id] = true; });
    savePending(userId, pending);
  }
  saveProgress();
  updateAccountUI();
  renderWords();
}

function updateAccountUI(message = '') {
  const user = cloud.user;
  const queued = user ? Object.keys(storedPending(user.id)).length : 0;
  $('#account-button').textContent = user ? 'Mon compte' : 'Connexion';
  $('#account-summary').textContent = user ? 'Progression liée à ton compte' : 'Progression sur cet appareil';
  $('#sync-status').textContent = message || (user
    ? (!navigator.onLine ? 'Hors ligne · les changements seront envoyés au retour du réseau.' : queued ? `${queued} changement${queued > 1 ? 's' : ''} à synchroniser.` : verifiedCloudThisSession ? 'Progression synchronisée entre tes appareils.' : 'Vérification de la progression en ligne…')
    : 'Connecte-toi pour la retrouver sur tes autres appareils.');
  $('#sync-action').textContent = user ? 'Voir mon compte' : 'Sauvegarder en ligne';
  $('#account-guest').hidden = Boolean(user);
  $('#account-signed-in').hidden = !user;
  if (user) {
    $('#account-address').textContent = user.email || '';
    $('#account-sync-detail').textContent = $('#sync-status').textContent;
  }
}

function scheduleSync() {
  if (!cloud.user || !navigator.onLine) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncProgress, 700);
}

async function syncProgress() {
  if (!cloud.user || !navigator.onLine || syncing) return;
  syncing = true;
  let success = false;
  const userId = cloud.user.id;
  updateAccountUI('Synchronisation en cours…');
  try {
    const rows = await cloud.getProgress();
    if (!cloud.user || cloud.user.id !== userId) return;
    const merged = new Set(rows.filter(row => row.learned).map(row => row.word_id));
    const pending = storedPending(userId);
    for (const [id, learned] of Object.entries(pending)) {
      if (learned) merged.add(id);
      else merged.delete(id);
    }
    state.done = merged;
    saveProgress();
    renderWords();
    const changes = Object.entries(pending).filter(([id, learned]) => typeof id === 'string' && typeof learned === 'boolean');
    if (changes.length) {
      await cloud.saveProgress(changes);
      const current = storedPending(userId);
      for (const [id, learned] of changes) {
        if (current[id] === learned) delete current[id];
      }
      savePending(userId, current);
    }
    success = true;
    verifiedCloudThisSession = true;
    if (cloud.user?.id === userId) updateAccountUI('Progression synchronisée.');
  } catch (error) {
    console.error('Synchronisation :', error);
    updateAccountUI('Synchronisation indisponible. Tes changements restent sur cet appareil.');
  } finally {
    syncing = false;
    if (success && cloud.user?.id === userId && navigator.onLine && Object.keys(storedPending(userId)).length) scheduleSync();
  }
}

function openAccount() {
  updateAccountUI();
  $('#account-message').textContent = '';
  $('#account-dialog').showModal();
  document.body.classList.add('modal-open');
  (cloud.user ? $('#sync-now') : $('#account-email')).focus();
}

function closeAccount() {
  $('#account-dialog').close();
}

function setupAccount() {
  $('#account-button').addEventListener('click', openAccount);
  $('#sync-action').addEventListener('click', openAccount);
  $('#account-close').addEventListener('click', closeAccount);
  $('#account-dialog').addEventListener('click', event => {
    if (event.target === $('#account-dialog')) closeAccount();
  });
  $('#account-dialog').addEventListener('close', () => {
    document.body.classList.remove('modal-open');
    $('#account-button').focus();
  });
  $('#email-form').addEventListener('submit', async event => {
    event.preventDefault();
    const email = $('#account-email').value.trim().toLowerCase();
    if (!email) return;
    const button = $('#email-form button[type=submit]');
    button.disabled = true;
    $('#account-message').textContent = 'Envoi du code…';
    try {
      await cloud.sendCode(email);
      pendingEmail = email;
      $('#code-recipient').textContent = email;
      $('#email-form').hidden = true;
      $('#code-form').hidden = false;
      $('#account-message').textContent = 'Code envoyé. Vérifie aussi les spams si nécessaire.';
      $('#account-code').focus();
    } catch (error) {
      $('#account-message').textContent = error.message || 'Impossible d’envoyer le code. Réessaie.';
    } finally { button.disabled = false; }
  });
  $('#change-email').addEventListener('click', () => {
    $('#code-form').hidden = true;
    $('#email-form').hidden = false;
    $('#account-message').textContent = '';
    $('#account-email').focus();
  });
  $('#account-code').addEventListener('input', event => {
    event.target.value = event.target.value.replace(/\D/g, '').slice(0, 8);
  });
  $('#resend-code').addEventListener('click', async () => {
    const button = $('#resend-code');
    button.disabled = true;
    $('#account-message').textContent = 'Envoi d’un nouveau code…';
    try {
      await cloud.sendCode(pendingEmail);
      $('#account-code').value = '';
      $('#account-message').textContent = 'Nouveau code envoyé. Utilise le plus récent.';
      $('#account-code').focus();
    } catch (error) {
      $('#account-message').textContent = error.message || 'Impossible d’envoyer le code. Réessaie.';
    } finally { button.disabled = false; }
  });
  $('#code-form').addEventListener('submit', async event => {
    event.preventDefault();
    const token = $('#account-code').value.trim();
    const button = $('#code-form button[type=submit]');
    button.disabled = true;
    $('#account-message').textContent = 'Connexion…';
    try {
      await cloud.verifyCode(pendingEmail, token);
      activateAccount();
      $('#account-message').textContent = 'Connecté. Ta progression est en cours de synchronisation.';
      closeAccount();
      await syncProgress();
    } catch (error) {
      $('#account-message').textContent = /token has expired or is invalid/i.test(error.message || '')
        ? 'Code invalide ou expiré. Vérifie les huit chiffres ou demande un nouveau code.'
        : error.message || 'Impossible de vérifier le code. Réessaie.';
    } finally { button.disabled = false; }
  });
  $('#sync-now').addEventListener('click', syncProgress);
  $('#account-sign-out').addEventListener('click', async () => {
    await cloud.signOut();
    verifiedCloudThisSession = false;
    loadProgress();
    updateAccountUI();
    renderWords();
    closeAccount();
  });
  window.addEventListener('online', () => { updateAccountUI(); scheduleSync(); });
  window.addEventListener('offline', () => updateAccountUI());
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) scheduleSync();
  });
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
  setupAccount();
  if (cloud.user) {
    activateAccount();
    scheduleSync();
  } else updateAccountUI();
  if (window.matchMedia('(display-mode: standalone)').matches) {
    $('#install-status').textContent = 'Application installée sur cet appareil.';
  }
  $('#install-button').addEventListener('click', async () => {
    if (!installPrompt) return;
    const prompt = installPrompt;
    installPrompt = null;
    $('#install-button').hidden = true;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome !== 'accepted') {
      $('#install-status').textContent = 'Tu peux aussi installer l’application depuis le menu de Chrome.';
    }
  });
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
    if (cloud.user) {
      const pending = storedPending(cloud.user.id);
      pending[id] = state.done.has(id);
      savePending(cloud.user.id, pending);
      updateAccountUI();
      scheduleSync();
    }
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

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(error => console.warn('Mode hors ligne indisponible :', error));
  });
}
