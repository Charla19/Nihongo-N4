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

test('les fichiers nécessaires à l’installation mobile sont présents', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/');
  for (const icon of manifest.icons) {
    const bytes = fs.readFileSync(path.join(root, icon.src.slice(1)));
    assert.equal(bytes.toString('hex', 0, 8), '89504e470d0a1a0a');
    const [width, height] = [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
    assert.equal(`${width}x${height}`, icon.sizes);
  }
  new Function(fs.readFileSync(path.join(root, 'sw.js'), 'utf8'));
});

test('le formulaire accepte les huit chiffres des e-mails Supabase', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /id="account-code"[^>]*pattern="\[0-9\]\{8\}"[^>]*maxlength="8"/);
});

test('le sitemap contient des pages canoniques avec du contenu HTML consultable', () => {
  const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
  assert.match(fs.readFileSync(path.join(root, 'robots.txt'), 'utf8'), /Sitemap: https:\/\/nihongo\.charlamasy\.site\/sitemap\.xml/);
  for (const [route, filename, sample] of [
    ['/', 'index.html', 'Reconnais les mots'],
    ['/vocabulaire', 'vocabulaire.html', '安心'],
    ['/kanji', 'kanji.html', '医学']
  ]) {
    const url = `https://nihongo.charlamasy.site${route}`;
    assert.ok(sitemap.includes(`<loc>${url}</loc>`));
    const html = fs.readFileSync(path.join(root, filename), 'utf8');
    assert.ok(html.includes(`<link rel="canonical" href="${url}">`));
    assert.ok(html.includes(sample));
  }
});
