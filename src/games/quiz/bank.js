// Banco de perguntas do Quiz BOOm!
// Cada categoria fica em ./banks, com 100 perguntas. Cada pergunta guarda a
// resposta certa e três erradas; as alternativas são embaralhadas a cada rodada
// para o jogo nunca repetir a mesma ordem.

import { CATEGORIES } from './banks/index.js';

export { CATEGORIES };

export const ALL_CATEGORY = {
  id: 'todas',
  name: 'Todas as categorias',
  emoji: '🎲',
  color: '#ff2d87',
};

const shuffle = (list) => {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

export function categoryById(id) {
  if (id === ALL_CATEGORY.id) return ALL_CATEGORY;
  return CATEGORIES.find((category) => category.id === id) || CATEGORIES[0];
}

export function poolFor(id) {
  if (id === ALL_CATEGORY.id) {
    return CATEGORIES.flatMap((category) =>
      category.questions.map((item) => ({
        ...item,
        category: category.name,
        emoji: category.emoji,
        color: category.color,
      }))
    );
  }
  const category = categoryById(id);
  return category.questions.map((item) => ({
    ...item,
    category: category.name,
    emoji: category.emoji,
    color: category.color,
  }));
}

// Monta uma rodada: embaralha o pool, corta no tamanho escolhido (nunca além
// do que existe no banco) e embaralha as quatro alternativas de cada pergunta.
export function buildRound(id, size) {
  const pool = shuffle(poolFor(id));
  const total = Math.min(Number(size) || 10, pool.length);
  return pool.slice(0, total).map((item, index) => {
    const options = shuffle([item.correct, ...item.wrong]);
    return {
      ...item,
      id: `${item.category}-${index}-${item.question}`,
      options,
      answer: options.indexOf(item.correct),
    };
  });
}
