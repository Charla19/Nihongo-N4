const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'data/vocabulary.json'), 'utf8'));

test('le corpus N5/N4 est complet et les IDs sont uniques', () => {
  assert.equal(data.words.length, 1304);
  assert.equal(data.words.filter(word => word.level === 'N4').length, 630);
  assert.equal(data.words.filter(word => word.level === 'N5').length, 674);
  assert.equal(new Set(data.words.map(word => word.id)).size, data.words.length);
});

test('chaque entrée peut être affichée et indexée par kanji', () => {
  for (const word of data.words) {
    assert.equal(typeof word.word, 'string');
    assert.equal(typeof word.reading, 'string');
    assert.equal(typeof word.en, 'string');
    assert.ok(Array.isArray(word.kanji));
    assert.equal(new Set(word.kanji).size, word.kanji.length);
    for (const character of word.kanji) assert.ok(word.word.includes(character));
  }
});

test('le HTML charge les données séparément et le code reste syntaxiquement valide', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const js = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  assert.ok(!html.includes('const DATA='));
  assert.match(js, /fetch\('\.\/data\/vocabulary\.json'/);
  new Function(js);
});
