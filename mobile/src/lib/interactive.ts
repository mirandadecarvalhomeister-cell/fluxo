import type { Interactive, MediaItem } from '../types';
import { uid } from './format';

export const INTERACTIVE_FORMATS = [
  { id: 'classic', label: 'Publicação', hint: 'Texto, foto ou vídeo.' },
  { id: 'poll', label: 'Enquete', hint: 'Duas a seis alternativas.' },
  { id: 'question', label: 'Pergunta', hint: 'Pergunta aberta para respostas.' },
  { id: 'imageVote', label: 'Votação', hint: 'Compare imagens e descubra a favorita.' },
  { id: 'challenge', label: 'Desafio', hint: 'Proponha um desafio para a galera.' },
  { id: 'reactions', label: 'Reações', hint: 'Reações personalizadas na publicação.' },
] as const;

export type InteractiveFormat = (typeof INTERACTIVE_FORMATS)[number]['id'];

export const DEFAULT_REACTIONS = ['❤️', '🔥', '👏', '😂', '😮', '🎉', '💜'];
export const REACTION_CHOICES = ['❤️', '🔥', '👏', '😂', '😮', '😢', '🎉', '💜', '🤯', '🙌', '😍', '🤔', '💡', '👀', '🚀', '🍿'];
export const MAX_OPTIONS = 6;
export const MIN_OPTIONS = 2;

const toMs = (value: unknown) => {
  if (!value) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = new Date(String(value)).getTime();
  return Number.isFinite(parsed) ? parsed : null;
};

export function normalizeInteractive(raw: unknown): Interactive | null {
  if (!raw) return null;
  let value: any = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object' || !value.format) return null;
  const known = INTERACTIVE_FORMATS.find((item) => item.id === value.format);
  if (!known || known.id === 'classic') return null;

  const options = Array.isArray(value.options)
    ? value.options
        .map((option: any, index: number) => ({
          id: String(option?.id || `opt-${index + 1}`),
          label: String(option?.label || '').trim() || `Opção ${index + 1}`,
          ...(Number.isInteger(option?.mediaIndex) ? { mediaIndex: option.mediaIndex } : {}),
        }))
        .slice(0, MAX_OPTIONS)
    : [];

  const reactions = Array.isArray(value.reactions) && value.reactions.length
    ? [...new Set(value.reactions.filter((emoji: unknown) => typeof emoji === 'string'))].slice(0, 8)
    : DEFAULT_REACTIONS;

  const invited = Array.isArray(value.invited)
    ? [...new Set(value.invited.filter((id: unknown) => typeof id === 'string'))].slice(0, 20)
    : [];

  let schedule = null;
  if (value.schedule && value.schedule.mode === 'scheduled') {
    const closesAt = toMs(value.schedule.closesAt);
    if (closesAt) {
      schedule = {
        mode: 'scheduled' as const,
        durationMinutes: Math.max(1, Number(value.schedule.durationMinutes) || 1),
        releaseMinutes: Math.max(0, Number(value.schedule.releaseMinutes) || 0),
        opensAt: new Date(toMs(value.schedule.opensAt) || Date.now()).toISOString(),
        closesAt: new Date(closesAt).toISOString(),
        resultsAt: new Date(toMs(value.schedule.resultsAt) || closesAt).toISOString(),
      };
    }
  }

  return {
    format: known.id as Interactive['format'],
    options,
    reactions: reactions as string[],
    invited: invited as string[],
    ...(schedule ? { schedule } : {}),
    ...(value.live?.channelId
      ? {
          live: {
            channelId: String(value.live.channelId),
            pollId: String(value.live.pollId || ''),
            onlyChat: Boolean(value.live.onlyChat),
            title: String(value.live.title || ''),
          },
        }
      : {}),
  };
}

export function buildInteractive(
  format: InteractiveFormat,
  draft: {
    options?: { id?: string; label: string; mediaIndex?: number }[];
    reactions?: string[];
    invited?: string[];
    schedule?: Interactive['schedule'];
    live?: Interactive['live'];
  },
  media: MediaItem[] = []
): Interactive | null {
  if (format === 'classic') return null;
  const extras = {
    ...(draft.schedule?.mode === 'scheduled' ? { schedule: draft.schedule } : {}),
    ...(draft.live?.channelId ? { live: draft.live } : {}),
  };

  if (format === 'poll') {
    const options = (draft.options || [])
      .map((option, index) => ({
        id: `opt-${index + 1}`,
        label: String(option.label || '').trim(),
      }))
      .filter((option) => option.label)
      .slice(0, MAX_OPTIONS);
    return { format, options, reactions: [], invited: [], ...extras };
  }

  if (format === 'imageVote') {
    const options = media.map((_, index) => {
      const match = (draft.options || []).find((option) => option.mediaIndex === index);
      return {
        id: `opt-${index + 1}`,
        label: String(match?.label || '').trim() || `Opção ${index + 1}`,
        mediaIndex: index,
      };
    });
    return { format, options, reactions: [], invited: [], ...extras };
  }

  if (format === 'reactions') {
    return {
      format,
      options: [],
      reactions: (draft.reactions || DEFAULT_REACTIONS).slice(0, 8),
      invited: [],
      ...extras,
    };
  }

  if (format === 'challenge') {
    return {
      format,
      options: [],
      reactions: [],
      invited: (draft.invited || []).slice(0, 20),
      ...extras,
    };
  }

  return { format, options: [], reactions: [], invited: [], ...extras };
}

export function schedulePhase(interactive: Interactive | null, now = Date.now()) {
  const schedule = interactive?.schedule;
  if (!schedule) return 'open' as const;
  const closesAt = new Date(schedule.closesAt).getTime();
  const resultsAt = new Date(schedule.resultsAt).getTime();
  if (now < closesAt) return 'open' as const;
  if (now < resultsAt) return 'closed' as const;
  return 'results' as const;
}

export function scheduleLabel(interactive: Interactive | null) {
  const schedule = interactive?.schedule;
  if (!schedule) return '';
  const closesAt = new Date(schedule.closesAt).getTime();
  const resultsAt = new Date(schedule.resultsAt).getTime();
  const now = Date.now();
  if (now < closesAt) {
    const min = Math.ceil((closesAt - now) / 60000);
    return `Fecha em ${min} min`;
  }
  if (now < resultsAt) {
    const min = Math.ceil((resultsAt - now) / 60000);
    return `Resultados em ${min} min`;
  }
  return 'Resultados liberados';
}

export function newPollOption(label = '') {
  return { id: uid('opt-'), label };
}
