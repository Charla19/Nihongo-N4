'use strict';

const NihongoLearning = (() => {
  const TARGET_SIZE = 25;
  const meaning = word => word.fr || word.en;
  const shuffle = source => {
    const result = [...source];
    for (let index = result.length - 1; index > 0; index--) {
      const other = Math.floor(Math.random() * (index + 1));
      [result[index], result[other]] = [result[other], result[index]];
    }
    return result;
  };
  const signature = words => {
    let hash = 2166136261;
    for (const character of words.map(word => word.id).join('|')) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  };

  function buildGroups(words) {
    const tracks = [
      { id: 'fr', title: 'Priorité en français', words: words.filter(word => word.fr) },
      { id: 'corpus', title: 'Reste du corpus', words: words.filter(word => !word.fr) }
    ];
    return tracks.flatMap(track => {
      if (!track.words.length) return [];
      const count = Math.max(1, Math.round(track.words.length / TARGET_SIZE));
      const base = Math.floor(track.words.length / count);
      const extra = track.words.length % count;
      let start = 0;
      return Array.from({ length: count }, (_, index) => {
        const size = base + (index < extra ? 1 : 0);
        const groupWords = track.words.slice(start, start + size);
        start += size;
        return {
          id: `${track.id}-${String(index + 1).padStart(2, '0')}-${signature(groupWords)}`,
          track: track.id,
          number: index + 1,
          title: `Série ${index + 1}`,
          words: groupWords
        };
      });
    });
  }

  function createQuiz(group) {
    const meanings = [...new Set(group.words.map(meaning).filter(Boolean))];
    return shuffle(group.words).map(word => {
      const answer = meaning(word);
      const distractors = shuffle(meanings.filter(value => value !== answer)).slice(0, 3);
      return { word, answer, choices: shuffle([answer, ...distractors]) };
    });
  }

  return { buildGroups, createQuiz, meaning };
})();

if (typeof module !== 'undefined') module.exports = NihongoLearning;
