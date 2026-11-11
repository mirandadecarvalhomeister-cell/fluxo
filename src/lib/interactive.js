// Publicações interativas: enquetes, perguntas, votações com imagens,
// desafios e reações personalizadas. O formato fica em posts.interactive
// (JSONB) e as participações em public.post_interactions.
import { uid } from './utils';

export const INTERACTIVE_FORMATS = [
  {
    id: 'classic',
    label: 'Clássico',
    short: 'Publicação',
    icon: 'feed',
    hint: 'Foto, vídeo ou texto com curtidas e comentários.',
  },
  {
    id: 'poll',
    label: 'Enquete',
    short: 'Enquete',
    icon: 'chart',
    hint: 'Escolha entre 2 e 6 alternativas e veja os votos em tempo real.',
  },
  {
    id: 'question',
    label: 'Pergunta',
    short: 'Pergunta',
    icon: 'comment',
    hint: 'Faça uma pergunta aberta e receba respostas da comunidade.',
  },
  {
    id: 'imageVote',
    label: 'Votação com imagens',
    short: 'Votação',
    icon: 'image',
    hint: 'Compare duas ou mais imagens e descubra a favorita.',
  },
  {
    id: 'challenge',
    label: 'Desafio',
    short: 'Desafio',
    icon: 'users',
    hint: 'Convide amigos para um desafio e acompanhe quem participou.',
  },
  {
    id: 'reactions',
    label: 'Reações',
    short: 'Reações',
    icon: 'smile',
    hint: 'Escolha até 8 reações personalizadas para a publicação.',
  },
];

export const DEFAULT_REACTIONS = ['❤️', '🔥', '👏', '😂', '😮', '🎉', '💜'];

export const REACTION_CHOICES = [
  '❤️',
  '🔥',
  '👏',
  '😂',
  '😮',
  '😢',
  '🎉',
  '💜',
  '🤯',
  '🙌',
  '😍',
  '🤔',
  '💡',
  '👀',
  '🚀',
  '🍿',
];

export const MAX_OPTIONS = 6;
export const MIN_OPTIONS = 2;
export const MAX_ANSWER = 280;
export const MAX_INVITES = 20;

export const INTERACTIVE_KINDS = {
  vote: 'voto',
  answer: 'resposta',
  join: 'participação',
};

export function formatMeta(format) {
  return (
    INTERACTIVE_FORMATS.find((item) => item.id === format) ||
    INTERACTIVE_FORMATS[0]
  );
}

export function normalizeInteractive(raw) {
  if (!raw) return null;
  let value = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object' || !value.format) return null;
  const meta = INTERACTIVE_FORMATS.find((item) => item.id === value.format);
  if (!meta || meta.id === 'classic') return null;

  const options = Array.isArray(value.options)
    ? value.options
        .map((option, index) => {
          const mediaIndex = Number.isInteger(option?.mediaIndex)
            ? option.mediaIndex
            : meta.id === 'imageVote'
              ? index
              : null;
          return {
            id: String(option?.id || `opt-${index + 1}`),
            label: String(option?.label || '').trim() || `Opção ${index + 1}`,
            ...(mediaIndex === null ? {} : { mediaIndex }),
          };
        })
        .slice(0, MAX_OPTIONS)
    : [];

  const reactions =
    Array.isArray(value.reactions) && value.reactions.length
      ? [...new Set(value.reactions.filter((emoji) => typeof emoji === 'string'))].slice(
          0,
          8
        )
      : DEFAULT_REACTIONS;

  const invited = Array.isArray(value.invited)
    ? [...new Set(value.invited.filter((id) => typeof id === 'string'))].slice(
        0,
        MAX_INVITES
      )
    : [];

  return {
    format: meta.id,
    options,
    reactions,
    invited,
  };
}

export function interactionsOf(post) {
  return Array.isArray(post?.interactions) ? post.interactions : [];
}

export function interactionsOfKind(post, kind) {
  return interactionsOf(post).filter((row) => row?.kind === kind);
}

export function myInteraction(post, kind) {
  return interactionsOfKind(post, kind).find((row) => row.by === 'me') || null;
}

// Uma pessoa por participação: trocar o voto atualiza a linha em vez de somar.
export function participantsOf(post, kind) {
  const seen = new Set();
  const list = [];
  interactionsOfKind(post, kind).forEach((row) => {
    if (!row?.by || seen.has(row.by)) return;
    seen.add(row.by);
    list.push(row);
  });
  return list;
}

export function countParticipants(post, kind) {
  return participantsOf(post, kind).length;
}

export function tallyVotes(post) {
  const interactive = normalizeInteractive(post?.interactive);
  const votes = interactionsOfKind(post, 'vote');
  const byOption = new Map();
  votes.forEach((row) => {
    if (!row?.optionId) return;
    byOption.set(row.optionId, (byOption.get(row.optionId) || 0) + 1);
  });
  const options = (interactive?.options || []).map((option) => {
    const count = byOption.get(option.id) || 0;
    return { ...option, count };
  });
  const total = options.reduce((sum, option) => sum + option.count, 0);
  const top = options.reduce((max, option) => Math.max(max, option.count), 0);
  return {
    options: options.map((option) => ({
      ...option,
      percent: total ? Math.round((option.count / total) * 100) : 0,
      leading: total > 0 && option.count === top,
    })),
    total,
    leadingCount: top,
  };
}

export function countAnswers(post) {
  return interactionsOfKind(post, 'answer').length;
}

export function hasParticipated(post, userId = 'me') {
  return interactionsOf(post).some((row) => row.by === userId);
}

export function optionsForFormat(format, media = [], previous = []) {
  if (format === 'poll') {
    const kept = (previous || [])
      .filter((option) => option && typeof option === 'object')
      .slice(0, MAX_OPTIONS);
    while (kept.length < MIN_OPTIONS) {
      kept.push({ id: uid(), label: '' });
    }
    return kept.map((option) => ({
      id: option.id || uid(),
      label: String(option.label || ''),
    }));
  }
  if (format === 'imageVote') {
    return syncImageVoteOptions(media, previous);
  }
  return [];
}

export function syncImageVoteOptions(media = [], previous = []) {
  const prev = Array.isArray(previous) ? previous : [];
  return media.map((_, index) => {
    const match =
      prev.find((option) => option?.mediaIndex === index) ||
      prev[index] ||
      null;
    return {
      id: match?.id || `img-${index + 1}`,
      label: String(match?.label || ''),
      mediaIndex: index,
    };
  });
}

export function buildInteractive(format, draft, media = []) {
  if (!format || format === 'classic') return null;
  const reactions = (draft.reactions || DEFAULT_REACTIONS).slice(0, 8);
  if (format === 'poll') {
    const options = (draft.options || [])
      .map((option, index) => ({
        id: `opt-${index + 1}`,
        label: String(option.label || '').trim(),
      }))
      .filter((option) => option.label)
      .slice(0, MAX_OPTIONS);
    return { format, options, reactions: [], invited: [] };
  }
  if (format === 'imageVote') {
    const options = media.map((_, index) => {
      const match =
        (draft.options || []).find((option) => option?.mediaIndex === index) || {};
      return {
        id: `opt-${index + 1}`,
        label: String(match.label || '').trim() || `Opção ${index + 1}`,
        mediaIndex: index,
      };
    });
    return { format, options, reactions: [], invited: [] };
  }
  if (format === 'reactions') {
    return { format, options: [], reactions, invited: [] };
  }
  if (format === 'challenge') {
    return {
      format,
      options: [],
      reactions: [],
      invited: (draft.invited || []).slice(0, MAX_INVITES),
    };
  }
  return { format, options: [], reactions: [], invited: [] };
}
