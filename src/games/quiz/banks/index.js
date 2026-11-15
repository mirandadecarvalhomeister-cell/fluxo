// Reúne as categorias do Quiz BOOm! — 100 perguntas em cada uma.
import historia from './historia.js';
import geografia from './geografia.js';
import ciencias from './ciencias.js';
import matematica from './matematica.js';
import cinema from './cinema.js';
import musica from './musica.js';
import esportes from './esportes.js';
import tecnologia from './tecnologia.js';
import literatura from './literatura.js';
import artes from './artes.js';
import games from './games.js';
import gerais from './gerais.js';

export const CATEGORIES = [
  { id: 'historia', name: 'História', emoji: '🏛️', color: '#ffb020', questions: historia },
  { id: 'geografia', name: 'Geografia', emoji: '🌎', color: '#2f7be8', questions: geografia },
  { id: 'ciencias', name: 'Ciências', emoji: '🔬', color: '#25c2a0', questions: ciencias },
  { id: 'matematica', name: 'Matemática', emoji: '🧮', color: '#ff2d87', questions: matematica },
  { id: 'cinema', name: 'Cinema & TV', emoji: '🎬', color: '#9b5cff', questions: cinema },
  { id: 'musica', name: 'Música', emoji: '🎵', color: '#ff5a3c', questions: musica },
  { id: 'esportes', name: 'Esportes', emoji: '⚽', color: '#31d158', questions: esportes },
  { id: 'tecnologia', name: 'Tecnologia', emoji: '💻', color: '#00c2ff', questions: tecnologia },
  { id: 'literatura', name: 'Literatura', emoji: '📚', color: '#c9a227', questions: literatura },
  { id: 'artes', name: 'Artes', emoji: '🎨', color: '#ff6ec7', questions: artes },
  { id: 'games', name: 'Games', emoji: '🎮', color: '#8a7dff', questions: games },
  { id: 'gerais', name: 'Conhecimentos Gerais', emoji: '🧠', color: '#ffc93c', questions: gerais },
];
