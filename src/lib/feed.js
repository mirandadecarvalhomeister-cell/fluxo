import { normalizeInteractive } from './interactive';

export const FEED_MODES = [
  {
    id: 'forYou',
    label: 'Para você',
    hint: 'Recomendações com base nos seus interesses e conversas.',
  },
  {
    id: 'following',
    label: 'Seguindo',
    hint: 'Somente pessoas e comunidades que você acompanha.',
  },
  {
    id: 'recent',
    label: 'Mais recentes',
    hint: 'Tudo em ordem cronológica, sem destaque por popularidade.',
  },
  {
    id: 'trending',
    label: 'Em alta',
    hint: 'Publicações que estão gerando participação agora.',
  },
  {
    id: 'communities',
    label: 'Comunidades',
    hint: 'Discussões das comunidades das quais você participa.',
  },
];

export const FEED_FORMATS = [
  { id: 'photo', label: 'Fotos' },
  { id: 'video', label: 'Vídeos' },
  { id: 'text', label: 'Textos' },
  { id: 'poll', label: 'Enquetes' },
  { id: 'question', label: 'Perguntas' },
  { id: 'imageVote', label: 'Votações' },
  { id: 'challenge', label: 'Desafios' },
  { id: 'reactions', label: 'Reações' },
];

export const ALGO_LEVELS = [
  { id: 'high', label: 'Alta', hint: 'Mais descoberta de pessoas e assuntos novos.' },
  { id: 'balanced', label: 'Equilibrada', hint: 'Mistura equilibrada entre quem você segue e novidades.' },
  { id: 'low', label: 'Baixa', hint: 'Prioriza quem você segue e conteúdos recentes.' },
];

export const DEFAULT_FEED_PREFS = {
  mode: 'forYou',
  formats: [],
  level: 'balanced',
  mutedTopics: [],
  hiddenProfiles: [],
  hiddenPosts: [],
  mutedComms: [],
  showReasons: true,
};

export function feedPrefs(settings) {
  const raw = settings?.feed || {};
  return {
    ...DEFAULT_FEED_PREFS,
    ...raw,
    formats: Array.isArray(raw.formats) ? raw.formats : [],
    mutedTopics: Array.isArray(raw.mutedTopics) ? raw.mutedTopics : [],
    hiddenProfiles: Array.isArray(raw.hiddenProfiles) ? raw.hiddenProfiles : [],
    hiddenPosts: Array.isArray(raw.hiddenPosts) ? raw.hiddenPosts : [],
    mutedComms: Array.isArray(raw.mutedComms) ? raw.mutedComms : [],
  };
}

export function postFormat(post) {
  const interactive = normalizeInteractive(post?.interactive);
  if (interactive?.format) return interactive.format;
  if (post?.kind === 'photo' || post?.kind === 'video') return post.kind;
  return 'text';
}

function norm(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function hoursSince(ts) {
  return Math.max(0.4, (Date.now() - (ts || Date.now())) / 3_600_000);
}

function engagement(post) {
  const interactions = (post.interactions || []).filter((row) => row.kind !== 'view');
  const comments = (post.comments || []).length;
  const likes = post.likes || 0;
  return likes + comments * 2 + interactions.length * 1.5;
}

export function interestTerms(me, comms) {
  const terms = new Set();
  (me?.interests || []).forEach((item) => terms.add(norm(item)));
  (comms || [])
    .filter((item) => item.joined)
    .forEach((item) => {
      terms.add(norm(item.cat));
      terms.add(norm(item.name));
    });
  return [...terms].filter(Boolean);
}

function matchesTerms(post, terms) {
  if (!terms.length) return 0;
  const text = norm(
    `${post.text || ''} ${post.communityName || ''} ${post.communityCat || ''}`
  );
  return terms.reduce((total, term) => (text.includes(term) ? total + 1 : total), 0);
}

export function feedScore(post, ctx) {
  const { follows, terms, level, comms } = ctx;
  const affinity = follows.includes(post.by) ? 1 : 0;
  const community = post.communityId
    ? (comms || []).find((item) => item.id === post.communityId)
    : null;
  const inCommunity = community?.joined ? 1 : 0;
  const topic = matchesTerms(post, terms);
  const hot = engagement(post) / Math.sqrt(hoursSince(post.ts));
  const recency = 1 / Math.sqrt(hoursSince(post.ts));
  const affinityWeight = level === 'low' ? 2.4 : level === 'high' ? 0.7 : 1.35;
  const discoveryWeight = level === 'high' ? 1.5 : level === 'low' ? 0.35 : 0.85;
  const topicWeight = level === 'low' ? 0.35 : 1;
  return (
    recency * 2.2 +
    affinity * affinityWeight * 2.2 +
    inCommunity * 1.4 +
    topic * topicWeight * 1.8 +
    hot * discoveryWeight
  );
}

function reasonFor(post, ctx) {
  const { follows, terms, comms } = ctx;
  if (post.communityId) {
    const community = (comms || []).find((item) => item.id === post.communityId);
    if (community) return `Da comunidade ${community.name}`;
  }
  if (follows.includes(post.by)) return 'De alguém que você segue';
  if (matchesTerms(post, terms)) return 'Relacionado aos seus interesses';
  const hot = engagement(post) / Math.sqrt(hoursSince(post.ts));
  if (hot > 8) return 'Gerando participação agora';
  return 'Descoberta para você';
}

export function applyFeedPreferences(posts, ctx) {
  const { prefs, follows, comms } = ctx;
  const mutedComms = new Set(prefs.mutedComms);
  const hiddenProfiles = new Set(prefs.hiddenProfiles);
  const hiddenPosts = new Set(prefs.hiddenPosts);
  const mutedTopics = prefs.mutedTopics.map(norm).filter(Boolean);
  const formats = prefs.formats || [];

  let list = posts.filter((post) => {
    if (post.kind === 'story') return false;
    if (hiddenPosts.has(post.id)) return false;
    if (hiddenProfiles.has(post.by)) return false;
    if (post.communityId && mutedComms.has(post.communityId)) return false;
    if (formats.length && !formats.includes(postFormat(post))) return false;
    if (mutedTopics.length) {
      const text = norm(`${post.text || ''} ${post.communityName || ''}`);
      if (mutedTopics.some((term) => text.includes(term))) return false;
    }
    return true;
  });

  if (prefs.mode === 'following') {
    const joinedComms = new Set(
      (comms || []).filter((item) => item.joined).map((item) => item.id)
    );
    list = list.filter(
      (post) =>
        follows.includes(post.by) ||
        post.by === 'me' ||
        (post.communityId && joinedComms.has(post.communityId))
    );
  } else if (prefs.mode === 'communities') {
    const joined = new Set((comms || []).filter((item) => item.joined).map((item) => item.id));
    list = list.filter((post) => post.communityId && joined.has(post.communityId));
  }

  if (prefs.mode === 'recent') {
    return list
      .sort((a, b) => b.ts - a.ts)
      .map((post) => ({ ...post, feedReason: null }));
  }

  if (prefs.mode === 'trending') {
    return list
      .filter((post) => engagement(post) > 0)
      .sort(
        (a, b) =>
          engagement(b) / Math.sqrt(hoursSince(b.ts)) -
          engagement(a) / Math.sqrt(hoursSince(a.ts))
      )
      .map((post) => ({ ...post, feedReason: 'Em alta agora' }));
  }

  if (prefs.mode === 'following') {
    return list
      .sort((a, b) => b.ts - a.ts)
      .map((post) => ({ ...post, feedReason: null }));
  }

  return list
    .map((post) => ({
      post,
      score: feedScore(post, ctx),
      feedReason: prefs.showReasons ? reasonFor(post, ctx) : null,
    }))
    .sort((a, b) => b.score - a.score)
    .map((entry) => ({ ...entry.post, feedReason: entry.feedReason }));
}

export function communityActivity(community, posts) {  const communityPosts = posts.filter((post) => post.communityId === community.id);
  const lastTs = Math.max(
    ...communityPosts.map((post) => post.ts || 0),
    ...(community.topics || []).map((topic) => topic.ts || 0),
    0
  );
  const recent = communityPosts.filter((post) => Date.now() - (post.ts || 0) < 7 * 864e5);
  const level = recent.length >= 6 ? 'Movimentada' : recent.length >= 2 ? 'Crescendo' : 'Tranquila';
  return { posts: communityPosts.length, lastTs, recent: recent.length, level };
}

// Afinidade entre uma comunidade e os interesses/categorias de quem usa o app.
// Usada para descobrir comunidades antes de entrar, sem dados ficticios.
export function communityAffinity(community, terms) {
  if (!terms?.length) return 0;
  const haystack = norm(`${community.name} ${community.cat} ${community.desc}`);
  return terms.reduce(
    (total, term) => (term && haystack.includes(term) ? total + 1 : total),
    0
  );
}

const STOP_WORDS = new Set([
  'para', 'porque', 'quando', 'onde', 'como', 'sobre', 'entre', 'depois', 'antes',
  'tambem', 'também', 'muito', 'muita', 'muitos', 'muitas', 'ainda', 'sempre',
  'nunca', 'coisa', 'coisas', 'gente', 'pessoa', 'pessoas', 'hoje', 'agora',
  'aqui', 'ali', 'isso', 'isto', 'aquilo', 'esse', 'essa', 'este', 'esta',
  'aquele', 'aquela', 'quem', 'qual', 'quais', 'voce', 'você', 'voces', 'vocês',
  'meu', 'minha', 'meus', 'minhas', 'seu', 'sua', 'seus', 'suas', 'nosso',
  'nossa', 'deles', 'delas', 'esta', 'está', 'estao', 'estão', 'fazer', 'feito',
  'vamos', 'pode', 'podem', 'quero', 'quer', 'todos', 'todas', 'outro', 'outra',
  'mais', 'menos', 'bem', 'mal', 'sim', 'nao', 'não', 'com', 'sem', 'por',
  'que', 'dos', 'das', 'uma', 'uns', 'umas', 'the', 'and', 'for', 'with',
]);

// Assuntos que estao gerando conversa de verdade e ainda nao tem comunidade.
// Serve para sugerir a criacao espontanea de comunidades a partir do feed.
export function spontaneousTopics(posts, comms) {
  const existing = (comms || []).map((item) => norm(`${item.name} ${item.cat}`));
  const buckets = new Map();

  (posts || []).forEach((post) => {
    if (!post || post.kind === 'story') return;
    const age = Date.now() - (post.ts || 0);
    if (age > 21 * 864e5) return;
    const text = String(post.text || '');
    if (text.trim().length < 12) return;
    const weight =
      1 +
      (post.likes || 0) +
      (post.comments || []).length * 2 +
      (post.interactions || []).filter((row) => row.kind !== 'view').length;

    const hashtags = text.match(/#[\p{L}\p{N}_]{3,}/gu) || [];
    const words = text
      .replace(/#[\p{L}\p{N}_]{3,}/gu, ' ')
      .split(/[^\p{L}\p{N}]+/u)
      .map((word) => word.trim())
      .filter((word) => word.length >= 4 && !STOP_WORDS.has(norm(word)));

    const terms = [
      ...hashtags.map((tag) => tag.replace(/^#/, '')),
      ...words,
    ];
    new Set(terms.map((term) => norm(term))).forEach((key) => {
      if (!key) return;
      if (existing.some((name) => name.includes(key))) return;
      const label = terms.find((term) => norm(term) === key) || key;
      const bucket = buckets.get(key) || {
        term: label.charAt(0).toUpperCase() + label.slice(1),
        key,
        score: 0,
        count: 0,
        postIds: [],
      };
      bucket.score += weight;
      bucket.count += 1;
      if (!bucket.postIds.includes(post.id)) bucket.postIds.push(post.id);
      buckets.set(key, bucket);
    });
  });

  return [...buckets.values()]
    .filter((bucket) => bucket.count >= 2 || bucket.score >= 8)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
}
