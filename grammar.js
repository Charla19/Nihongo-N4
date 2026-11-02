'use strict';

const NihongoGrammar = (() => {
  let entries = [];
  let opener = null;
  let activeId = null;
  const $g = selector => document.querySelector(selector);
  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const normalized = value => String(value).normalize('NFKC').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  function furigana(text) {
    const span = make('span');
    span.lang = 'ja';
    const pieces = String(text).split(/(\{[^{}|]+\|[^{}|]+\})/g);
    for (const piece of pieces) {
      const match = /^\{([^{}|]+)\|([^{}|]+)\}$/.exec(piece);
      if (!match) { span.append(document.createTextNode(piece)); continue; }
      const ruby = make('ruby');
      ruby.append(document.createTextNode(match[1]), make('rt', '', match[2]));
      span.append(ruby);
    }
    return span;
  }

  function render() {
    const search = normalized($g('#grammar-search').value.trim());
    const category = $g('#grammar-category').value;
    const results = entries.filter(entry => (category === 'all' || entry.category === category) &&
      (!search || normalized([entry.pattern, entry.meaning, entry.explanation, entry.formation, ...entry.examples.map(example => example.ja)].join(' ')).includes(search)));
    $g('#grammar-count').textContent = `${results.length} point${results.length > 1 ? 's' : ''}`;
    $g('#grammar-empty').hidden = results.length > 0;
    const list = $g('#grammar-list');
    list.replaceChildren(...results.map(entry => {
      const button = make('button', 'grammar-card');
      button.type = 'button';
      button.dataset.grammar = entry.id;
      button.append(make('span', 'grammar-card-category', entry.category), make('strong', 'grammar-card-pattern', entry.pattern), make('span', 'grammar-card-meaning', entry.meaning), make('span', 'grammar-card-action', 'Voir la fiche →'));
      button.querySelector('.grammar-card-pattern').lang = 'ja';
      return button;
    }));
  }

  function open(id, updateHash = true, trigger = null) {
    const entry = entries.find(item => item.id === id);
    if (!entry) return false;
    const dialog = $g('#grammar-dialog');
    if (dialog.open && activeId === id) return true;
    opener = trigger || opener;
    activeId = id;
    $g('#grammar-dialog-title').textContent = entry.pattern;
    $g('#grammar-dialog-category').textContent = entry.category;
    const body = $g('#grammar-dialog-body');
    const meaning = make('p', 'grammar-detail-meaning', entry.meaning);
    const explanationTitle = make('h3', '', 'À comprendre');
    const explanation = make('p', 'grammar-detail-explanation', entry.explanation);
    const formTitle = make('h3', '', 'Construction');
    const form = make('div', 'grammar-detail-form', entry.formation);
    const examplesTitle = make('h3', '', 'En contexte');
    const examples = make('ol', 'grammar-examples');
    for (const example of entry.examples) {
      const item = make('li');
      const japanese = make('p', 'grammar-example-ja');
      japanese.append(furigana(example.furigana || example.ja));
      item.append(japanese, make('p', 'grammar-example-fr', example.fr));
      examples.append(item);
    }
    body.replaceChildren(meaning, explanationTitle, explanation, formTitle, form, examplesTitle, examples);
    if (!dialog.open) dialog.showModal();
    document.body.classList.add('modal-open');
    body.scrollTop = 0;
    if (updateHash) history.pushState(null, '', `#grammaire/${encodeURIComponent(id)}`);
    $g('#grammar-dialog-close').focus();
    return true;
  }

  function close(updateHash = true) {
    const dialog = $g('#grammar-dialog');
    if (dialog.open) dialog.close();
    if (updateHash && location.hash.startsWith('#grammaire/')) history.replaceState(null, '', '#grammaire');
  }

  async function init() {
    $g('#grammar-search').addEventListener('input', render);
    $g('#grammar-category').addEventListener('change', render);
    $g('#grammar-list').addEventListener('click', event => {
      const button = event.target.closest('[data-grammar]');
      if (button) open(button.dataset.grammar, true, button);
    });
    $g('#grammar-dialog-close').addEventListener('click', () => close());
    $g('#grammar-dialog').addEventListener('click', event => { if (event.target === $g('#grammar-dialog')) close(); });
    $g('#grammar-dialog').addEventListener('close', () => {
      document.body.classList.remove('modal-open');
      activeId = null;
      if (location.hash.startsWith('#grammaire/')) history.replaceState(null, '', '#grammaire');
      opener?.focus();
    });
    try {
      const response = await fetch('./data/grammar.json');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data) || data.some(entry => !entry.id || !entry.meaning || !entry.formation || !Array.isArray(entry.examples))) throw new Error('Corpus grammatical invalide');
      entries = data;
      const categories = [...new Set(entries.map(entry => entry.category))];
      for (const category of categories) {
        const option = make('option', '', category);
        option.value = category;
        $g('#grammar-category').append(option);
      }
      $g('#grammar-loading').hidden = true;
      render();
      if (location.hash.startsWith('#grammaire/')) routeFromLocation();
    } catch (error) {
      $g('#grammar-loading').textContent = 'Impossible de charger les fiches de grammaire. Réessaie après avoir rechargé la page.';
      console.error('Chargement de la grammaire :', error);
    }
  }

  return { init, open, close };
})();
