const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildGroups, createQuiz, meaning } = require('../learning.js');

const words = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/vocabulary.json'), 'utf8')).words;

test('les séries couvrent chaque mot une seule fois, par groupes de 20 à 30', () => {
  const groups = buildGroups(words);
  const ids = groups.flatMap(group => group.words.map(word => word.id));
  assert.equal(ids.length, words.length);
  assert.equal(new Set(ids).size, words.length);
  assert.ok(groups.every(group => group.words.length >= 20 && group.words.length <= 30));
  assert.equal(new Set(groups.map(group => group.id)).size, groups.length);
  assert.deepEqual(groups.map(group => group.id), buildGroups(words).map(group => group.id));
  assert.ok(groups.filter(group => group.track === 'fr').every(group => group.words.every(word => word.fr)));
  assert.ok(groups.filter(group => group.track === 'corpus').every(group => group.words.every(word => !word.fr)));
});

test('chaque quiz pose une question par mot, avec une bonne réponse unique', () => {
  for (const group of buildGroups(words)) {
    const questions = createQuiz(group);
    assert.equal(questions.length, group.words.length);
    assert.deepEqual(new Set(questions.map(question => question.word.id)), new Set(group.words.map(word => word.id)));
    for (const question of questions) {
      assert.equal(question.answer, meaning(question.word));
      assert.equal(question.choices.length, 4);
      assert.equal(new Set(question.choices).size, 4);
      assert.equal(question.choices.filter(choice => choice === question.answer).length, 1);
    }
  }
});
