'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = JSON.parse(fs.readFileSync(path.join(root, 'data/grammar-source.json'), 'utf8'));
const fr = require('../data/grammar-fr.js');
if (source.length !== fr.length) throw new Error('Le nombre de traductions ne correspond pas au corpus.');

const categories = [
  [0, 10, 'Actions et services'], [11, 20, 'Temps et apparence'],
  [21, 34, 'Intentions et conjugaison'], [35, 49, 'Conditions et liens logiques'],
  [50, 61, 'Désirs et opinions'], [62, 75, 'Quantité et nuances'],
  [76, 82, 'Politesse'], [83, 97, 'Expressions utiles']
];
// Troisième phrase lorsque la fiche réunit plusieurs variantes ou sens distincts.
const thirdExamples = {
  'ageru-kureru-morau': 'J’ai reçu un souvenir du voyage de mon ami.',
  'te-shimau-chau': 'Oh, j’ai mangé tout le gâteau !',
  'te-oku': 'Laissez la climatisation allumée, s’il vous plaît.',
  'aida-aida-ni': 'J’ai lu un livre pendant tout le temps où j’attendais le train.',
  'chuu-juu': 'Cette chanson est connue dans le monde entier.',
  'tokoro-da': 'Je viens tout juste d’arriver à la gare.',
  'hajimeru-owaru-tsuzukeru': 'Après avoir marché trois heures sans m’arrêter, j’ai eu mal aux pieds.',
  sonkeigo: 'Le chef de service l’a dit pendant la réunion.',
  kenjougo: 'J’ai lu votre lettre.',
  'te-mo-kamawanai': 'Vous pouvez aussi répondre demain.',
  'no-koto-nominalizer': 'J’ai oublié de fermer la porte à clé.',
  'toka-toka': 'Pour ta santé, tu devrais faire quelque chose, par exemple manger des légumes ou faire du sport.',
  'ku-suru-ni-suru': 'Comme il fait chaud, je me suis fait couper les cheveux courts.',
  'kana-kashira': 'Je me demande si cette tenue me va bien.',
  naide: 'Prenons l’escalier au lieu de l’ascenseur.'
};
const labels = [
  [/Verb-nai stem/g, 'base en ない (sans ない)'], [/Verb-volitional/g, 'forme volitive'],
  [/Verb-plain/g, 'verbe (forme neutre)'], [/Verb-dict/g, 'verbe (dictionnaire)'],
  [/Verb-stem/g, 'base en ます (sans ます)'], [/Verb-nai/g, 'verbe (forme en ない)'],
  [/Verb-te/g, 'verbe (forme en て)'], [/Verb-ta/g, 'verbe (forme en た)'],
  [/Verb-ba/g, 'verbe (forme en ば)'], [/i-Adj stem/g, 'adjectif en い (sans い)'],
  [/i-Adj-ku/g, 'adjectif en い (forme en く)'], [/i-Adj/g, 'adjectif en い'],
  [/na-Adj/g, 'adjectif en な'], [/Noun/g, 'nom'], [/Sentence/g, 'phrase'],
  [/Question word/g, 'mot interrogatif'], [/Group 1/g, 'groupe 1'], [/Group 2/g, 'groupe 2'],
  [/receiver/g, 'destinataire'], [/giver/g, 'donneur'], [/quantity/g, 'quantité'],
  [/number \+ counter/g, 'nombre + compteur'], [/final u → e/g, 'dernière syllabe en u → e'],
  [/final u → o/g, 'dernière syllabe en u → o'], [/short form/g, 'forme courte'],
  [/plain/g, 'forme neutre']
];
const grammar = source.map((entry, index) => {
  const [meaning, explanation, first, second] = fr[index] || [];
  if (![meaning, explanation, first, second].every(value => typeof value === 'string' && value.trim())) throw new Error(`Traduction incomplète : ${entry.id}`);
  let formation = entry.formation;
  for (const [pattern, replacement] of labels) formation = formation.replace(pattern, replacement);
  const category = categories.find(([start, end]) => index >= start && index <= end)?.[2];
  const translations = [first, second, thirdExamples[entry.id]].filter(Boolean);
  return { id: entry.id, pattern: entry.pattern, level: 'N4', category, meaning, explanation, formation,
    examples: entry.examples.slice(0, translations.length).map((example, n) => ({ ja: example.ja, furigana: example.furigana || example.ja, fr: translations[n] })) };
});
fs.writeFileSync(path.join(root, 'data/grammar.json'), JSON.stringify(grammar, null, 2) + '\n');
console.log(`${grammar.length} fiches de grammaire générées.`);
