// Publicações interativas: enquetes, perguntas, votações com imagens,
// desafios e reações personalizadas. O formato fica em posts.interactive
// (JSONB) e as participações em public.post_interactions.
import { uid } from './utils.js';

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

// Experiências interativas podem ser publicadas na hora ("comum") ou com
// prazo e liberação de resultados ("programada"). O prazo máximo é 24 horas.
export const MAX_SCHEDULE_MINUTES = 24 * 60;
export const MIN_SCHEDULE_MINUTES = 1;
export const SCHEDULE_UNITS = [
  { id: 'minutes', label: 'minutos', factor: 1 },
  { id: 'hours', label: 'horas', factor: 60 },
];
export const RESULT_RELEASE_OPTIONS = [0, 5, 15, 30, 60];
export const SCHEDULABLE_FORMATS = ['poll', 'imageVote', 'challenge'];

export const DEFAULT_SCHEDULE = {
  mode: 'now',
  durationValue: 30,
  durationUnit: 'minutes',
  releaseMinutes: 0,
};

const toMs = (value) => {
  if (!value) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function isSchedulable(format) {
  return SCHEDULABLE_FORMATS.includes(format);
}

export function scheduleFromDraft(raw, now = Date.now()) {
  const value = { ...DEFAULT_SCHEDULE, ...(raw || {}) };
  if (value.mode !== 'scheduled') return null;
  const unit = SCHEDULE_UNITS.find((item) => item.id === value.durationUnit) || SCHEDULE_UNITS[0];
  const amount = Math.max(1, Math.round(Number(value.durationValue) || 1));
  const durationMinutes = clamp(
    Math.round(amount * unit.factor),
    MIN_SCHEDULE_MINUTES,
    MAX_SCHEDULE_MINUTES
  );
  const releaseMinutes = clamp(
    Math.round(Number(value.releaseMinutes) || 0),
    0,
    MAX_SCHEDULE_MINUTES - durationMinutes
  );
  const closesAt = now + durationMinutes * 60_000;
  return {
    mode: 'scheduled',
    durationMinutes,
    releaseMinutes,
    opensAt: new Date(now).toISOString(),
    closesAt: new Date(closesAt).toISOString(),
    resultsAt: new Date(closesAt + releaseMinutes * 60_000).toISOString(),
  };
}

export function normalizeSchedule(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const mode = raw.mode === 'scheduled' ? 'scheduled' : 'now';
  if (mode !== 'scheduled') return null;
  const durationMinutes = clamp(
    Math.round(Number(raw.durationMinutes) || 0) || MIN_SCHEDULE_MINUTES,
    MIN_SCHEDULE_MINUTES,
    MAX_SCHEDULE_MINUTES
  );
  const releaseMinutes = clamp(
    Math.round(Number(raw.releaseMinutes) || 0),
    0,
    MAX_SCHEDULE_MINUTES - durationMinutes
  );
  const closesAt = toMs(raw.closesAt);
  const resultsAt = toMs(raw.resultsAt);
  return {
    mode,
    durationMinutes,
    releaseMinutes,
    opensAt: toMs(raw.opensAt),
    closesAt,
    resultsAt: resultsAt ?? closesAt,
  };
}

export function scheduleOf(interactive) {
  return normalizeSchedule(interactive?.schedule);
}

// "open" enquanto aceita participação, "closed" entre o prazo e a liberação
// dos resultados, "results" quando os resultados já podem aparecer.
export function schedulePhase(interactive, now = Date.now()) {
  const schedule = scheduleOf(interactive);
  if (!schedule) return 'open';
  if (schedule.closesAt && now < schedule.closesAt) return 'open';
  if (schedule.resultsAt && now < schedule.resultsAt) return 'closed';
  return 'results';
}

export function isLocked(interactive, now = Date.now()) {
  return schedulePhase(interactive, now) !== 'open';
}

export function resultsReleased(interactive, now = Date.now()) {
  const schedule = scheduleOf(interactive);
  if (!schedule) return true;
  return schedulePhase(interactive, now) === 'results';
}

export function remainingLabel(ms) {
  if (ms == null || ms <= 0) return 'agora';
  const total = Math.ceil(ms / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${String(minutes).padStart(2, '0')}min`;
  if (minutes) return `${minutes}min ${String(seconds).padStart(2, '0')}s`;
  return `${seconds}s`;
}

export function scheduleSummary(schedule) {
  if (!schedule) return '';
  const hours = schedule.durationMinutes / 60;
  const duration =
    schedule.durationMinutes % 60 === 0
      ? `${hours} ${hours === 1 ? 'hora' : 'horas'}`
      : `${schedule.durationMinutes} min`;
  return schedule.releaseMinutes
    ? `Fecha em ${duration} · resultados ${schedule.releaseMinutes} min depois`
    : `Fecha em ${duration} · resultados na hora`;
}

// Estado pronto para a interface: fase, contagem regressiva e rótulos.
export function scheduleInfo(interactive, now = Date.now()) {
  const schedule = scheduleOf(interactive);
  if (!schedule) {
    return {
      scheduled: false,
      phase: 'open',
      schedule: null,
      closesAt: null,
      resultsAt: null,
      closesIn: null,
      resultsIn: null,
      label: '',
    };
  }
  const phase = schedulePhase(interactive, now);
  const closesIn = schedule.closesAt ? Math.max(0, schedule.closesAt - now) : null;
  const resultsIn = schedule.resultsAt ? Math.max(0, schedule.resultsAt - now) : null;
  let label = 'Aberta';
  if (phase === 'closed') {
    label = resultsIn != null ? `Resultados em ${remainingLabel(resultsIn)}` : 'Resultados em breve';
  } else if (phase === 'results') {
    label = 'Resultados liberados';
  } else if (closesIn != null) {
    label = `Fecha em ${remainingLabel(closesIn)}`;
  }
  return {
    scheduled: true,
    phase,
    schedule,
    closesAt: schedule.closesAt,
    resultsAt: schedule.resultsAt,
    closesIn,
    resultsIn,
    label,
  };
}

export function liveOf(interactive) {
  const live = interactive?.live;
  if (!live?.channelId) return null;
  return live;
}

export function livePollStatus(poll, now = Date.now()) {
  if (!poll) return 'closed';
  if (poll.status === 'closed') return 'closed';
  if (poll.closesAt && now >= poll.closesAt) return 'closed';
  return 'open';
}


export function formatMeta(format) {
  // Formato legado: publicações antigas ainda podem existir no banco.
  if (format === 'question') {
    return {
      id: 'question',
      label: 'Pergunta (antiga)',
      short: 'Pergunta',
      icon: 'comment',
      hint: 'Publicação criada antes da remoção do formato Pergunta.',
    };
  }
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

  const schedule = normalizeSchedule(value.schedule);
  const live = value.live && typeof value.live === 'object'
    ? {
        channelId: String(value.live.channelId || ''),
        pollId: String(value.live.pollId || ''),
        onlyChat: !!value.live.onlyChat,
        title: String(value.live.title || ''),
      }
    : null;

  return {
    format: meta.id,
    options,
    reactions,
    invited,
    ...(schedule ? { schedule } : {}),
    ...(live?.channelId ? { live } : {}),
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
  const schedule = isSchedulable(format) ? scheduleFromDraft(draft.schedule) : null;
  const live =
    draft.live && draft.live.channelId
      ? {
          channelId: String(draft.live.channelId),
          pollId: String(draft.live.pollId || ''),
          onlyChat: !!draft.live.onlyChat,
          title: String(draft.live.title || ''),
        }
      : null;
  const withExtras = (value) => ({
    ...value,
    ...(schedule ? { schedule } : {}),
    ...(live ? { live } : {}),
  });
  if (format === 'poll') {
    const options = (draft.options || [])
      .map((option, index) => ({
        id: `opt-${index + 1}`,
        label: String(option.label || '').trim(),
      }))
      .filter((option) => option.label)
      .slice(0, MAX_OPTIONS);
    return withExtras({ format, options, reactions: [], invited: [] });
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
    return withExtras({ format, options, reactions: [], invited: [] });
  }
  if (format === 'reactions') {
    return withExtras({ format, options: [], reactions, invited: [] });
  }
  if (format === 'challenge') {
    return withExtras({
      format,
      options: [],
      reactions: [],
      invited: (draft.invited || []).slice(0, MAX_INVITES),
    });
  }
  return withExtras({ format, options: [], reactions: [], invited: [] });
}
