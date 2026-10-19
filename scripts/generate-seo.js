'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const words = JSON.parse(fs.readFileSync(path.join(root, 'data/vocabulary.json'), 'utf8')).words;
const site = 'https://nihongo.charlamasy.site';
const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const write = (name, content) => fs.writeFileSync(path.join(root, name), content.trimStart() + '\n');

function document({ title, description, pathname, body }) {
  const url = site + pathname;
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#624095">
  <meta name="description" content="${escape(description)}">
  <meta name="referrer" content="strict-origin-when-cross-origin">
  <title>${escape(title)}</title>
  <link rel="canonical" href="${url}">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="fr_FR">
  <meta property="og:site_name" content="Nihongo N4">
  <meta property="og:title" content="${escape(title)}">
  <meta property="og:description" content="${escape(description)}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${site}/icons/icon-512.png">
  <meta name="twitter:card" content="summary">
  <link rel="icon" type="image/svg+xml" href="/icons/icon.svg">
  <link rel="apple-touch-icon" href="/icons/icon-180.png">
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <a class="skip-link" href="#main">Aller au contenu</a>
  <header class="site-header"><div class="shell header-inner"><a class="brand" href="/" aria-label="Nihongo N4, accueil"><span class="brand-mark" aria-hidden="true">日</span><span>Nihongo<span class="brand-accent"> N4</span></span></a><nav class="seo-nav" aria-label="Navigation principale"><a href="/">Application</a><a href="/vocabulaire"${pathname === '/vocabulaire' ? ' aria-current="page"' : ''}>Vocabulaire</a><a href="/kanji"${pathname === '/kanji' ? ' aria-current="page"' : ''}>Kanji</a></nav></div></header>
  <main id="main" class="shell seo-main">${body}</main>
  <footer class="site-footer shell"><p class="copyright">© 2026 <a href="https://charlamasy.site" target="_blank" rel="noopener noreferrer">Charla Masy</a></p><p>Vocabulaire adapté d’<a href="https://github.com/evanclan/OpenJLPT" target="_blank" rel="noopener noreferrer">OpenJLPT</a> (CC BY-SA 4.0). Les niveaux sont indicatifs : le JLPT ne publie pas de liste officielle exhaustive. Projet indépendant.</p></footer>
</body>
</html>`;
}

const translated = words.filter(word => word.level === 'N4' && word.fr);
const vocabulary = translated.map(word => `<li class="seo-word"><span lang="ja"><ruby>${escape(word.word)}<rt>${escape(word.reading)}</rt></ruby></span><span>${escape(word.fr)}</span></li>`).join('\n');
write('vocabulaire.html', document({
  title: 'Vocabulaire JLPT N4 en français — Nihongo N4',
  description: `${translated.length} mots N4 avec lecture japonaise et sens en français. Révise les mots entiers et les associations de kanji dans l’application Nihongo N4.`,
  pathname: '/vocabulaire',
  body: `
    <div class="seo-intro"><span class="eyebrow">VOCABULAIRE JLPT N4</span><h1>Des mots à reconnaître dans les textes</h1><p>Une sélection de ${translated.length} mots du corpus N4 avec leur lecture et leur sens en français. Apprends le mot entier, puis retrouve ses kanji dans d’autres contextes.</p><a class="button primary" href="/#vocabulaire">Réviser tous les mots dans l’application <span aria-hidden="true">→</span></a></div>
    <section aria-labelledby="list-title"><h2 id="list-title">Mots N4 traduits en français</h2><p class="seo-note">La sélection ci-dessous complète le catalogue interactif de 1 304 mots N5 et N4. Les niveaux JLPT ne correspondent pas à une liste officielle exhaustive.</p><ul class="seo-vocab-list">${vocabulary}</ul></section>
    <p class="seo-next">Pour voir comment les caractères se combinent, <a href="/kanji">explore les kanji dans les mots N4</a>.</p>`
}));

const groups = new Map();
for (const word of words.filter(word => word.level === 'N4' && word.compound)) {
  for (const character of word.kanji) {
    if (!groups.has(character)) groups.set(character, []);
    groups.get(character).push(word);
  }
}
const featured = [...groups].filter(([, group]) => group.length >= 2 && group.some(word => word.fr))
  .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'ja'));
const kanji = featured.map(([character, group]) => `<section class="seo-kanji-group"><h2 lang="ja">${escape(character)}</h2><ul>${group.slice(0, 5).map(word => `<li><span lang="ja"><ruby>${escape(word.word)}<rt>${escape(word.reading)}</rt></ruby></span>${word.fr ? `<span>${escape(word.fr)}</span>` : ''}</li>`).join('')}</ul></section>`).join('\n');
write('kanji.html', document({
  title: 'Kanji N4 en contexte : mots composés — Nihongo N4',
  description: `Explore ${featured.length} kanji à travers des mots composés du corpus N4, avec leurs lectures et des sens en français.`,
  pathname: '/kanji',
  body: `
    <div class="seo-intro"><span class="eyebrow">KANJI EN CONTEXTE</span><h1>Comprendre le kanji dans un mot</h1><p>Un caractère isolé ne suffit pas toujours à reconnaître un mot. Voici ${featured.length} kanji présents dans plusieurs mots composés du corpus N4, avec des lectures et des traductions lorsqu’elles sont disponibles.</p><a class="button primary" href="/#kanji">Explorer tous les kanji dans l’application <span aria-hidden="true">→</span></a></div>
    <section aria-labelledby="groups-title"><h2 id="groups-title">Associations de kanji et mots N4</h2><p class="seo-note">Chaque groupe donne des exemples. La fiche interactive de l’application montre tous les mots associés dans le corpus.</p><div class="seo-kanji-grid">${kanji}</div></section>
    <p class="seo-next">Tu peux aussi <a href="/vocabulaire">parcourir les mots N4 traduits en français</a>.</p>`
}));

write('robots.txt', `User-agent: *
Allow: /

Sitemap: ${site}/sitemap.xml`);
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${site}/</loc></url>
  <url><loc>${site}/vocabulaire</loc></url>
  <url><loc>${site}/kanji</loc></url>
</urlset>`);

console.log(`Pages SEO générées : ${translated.length} mots traduits, ${featured.length} groupes de kanji.`);
