'use strict';

const state = { words: [], kanji: [], done: new Set(), seen: new Set(), mastered: new Set(), groups: [], track: 'fr', activeGroup: null, studyIndex: 0, quiz: null, wordLimit: 48, kanjiLimit: 120, activeKanji: null, returnFocus: null };
const KEY = 'nihongo-n4-progress-v1';
const ACCOUNT_KEY = 'nihongo-n4-account-v1-';
const PENDING_KEY = 'nihongo-n4-pending-v1-';
const SEEN_KEY = 'nihongo-n4-seen-v1';
const MASTERED_KEY = 'nihongo-n4-mastered-v1';
const SEEN_PREFIX = 'course:v1:seen:';
const MASTERED_PREFIX = 'course:v1:mastered:';
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
  state.seen = storedSet(SEEN_KEY);
  state.mastered = storedSet(MASTERED_KEY);
}

function saveProgress() {
  const suffix = cloud.user ? '-' + cloud.user.id : '';
  try {
    localStorage.setItem(cloud.user ? ACCOUNT_KEY + cloud.user.id : KEY, JSON.stringify([...state.done]));
    localStorage.setItem(SEEN_KEY + suffix, JSON.stringify([...state.seen]));
    localStorage.setItem(MASTERED_KEY + suffix, JSON.stringify([...state.mastered]));
  } catch { /* Browser storage may be unavailable. */ }
}

function queueChange(id, learned) {
  if (!cloud.user) return;
  const pending = storedPending(cloud.user.id);
  pending[id] = learned;
  savePending(cloud.user.id, pending);
  updateAccountUI();
  scheduleSync();
}

function refreshProgressViews() {
  $('#progress-count').textContent = state.done.size.toLocaleString('fr-FR');
  $('#account-saved-count').textContent = `(${state.done.size})`;
  if (state.words.length) {
    renderSavedWords();
    renderLearningOverview();
    if (state.activeGroup && !state.quiz) renderStudy();
  }
}

function activateAccount() {
  const userId = cloud.user.id;
  verifiedCloudThisSession = false;
  let hasAccountCache = false;
  try { hasAccountCache = localStorage.getItem(ACCOUNT_KEY + userId) !== null; } catch { /* Use guest progress below. */ }
  state.done = hasAccountCache ? storedSet(ACCOUNT_KEY + userId) : storedSet(KEY);
  state.seen = hasAccountCache ? storedSet(SEEN_KEY + '-' + userId) : storedSet(SEEN_KEY);
  state.mastered = hasAccountCache ? storedSet(MASTERED_KEY + '-' + userId) : storedSet(MASTERED_KEY);
  if (!hasAccountCache) {
    const pending = storedPending(userId);
    state.done.forEach(id => { pending[id] = true; });
    state.seen.forEach(id => { pending[SEEN_PREFIX + id] = true; });
    state.mastered.forEach(id => { pending[MASTERED_PREFIX + id] = true; });
    savePending(userId, pending);
  }
  saveProgress();
  updateAccountUI();
  renderWords();
  refreshProgressViews();
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
    state.done = new Set([...merged].filter(id => !id.startsWith(SEEN_PREFIX) && !id.startsWith(MASTERED_PREFIX)));
    state.seen = new Set([...merged].filter(id => id.startsWith(SEEN_PREFIX)).map(id => id.slice(SEEN_PREFIX.length)));
    state.mastered = new Set([...merged].filter(id => id.startsWith(MASTERED_PREFIX)).map(id => id.slice(MASTERED_PREFIX.length)));
    saveProgress();
    renderWords();
    refreshProgressViews();
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
  refreshProgressViews();
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
  $('#account-saved').addEventListener('click', () => { closeAccount(); showView('mes-mots'); });
  $('#account-learning').addEventListener('click', () => { closeAccount(); showView('apprendre'); });
  $('#account-sign-out').addEventListener('click', async () => {
    await cloud.signOut();
    verifiedCloudThisSession = false;
    loadProgress();
    updateAccountUI();
    renderWords();
    refreshProgressViews();
    closeAccount();
    if (location.hash.startsWith('#mes-mots')) showView('accueil');
  });
  window.addEventListener('online', () => { updateAccountUI(); scheduleSync(); });
  window.addEventListener('offline', () => updateAccountUI());
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) scheduleSync();
  });
}

function showView(name, updateHash = true) {
  if (!['accueil', 'apprendre', 'mes-mots', 'vocabulaire', 'kanji'].includes(name)) name = 'accueil';
  if (name === 'mes-mots' && !cloud.user) { openAccount(); return; }
  if (name === 'apprendre') {
    $('#apprendre').classList.remove('lesson-open');
    state.activeGroup = null;
    state.quiz = null;
    $('#learning-overview').hidden = false;
    $('#learning-session').hidden = true;
    if (state.words.length) renderLearningOverview();
  }
  document.querySelectorAll('.view').forEach(section => section.classList.toggle('active', section.id === name));
  document.querySelectorAll('[data-view]').forEach(button => {
    const active = button.dataset.view === name || (name === 'mes-mots' && button.dataset.view === 'vocabulaire');
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  if (updateHash && location.hash !== `#${name}`) history.pushState(null, '', `#${name}`);
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function routeFromLocation() {
  let route;
  try { route = decodeURIComponent(location.hash.slice(1)); } catch { route = ''; }
  const [view, groupId, mode] = route.split('/');
  if (view === 'apprendre' && groupId && state.groups.length) {
    const group = state.groups.find(item => item.id === groupId);
    if (group) {
      openGroup(group, false);
      if (mode === 'quiz') {
        if (group.words.every(word => state.seen.has(word.id))) startQuiz(false);
        else history.replaceState(null, '', `#apprendre/${group.id}`);
      }
      return;
    }
  }
  showView(view, false);
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
  button.setAttribute('aria-label', `${state.done.has(word.id) ? 'Retirer des mots enregistrés' : 'Enregistrer le mot'} : ${word.word}`);
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

function renderSavedWords() {
  const saved = state.words.filter(word => state.done.has(word.id));
  $('#saved-list').replaceChildren(...saved.map(makeWordCard));
  $('#saved-count').textContent = `${saved.length} mot${saved.length > 1 ? 's' : ''}`;
  $('#saved-empty').hidden = saved.length !== 0;
}

function renderLearningOverview() {
  if (!state.groups.length) return;
  const completed = state.groups.filter(group => state.mastered.has(group.id)).length;
  const percent = Math.round(completed / state.groups.length * 100);
  $('#mastered-count').textContent = `${completed} série${completed > 1 ? 's' : ''} maîtrisée${completed > 1 ? 's' : ''} sur ${state.groups.length}`;
  $('#mastered-percent').textContent = `${percent} %`;
  $('#mastered-meter').style.width = `${percent}%`;
  $('.learning-summary .meter').setAttribute('aria-valuenow', String(percent));
  $('#learning-summary-text').textContent = cloud.user
    ? 'Ton parcours se synchronise avec ton compte, même après une session hors ligne.'
    : 'Ta progression est gardée sur cet appareil. Connecte-toi pour la retrouver ailleurs.';
  for (const track of ['fr', 'corpus']) {
    const active = state.track === track;
    $(`#track-${track}`).classList.toggle('active', active);
    $(`#track-${track}`).setAttribute('aria-pressed', String(active));
  }
  const groups = state.groups.filter(group => group.track === state.track);
  $('#track-description').textContent = state.track === 'fr'
    ? `${groups.length} séries de mots traduits en français pour commencer.`
    : `${groups.length} séries pour parcourir le reste du corpus. Le sens est affiché en anglais lorsque la traduction française manque.`;
  const cards = groups.map(group => {
    const seen = group.words.filter(word => state.seen.has(word.id)).length;
    const mastered = state.mastered.has(group.id);
    const status = mastered ? 'Maîtrisée' : seen === group.words.length ? 'Prête pour le quiz' : seen ? 'En cours' : 'À découvrir';
    const card = element('button', 'group-card');
    card.type = 'button';
    card.dataset.group = group.id;
    card.append(element('span', 'group-number', `${group.title} · ${group.words.length} mots`), element('strong', '', status));
    const detail = element('span', 'group-detail', `${seen} sur ${group.words.length} mots découverts`);
    const meter = element('span', 'group-meter');
    meter.append(element('span', 'group-meter-fill'));
    meter.firstChild.style.width = `${Math.round(seen / group.words.length * 100)}%`;
    card.append(detail, meter);
    if (mastered) card.classList.add('mastered');
    card.setAttribute('aria-label', `${group.title}, ${status}, ${seen} mots découverts sur ${group.words.length}. Ouvrir la série.`);
    return card;
  });
  $('#group-list').replaceChildren(...cards);
}

function openGroup(group, updateHash = true) {
  showView('apprendre', false);
  $('#apprendre').classList.add('lesson-open');
  state.activeGroup = group;
  state.track = group.track;
  state.quiz = null;
  state.studyIndex = Math.max(0, group.words.findIndex(word => !state.seen.has(word.id)));
  state.revealed = false;
  $('#learning-overview').hidden = true;
  $('#learning-session').hidden = false;
  $('#study-panel').hidden = false;
  $('#quiz-panel').hidden = true;
  $('#quiz-result').hidden = true;
  $('#lesson-track').textContent = group.track === 'fr' ? 'PRIORITÉ EN FRANÇAIS' : 'RESTE DU CORPUS';
  $('#lesson-title').textContent = `${group.title} · ${group.words.length} mots`;
  $('#lesson-description').textContent = 'Révèle le sens de chaque mot, puis lance le quiz.';
  renderStudy();
  if (updateHash) history.pushState(null, '', `#apprendre/${group.id}`);
}

function renderStudy() {
  const group = state.activeGroup;
  if (!group) return;
  const word = group.words[state.studyIndex];
  const seen = group.words.filter(item => state.seen.has(item.id)).length;
  const percent = Math.round(seen / group.words.length * 100);
  $('#study-step').textContent = `Mot ${state.studyIndex + 1} sur ${group.words.length}`;
  $('#study-word').textContent = word.word;
  $('#study-reading').textContent = word.reading;
  $('#study-meaning').textContent = NihongoLearning.meaning(word);
  $('#study-answer').hidden = !state.revealed;
  $('#study-hint').hidden = state.revealed;
  $('#study-reveal').hidden = state.revealed;
  $('#study-prev').disabled = state.studyIndex === 0;
  $('#study-next').hidden = !state.revealed || state.studyIndex === group.words.length - 1;
  $('#start-quiz').hidden = seen !== group.words.length;
  $('#lesson-state').textContent = state.mastered.has(group.id) ? 'Maîtrisée' : `${seen}/${group.words.length} découverts`;
  $('#lesson-meter-fill').style.width = `${percent}%`;
  $('#lesson-meter').setAttribute('aria-valuenow', String(percent));
}

function revealStudy() {
  const word = state.activeGroup?.words[state.studyIndex];
  if (!word) return;
  state.revealed = true;
  if (!state.seen.has(word.id)) {
    state.seen.add(word.id);
    saveProgress();
    queueChange(SEEN_PREFIX + word.id, true);
    renderLearningOverview();
  }
  renderStudy();
}

function startQuiz(updateHash = true) {
  const group = state.activeGroup;
  if (!group || !group.words.every(word => state.seen.has(word.id))) return;
  state.quiz = { questions: NihongoLearning.createQuiz(group), index: 0, correct: 0, missed: [], answered: false };
  $('#study-panel').hidden = true;
  $('#quiz-result').hidden = true;
  $('#quiz-panel').hidden = false;
  renderQuiz();
  if (updateHash) history.pushState(null, '', `#apprendre/${group.id}/quiz`);
}

function renderQuiz() {
  const quiz = state.quiz;
  if (!quiz) return;
  const question = quiz.questions[quiz.index];
  $('#quiz-step').textContent = `Question ${quiz.index + 1} sur ${quiz.questions.length}`;
  $('#quiz-word').textContent = question.word.word;
  $('#quiz-feedback').textContent = '';
  $('#quiz-next').hidden = true;
  const choices = question.choices.map(choice => {
    const button = element('button', 'quiz-choice', choice);
    button.type = 'button';
    button.dataset.choice = choice;
    return button;
  });
  $('#quiz-choices').replaceChildren(...choices);
}

function answerQuiz(choice) {
  const quiz = state.quiz;
  if (!quiz || quiz.answered) return;
  const question = quiz.questions[quiz.index];
  quiz.answered = true;
  if (choice === question.answer) quiz.correct++;
  else quiz.missed.push(question.word.id);
  for (const button of $('#quiz-choices').children) {
    button.disabled = true;
    if (button.dataset.choice === question.answer) button.classList.add('correct');
    else if (button.dataset.choice === choice) button.classList.add('incorrect');
  }
  $('#quiz-feedback').textContent = choice === question.answer
    ? `Correct · ${question.word.reading}`
    : `À revoir · ${question.word.reading} : ${question.answer}`;
  $('#quiz-next').textContent = quiz.index === quiz.questions.length - 1 ? 'Voir le résultat' : 'Question suivante';
  $('#quiz-next').hidden = false;
  $('#quiz-next').focus();
}

function finishQuiz() {
  const quiz = state.quiz;
  if (!quiz) return;
  const perfect = quiz.correct === quiz.questions.length;
  if (perfect && !state.mastered.has(state.activeGroup.id)) {
    state.mastered.add(state.activeGroup.id);
    saveProgress();
    queueChange(MASTERED_PREFIX + state.activeGroup.id, true);
  }
  $('#quiz-panel').hidden = true;
  $('#quiz-result').hidden = false;
  $('#result-title').textContent = `${quiz.correct}/${quiz.questions.length} bonnes réponses`;
  $('#result-detail').textContent = perfect
    ? 'Bravo, cette série est maîtrisée. Tu peux la refaire quand tu veux.'
    : `${quiz.missed.length} mot${quiz.missed.length > 1 ? 's' : ''} à revoir. La série passera à « maîtrisée » après un quiz sans erreur.`;
  const missed = quiz.missed.map(id => state.activeGroup.words.find(word => word.id === id)).filter(Boolean);
  $('#result-missed').replaceChildren(...missed.map(word => {
    const item = element('div', 'missed-word');
    item.append(element('strong', '', word.word), element('span', '', `${word.reading} · ${NihongoLearning.meaning(word)}`));
    return item;
  }));
  $('#result-missed').hidden = perfect;
  $('#result-review').hidden = perfect;
  $('#result-retry').textContent = 'Refaire le quiz';
  renderLearningOverview();
  $('#result-title').focus();
}

function setupLearning() {
  $('#track-fr').addEventListener('click', () => { state.track = 'fr'; renderLearningOverview(); });
  $('#track-corpus').addEventListener('click', () => { state.track = 'corpus'; renderLearningOverview(); });
  $('#group-list').addEventListener('click', event => {
    const trigger = event.target.closest('[data-group]');
    if (!trigger) return;
    const group = state.groups.find(item => item.id === trigger.dataset.group);
    if (group) openGroup(group);
  });
  $('#lesson-back').addEventListener('click', () => showView('apprendre'));
  $('#study-prev').addEventListener('click', () => {
    if (state.studyIndex > 0) { state.studyIndex--; state.revealed = false; renderStudy(); }
  });
  $('#study-reveal').addEventListener('click', revealStudy);
  $('#study-next').addEventListener('click', () => {
    if (state.activeGroup && state.studyIndex < state.activeGroup.words.length - 1) {
      state.studyIndex++;
      state.revealed = false;
      renderStudy();
    }
  });
  $('#start-quiz').addEventListener('click', () => startQuiz());
  $('#quiz-choices').addEventListener('click', event => {
    const button = event.target.closest('[data-choice]');
    if (button) answerQuiz(button.dataset.choice);
  });
  $('#quiz-next').addEventListener('click', () => {
    if (!state.quiz?.answered) return;
    if (state.quiz.index === state.quiz.questions.length - 1) finishQuiz();
    else { state.quiz.index++; state.quiz.answered = false; renderQuiz(); }
  });
  $('#result-review').addEventListener('click', () => {
    const missed = state.quiz?.missed[0];
    state.studyIndex = Math.max(0, state.activeGroup.words.findIndex(word => word.id === missed));
    state.quiz = null;
    state.revealed = false;
    $('#quiz-result').hidden = true;
    $('#study-panel').hidden = false;
    renderStudy();
    history.pushState(null, '', `#apprendre/${state.activeGroup.id}`);
  });
  $('#result-retry').addEventListener('click', () => startQuiz(false));
  $('#saved-browse').addEventListener('click', () => { $('#collection').value = 'all'; showView('vocabulaire'); renderWords(); });
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
  setupLearning();
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
  routeFromLocation();
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => showView(button.dataset.view)));
  $('.brand').addEventListener('click', event => { event.preventDefault(); showView('accueil'); });
  $('#start-button').addEventListener('click', () => showView('apprendre'));
  $('#browse-button').addEventListener('click', () => { $('#collection').value = 'all'; showView('vocabulaire'); renderWords(); });
  window.addEventListener('hashchange', routeFromLocation);
  window.addEventListener('popstate', routeFromLocation);
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
    queueChange(id, state.done.has(id));
    renderWords();
    refreshProgressViews();
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
    state.groups = NihongoLearning.buildGroups(state.words);
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
    renderSavedWords();
    renderLearningOverview();
    renderKanji();
    routeFromLocation();
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
