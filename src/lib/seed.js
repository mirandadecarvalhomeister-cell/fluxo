import { slug } from './utils';

export const STATE_VERSION = 2;

export const COVERS = ['aurora', 'roda', 'maré', 'sertão', 'neon', 'jabuticaba'];

export const CATS = [
  'Nostalgia',
  'Culinária',
  'Tecnologia',
  'Arte',
  'Cinema',
  'Música',
  'Esporte',
  'Jogos',
  'Estudos',
  'Outros',
];

export const KINDS = {
  avisos: ['mega', 'Avisos'],
  conversa: ['hash', 'Conversa'],
  palco: ['radio', 'Palco ao vivo'],
};

export function newState(name, email) {
  return {
    v: STATE_VERSION,
    email,
    users: {},
    me: {
      id: 'me',
      name,
      handle: slug(name),
      bio: '',
      city: '',
      humor: '',
      interests: [],
      avatar: null,
      cover: { k: 'art', v: 'aurora' },
      followers: 0,
      since: Date.now(),
      scraps: [],
    },
    follows: [],
    followers: [],
    posts: [],
    comms: [],
    chats: [],
    chans: [],
    customStickerPacks: [],
  };
}
