import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { isRecoveryLink, isSupabaseEnabled } from '../lib/supabase';
import { isLiveKitEnabled } from '../lib/livekit';
import * as remote from '../lib/remote';
import {
  MAX_MEDIA_BYTES,
  MAX_POST_MEDIA,
  MAX_VIDEO_SECONDS,
  fileVideoDuration,
  mediaKind,
  mediaOf,
  mb,
  parseRemoteMedia,
} from '../lib/media';
import {
  DEFAULT_REACTIONS,
  DEFAULT_SCHEDULE,
  MAX_SCHEDULE_MINUTES,
  MIN_SCHEDULE_MINUTES,
  SCHEDULE_UNITS,
  buildInteractive,
  isLocked,
  isSchedulable,
  livePollStatus,
  myInteraction,
  normalizeInteractive,
  optionsForFormat,
  resultsReleased,
  scheduleFromDraft,
  scheduleOf,
  syncImageVoteOptions,
} from '../lib/interactive';
import { COVERS, STATE_VERSION, newState } from '../lib/seed';
import { mentionsHandle, notificationText } from '../lib/selectors';
import { DEFAULT_FEED_PREFS, feedPrefs } from '../lib/feed';
import {
  challengeLink as quizChallengeLink,
  claimInvite as quizClaimInvite,
  readPendingInvite as quizReadPendingInvite,
  clearPendingInvite as quizClearPendingInvite,
  saveChallenge as saveQuizChallenge,
} from '../games/quiz/quizData';
import { quizCardImage } from '../lib/quizCard';
import { REACTIONS as REACTIONS_PADRAO } from '../lib/reactionFx';
import { showDeviceNotification } from '../lib/notify';
import { playMessageSound, playSentSound } from '../lib/sound';
import {
  fileToDataURL,
  fileToRawDataURL,
  fmt,
  fmtDur,
  lsGet,
  lsSet,
  sha256,
  shareLink,
  uid,
} from '../lib/utils';

const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

const THEME_KEY = 'fluxo.theme';
const SETTINGS_KEY = 'fluxo.settings';
const SESSION_KEY = 'fluxo.session';
const ACCOUNTS_KEY = 'fluxo.accounts';
const DATA_PREFIX = 'fluxo.data.';
const DRAFT_KEY = 'fluxo.post.draft.v1';

function readDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== 'object') return null;
    return {
      text: String(saved.text || '').slice(0, 600),
      // Mídias locais não sobrevivem a recarregar: só referências remotas.
      media: Array.isArray(saved.media)
        ? saved.media.filter((item) => item?.src && !item.src.startsWith('blob:')).slice(0, 10)
        : [],
      format: String(saved.format || 'classic'),
      options: Array.isArray(saved.options) ? saved.options.slice(0, 6) : [],
      reactions: DEFAULT_REACTIONS,
      invited: Array.isArray(saved.invited) ? saved.invited.slice(0, 20) : [],
      communityId: saved.communityId || null,
      schedule: saved.schedule && typeof saved.schedule === 'object' ? saved.schedule : DEFAULT_SCHEDULE,
      live: null,
    };
  } catch {
    return null;
  }
}

function writeDraft(draft) {
  try {
    if (!draft?.text && !(draft?.media || []).length) {
      localStorage.removeItem(DRAFT_KEY);
      return;
    }
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* armazenamento indisponível */
  }
}

const DEFAULT_SETTINGS = {
  messageSound: true,
  notifications: false,
  reduceMotion: false,
  soundOnSend: false,
  mutedChats: [],
  liveChannels: [],
  chatWalls: {},
  feed: DEFAULT_FEED_PREFS,
  reactions: REACTIONS_PADRAO,
};

const readSettings = () => {
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(lsGet(SETTINGS_KEY) || '{}') || {}) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
};

const cacheKey = (email) => DATA_PREFIX + email;
const notifSeenKey = (id) => `fluxo.notifs.seen.${id}`;
const dropBlob = (_k, v) =>
  typeof v === 'string' && (v.startsWith('blob:') || v.length > 2_000_000)
    ? null
    : v;

function readCache(email) {
  try {
    const raw = lsGet(cacheKey(email));
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && parsed.v === STATE_VERSION ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(email, data) {
  try {
    lsSet(cacheKey(email), JSON.stringify(data, dropBlob));
  } catch (error) {
    console.warn('[cache]', error);
  }
}

function localPoll(row, myId) {
  if (!row) return null;
  let options = row.options || [];
  if (typeof options === 'string') {
    try {
      options = JSON.parse(options);
    } catch {
      options = [];
    }
  }
  return {
    id: row.id,
    channelId: row.channel_id || row.channelId,
    createdBy: row.created_by === myId || row.createdBy === myId ? 'me' : row.created_by || row.createdBy,
    question: row.question || '',
    options: Array.isArray(options) ? options : [],
    mode: row.mode === 'fluxo' ? 'fluxo' : 'chat',
    status: row.status === 'closed' ? 'closed' : 'open',
    postId: row.post_id || row.postId || null,
    closesAt: row.closes_at
      ? new Date(row.closes_at).getTime()
      : row.closesAt || null,
    closedAt: row.closed_at
      ? new Date(row.closed_at).getTime()
      : row.closedAt || null,
    ts: row.created_at
      ? new Date(row.created_at).getTime()
      : row.ts || Date.now(),
    votes: (row.votes || []).map((vote) => ({
      id: vote.id || `${vote.poll_id || row.id}:${vote.user_id}`,
      by: vote.user_id === myId ? 'me' : vote.user_id || vote.by,
      optionId: vote.option_id || vote.optionId || null,
      ts: vote.created_at ? new Date(vote.created_at).getTime() : vote.ts || Date.now(),
    })),
  };
}

function mergeWorkspace(base, ws, user) {
  const uidv = user.id;
  const asPerson = (id) => (id === uidv ? 'me' : id);

  const followerCounts = new Map();
  (ws.allFollows || []).forEach((row) => {
    followerCounts.set(
      row.following_id,
      (followerCounts.get(row.following_id) || 0) + 1
    );
  });

  const users = {};
  (ws.liveProfiles || []).forEach((p) => {
    if (!p.user_id || p.user_id === uidv) return;
    users[p.user_id] = {
      id: p.user_id,
      name: p.name || p.user_id,
      handle: p.handle || '',
      bio: p.bio || '',
      city: p.city || '',
      humor: p.humor || '',
      interests: p.interests || [],
      followers: followerCounts.get(p.user_id) || 0,
      avatar: p.avatar_url || null,
      cover: p.cover || { k: 'art', v: 'aurora' },
    };
  });

  const me = {
    ...base.me,
    name: ws.profile.name || base.me.name,
    handle: ws.profile.handle || base.me.handle,
    bio: ws.profile.bio ?? base.me.bio,
    city: ws.profile.city ?? base.me.city,
    humor: ws.profile.humor ?? base.me.humor,
    interests: ws.profile.interests ?? base.me.interests,
    avatar: ws.profile.avatar_url ?? base.me.avatar,
    cover: ws.profile.cover ?? base.me.cover,
    followers: followerCounts.get(uidv) || 0,
    since: ws.profile.created_at
      ? new Date(ws.profile.created_at).getTime()
      : base.me.since,
  };

  const commentsByPost = {};
  (ws.comments || []).forEach((c) => {
    const entry = {
      id: c.id,
      by: asPerson(c.author_id),
      text: c.text,
      ts: new Date(c.created_at).getTime(),
      liked: !!(ws.commentLikes?.mine || {})[c.id],
      likes: (ws.commentLikes?.counts || {})[c.id] || 0,
    };
    (commentsByPost[c.post_id] ||= []).push(entry);
  });

  const interactionsByPost = {};
  (ws.postInteractions || []).forEach((row) => {
    if (!row?.post_id) return;
    (interactionsByPost[row.post_id] ||= []).push({
      id: row.id,
      by: asPerson(row.user_id),
      kind: row.kind,
      optionId: row.option_id || null,
      text: row.text || '',
      ts: new Date(row.created_at || Date.now()).getTime(),
    });
  });

  // Enquetes de live no modo Fluxo: os votos do chat são a fonte principal e
  // entram também na publicação, para feed e chat mostrarem o mesmo resultado.
  const liveVotesByPoll = new Map();
  (ws.channelPollVotes || []).forEach((row) => {
    if (!row?.poll_id) return;
    if (!liveVotesByPoll.has(row.poll_id)) liveVotesByPoll.set(row.poll_id, []);
    liveVotesByPoll.get(row.poll_id).push({
      id: row.id || `${row.poll_id}:${row.user_id}`,
      by: asPerson(row.user_id),
      kind: 'vote',
      optionId: row.option_id || null,
      text: '',
      ts: new Date(row.created_at || Date.now()).getTime(),
    });
  });

  const postInteractions = (postId, interactive) => {
    let rows = (interactionsByPost[postId] || []).slice();
    const pollId = interactive?.live?.pollId;
    if (!pollId) return rows.sort((a, b) => a.ts - b.ts);
    const votes = new Map(
      rows.filter((row) => row.kind === 'vote').map((row) => [row.by, row])
    );
    (liveVotesByPoll.get(pollId) || []).forEach((vote) => votes.set(vote.by, vote));
    rows = [...rows.filter((row) => row.kind !== 'vote'), ...votes.values()];
    return rows.sort((a, b) => a.ts - b.ts);
  };

  const reactionCountsByPost = {};
  (ws.likeRows || []).forEach((row) => {
    if (!row?.post_id) return;
    const emoji = row.emoji || '❤️';
    (reactionCountsByPost[row.post_id] ||= {})[emoji] =
      (reactionCountsByPost[row.post_id][emoji] || 0) + 1;
  });

  const posts = (ws.posts || [])
    .map((p) => {
      const myReaction = ws.likes.mine.get(p.id) || null;
      const media = parseRemoteMedia(p.media);
      if (!media.length && p.media_url) {
        media.push({
          kind: ['video', 'audio'].includes(p.kind) ? p.kind : 'photo',
          src: p.media_url,
          seed: p.seed || p.id,
          dur: p.dur,
        });
      }
      if (!media.length && ['photo', 'video', 'audio'].includes(p.kind)) {
        media.push({ kind: p.kind, seed: p.seed || p.id, dur: p.dur });
      }
      const isStory =
        p.kind === 'story' || String(p.seed || '').startsWith('story:');
      const normalizedInteractive = normalizeInteractive(p.interactive);
      const interactionRows = postInteractions(p.id, normalizedInteractive);
      return {
        id: p.id,
        by: asPerson(p.author_id),
        ts: new Date(p.created_at).getTime(),
        text: p.text || '',
        kind: isStory ? 'story' : p.kind || 'text',
        seed: p.seed || p.id,
        src: p.media_url || media[0]?.src,
        media,
        communityId: p.community_id || null,
        dur: p.dur ?? undefined,
        likes: ws.likes.counts.get(p.id) || 0,
        liked: !!myReaction,
        myReaction,
        reactionCounts: reactionCountsByPost[p.id] || {},
        saved: ws.saves.has(p.id),
        commentsDisabled: !!p.comments_disabled,
        comments: (commentsByPost[p.id] || []).sort((a, b) => a.ts - b.ts),
        interactive: normalizedInteractive
          ? {
              ...normalizedInteractive,
              invited: normalizedInteractive.invited.map(asPerson),
            }
          : null,
        interactions: interactionRows,
        views: interactionRows.filter((row) => row.kind === 'view').length,
        viewed: interactionRows.some(
          (row) => row.kind === 'view' && row.by === 'me'
        ),
      };
    })
    .sort((a, b) => b.ts - a.ts);

  const commMemberCounts = new Map();
  (ws.allCommMembers || []).forEach((row) => {
    commMemberCounts.set(
      row.community_id,
      (commMemberCounts.get(row.community_id) || 0) + 1
    );
  });
  const myCommRoles = new Map(
    (ws.allCommMembers || [])
      .filter((row) => row.user_id === uidv)
      .map((row) => [row.community_id, row.role])
  );

  const comms = (ws.allComms || [])
    .map((c) => {
      const owner = asPerson(c.owner_id);
      const memberRows = (ws.allCommMembers || []).filter(
        (row) => row.community_id === c.id
      );
      const modIds = memberRows
        .filter((row) => row.role === 'owner' || row.role === 'moderator')
        .map((row) => asPerson(row.user_id));
      const mods = [...new Set([owner, ...modIds])];
      const channelIds = (ws.communityChannels || [])
        .filter((row) => row.community_id === c.id)
        .map((row) => row.channel_id);
      const requests = (ws.joinRequests || [])
        .filter(
          (row) =>
            row.community_id === c.id &&
            (row.status || 'pending') === 'pending' &&
            row.user_id !== uidv
        )
        .map((row) => ({
          id: row.user_id,
          userId: asPerson(row.user_id),
          ts: new Date(row.created_at || Date.now()).getTime(),
        }));
      const myRequest = (ws.joinRequests || []).find(
        (row) =>
          row.community_id === c.id &&
          row.user_id === uidv &&
          (row.status || 'pending') === 'pending'
      );
      const invite = (ws.communityInvites || []).find(
        (row) =>
          row.community_id === c.id &&
          row.invitee_id === uidv &&
          (row.status || 'pending') === 'pending'
      );
      return {
        id: c.id,
        name: c.name,
        cat: c.category || 'Outros',
        desc: c.description || '',
        subs: memberRows.length,
        owner,
        mods,
        joined: memberRows.some((row) => row.user_id === uidv),
        pending: !!myRequest,
        invited: invite ? invite.id : null,
        private: !!c.is_private,
        iconUrl: c.icon_url || null,
        coverUrl: c.cover_url || null,
        seed: c.cover_seed || c.id + '-capa',
        rules: c.rules?.length ? c.rules : ['Respeite todo mundo no fluxo.'],
        members: memberRows.map((row) => asPerson(row.user_id)),
        requests,
        channelIds,
        topics: (ws.topics || [])
          .filter((t) => t.community_id === c.id)
          .map((t) => ({
            id: t.id,
            by: asPerson(t.author_id),
            title: t.title,
            pinned: !!t.pinned,
            replies: t.replies || 0,
            ts: new Date(t.created_at).getTime(),
          }))
          .sort((a, b) => b.ts - a.ts),
      };
    })
    .sort((a, b) => b.subs - a.subs);

  const chanMemberCounts = new Map();
  (ws.allChanMembers || []).forEach((row) => {
    chanMemberCounts.set(
      row.channel_id,
      (chanMemberCounts.get(row.channel_id) || 0) + 1
    );
  });

  const reactsByMsg = {};
  (ws.reactions || []).forEach((r) => {
    (reactsByMsg[r.message_id] ||= {})[r.emoji] = true;
  });

  const pollVotesByPoll = new Map();
  (ws.channelPollVotes || []).forEach((row) => {
    if (!row?.poll_id) return;
    if (!pollVotesByPoll.has(row.poll_id)) pollVotesByPoll.set(row.poll_id, []);
    pollVotesByPoll.get(row.poll_id).push({
      id: row.id || `${row.poll_id}:${row.user_id}`,
      by: asPerson(row.user_id),
      optionId: row.option_id || null,
      ts: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    });
  });

  const chans = (ws.allChannels || [])
    .map((c) => ({
      id: c.id,
      owner: asPerson(c.owner_id),
      name: c.name,
      desc: c.description || '',
      kind: c.kind || 'conversa',
      followers: Number(c.followers) || 0,
      live: !!c.is_live,
      livekit: !!c.livekit,
      title: c.title || '',
      viewers: c.viewers || 0,
      joined: ws.chanMembers.has(c.id),
      subscribed: (ws.channelSubscriptions || []).includes(c.id),
      seed: c.seed || c.id + '-palco',
      polls: (ws.channelPolls || [])
        .filter((poll) => poll.channel_id === c.id)
        .map((poll) => {
          let options = poll.options || [];
          if (typeof options === 'string') {
            try {
              options = JSON.parse(options);
            } catch {
              options = [];
            }
          }
          return {
            id: poll.id,
            channelId: poll.channel_id,
            createdBy: asPerson(poll.created_by),
            question: poll.question || '',
            options: Array.isArray(options) ? options : [],
            mode: poll.mode === 'fluxo' ? 'fluxo' : 'chat',
            status: poll.status === 'closed' ? 'closed' : 'open',
            postId: poll.post_id || null,
            closesAt: poll.closes_at ? new Date(poll.closes_at).getTime() : null,
            closedAt: poll.closed_at ? new Date(poll.closed_at).getTime() : null,
            ts: poll.created_at ? new Date(poll.created_at).getTime() : Date.now(),
            votes: (pollVotesByPoll.get(poll.id) || []).slice(),
          };
        })
        .sort((a, b) => b.ts - a.ts),
      msgs: (ws.chanMsgs || [])
        .filter((m) => m.channel_id === c.id)
        .map((m) => {
          const entry = {
            id: m.id,
            by: asPerson(m.author_id),
            text: m.text,
            ts: new Date(m.created_at).getTime(),
          };
          const mine = reactsByMsg[m.id];
          return mine ? { ...entry, mine: { ...mine } } : entry;
        })
        .sort((a, b) => a.ts - b.ts),
    }))
    .sort((a, b) => Number(b.live) - Number(a.live) || b.followers - a.followers);

  const chatsByPerson = new Map();
  (ws.directMessages || []).forEach((m) => {
    const mine = m.sender_id === uidv;
    const other = asPerson(mine ? m.recipient_id : m.sender_id);
    if (!other || other === 'me') return;
    if (!chatsByPerson.has(other)) {
      chatsByPerson.set(other, { id: other, with: other, unread: 0, msgs: [] });
    }
    const chat = chatsByPerson.get(other);
    chat.msgs.push({
      id: m.id,
      me: mine,
      text: m.text || '',
      ts: new Date(m.created_at).getTime(),
      st: mine ? (m.read ? 'read' : 'sent') : '',
      ...(m.attachment ? { attachment: m.attachment } : {}),
      ...(m.edited_at ? { editedAt: new Date(m.edited_at).getTime() } : {}),
    });
    if (!mine && !m.read) chat.unread += 1;
  });

  const chats = [...chatsByPerson.values()].map((chat) => ({
    ...chat,
    msgs: chat.msgs.sort((a, b) => a.ts - b.ts),
  }));

  const scraps = (ws.scraps || []).map((s) => ({
    id: s.id,
    by: asPerson(s.author_id),
    text: s.text,
    ts: new Date(s.created_at).getTime(),
  }));

  const followers = (ws.allFollows || [])
    .filter((row) => row.following_id === uidv)
    .map((row) => asPerson(row.follower_id))
    .filter((id) => id !== 'me');

  // Notificações: curtidas e comentários nos meus posts e quem começou
  // a me seguir — derivadas dos dados que já carregamos.
  const myPostIds = new Set(
    (ws.posts || []).filter((p) => p.author_id === uidv).map((p) => p.id)
  );
  const notifications = [];
  (ws.likeRows || []).forEach((row) => {
    if (row.user_id === uidv || !myPostIds.has(row.post_id)) return;
    notifications.push({
      id: `like:${row.post_id}:${row.user_id}`,
      type: 'like',
      actorId: row.user_id,
      postId: row.post_id,
      emoji: row.emoji || '❤️',
      ts: new Date(row.created_at || Date.now()).getTime(),
    });
  });
  (ws.comments || []).forEach((c) => {
    if (c.author_id === uidv || !myPostIds.has(c.post_id)) return;
    notifications.push({
      id: `comment:${c.id}`,
      type: 'comment',
      actorId: c.author_id,
      postId: c.post_id,
      text: c.text || '',
      ts: new Date(c.created_at || Date.now()).getTime(),
    });
  });
  // Participações nas minhas publicações interativas (voto, resposta ou
  // entrada em desafio) e convites recebidos em desafios.
  const postsById = new Map(posts.map((post) => [post.id, post]));
  (ws.postInteractions || []).forEach((row) => {
    if (!row?.post_id || row.user_id === uidv) return;
    if (row.kind === 'view') return; // visualizações não geram notificação
    const post = postsById.get(row.post_id);
    if (!post || post.by !== 'me') return;
    notifications.push({
      id: `interaction:${row.id}`,
      type: 'interaction',
      actorId: row.user_id,
      postId: row.post_id,
      interactionKind: row.kind,
      optionId: row.option_id || null,
      ts: new Date(row.created_at || Date.now()).getTime(),
    });
  });
  (ws.posts || []).forEach((post) => {
    const interactive = normalizeInteractive(post.interactive);
    if (post.author_id === uidv || interactive?.format !== 'challenge') return;
    if (!interactive.invited?.includes(uidv)) return;
    notifications.push({
      id: `challenge:${post.id}`,
      type: 'challenge',
      actorId: post.author_id,
      postId: post.id,
      ts: new Date(post.created_at || Date.now()).getTime(),
    });
  });
  (ws.allFollows || []).forEach((row) => {
    if (row.following_id !== uidv || row.follower_id === uidv) return;
    notifications.push({
      id: `follow:${row.follower_id}`,
      type: 'follow',
      actorId: row.follower_id,
      ts: new Date(row.created_at || Date.now()).getTime(),
    });
  });

  // Menções (@handle) em publicações e comentários de outras pessoas.
  const myHandle = String(ws.profile?.handle || '').toLowerCase();
  if (myHandle) {
    (ws.posts || []).forEach((p) => {
      if (p.author_id === uidv || !mentionsHandle(p.text, myHandle)) return;
      notifications.push({
        id: `mention:post:${p.id}`,
        type: 'mention',
        source: 'post',
        actorId: p.author_id,
        postId: p.id,
        ts: new Date(p.created_at || Date.now()).getTime(),
      });
    });
    (ws.comments || []).forEach((c) => {
      if (
        c.author_id === uidv ||
        myPostIds.has(c.post_id) || // comentário no meu post já notifica
        !mentionsHandle(c.text, myHandle)
      ) {
        return;
      }
      notifications.push({
        id: `mention:comment:${c.id}`,
        type: 'mention',
        source: 'comment',
        actorId: c.author_id,
        postId: c.post_id,
        ts: new Date(c.created_at || Date.now()).getTime(),
      });
    });
  }
  // Convites e solicitações de comunidades.
  (ws.communityInvites || []).forEach((row) => {
    if (row.invitee_id !== uidv || (row.status || 'pending') !== 'pending') return;
    notifications.push({
      id: `cInvite:${row.id}`,
      type: 'communityInvite',
      actorId: row.inviter_id,
      communityId: row.community_id,
      inviteId: row.id,
      ts: new Date(row.created_at || Date.now()).getTime(),
    });
  });
  const myManagedComms = new Set(
    (ws.allComms || [])
      .filter((row) => row.owner_id === uidv)
      .map((row) => row.id)
  );
  (ws.allCommMembers || []).forEach((row) => {
    if (
      row.user_id === uidv &&
      (row.role === 'owner' || row.role === 'moderator')
    ) {
      myManagedComms.add(row.community_id);
    }
  });
  (ws.joinRequests || []).forEach((row) => {
    if (
      !myManagedComms.has(row.community_id) ||
      row.user_id === uidv ||
      (row.status || 'pending') !== 'pending'
    ) {
      return;
    }
    notifications.push({
      id: `cRequest:${row.community_id}:${row.user_id}`,
      type: 'communityRequest',
      actorId: row.user_id,
      communityId: row.community_id,
      ts: new Date(row.created_at || Date.now()).getTime(),
    });
  });

  notifications.sort((a, b) => b.ts - a.ts);
  const trimmedNotifications = notifications.slice(0, 80);

  const customStickerPacks = (ws.stickerPacks || []).map((pack) => ({
    id: pack.id,
    name: pack.name,
    icon: pack.icon || '✨',
    ts: new Date(pack.created_at || Date.now()).getTime(),
    custom: true,
    stickers: (ws.stickerRows || [])
      .filter((row) => row.pack_id === pack.id)
      .map((row) => ({
        id: row.id,
        src: row.src,
        ts: new Date(row.created_at || 0).getTime(),
      }))
      .sort((a, b) => a.ts - b.ts),
  }));

  return {
    ...base,
    me: { ...me, scraps },
    users,
    follows: ws.follows || [],
    followers,
    posts,
    comms,
    commExtras: ws.communityExtras || { gallery: [], events: [], rsvps: [], classifieds: [], notifications: [], announcements: [] },
    emojiFavorites: ws.emojiFavorites || [],
    chans,
    chats,
    customStickerPacks,
    notifications: trimmedNotifications,
  };
}

const demoAccounts = () => {
  try {
    return JSON.parse(lsGet(ACCOUNTS_KEY) || '{}');
  } catch {
    return {};
  }
};

const readHash = () => {
  const hash = location.hash || '#feed';
  const [path, query] = hash.slice(1).split('?');
  const raw = path || 'feed';
  const [route, param, extra] = raw.split('/');
  const params = new URLSearchParams(query || '');
  const valid = ['feed', 'perfil', 'mensagens', 'conexoes', 'comunidade'].includes(route)
    ? route
    : 'feed';
  let room = null;
  let arenaCode = null;
  let quizOpen = false;
  let quizChallenge = null;
  let quizInvite = null;
  let enigmasOpen = false;
  let defesaOpen = false;
  let commId = null;
  if (valid === 'comunidade' && param) {
    try { commId = decodeURIComponent(param); } catch { commId = param; }
  }
  if (valid === 'conexoes' && param) {
    if (param === 'arena') {
      arenaCode = extra
        ? (() => {
            try {
              return decodeURIComponent(extra).trim().toUpperCase();
            } catch {
              return extra.trim().toUpperCase();
            }
          })()
        : '';
    } else if (param === 'quiz') {
      quizOpen = true;
      quizChallenge = params.get('desafio') || params.get('challenge') || null;
      quizInvite = params.get('convite') || params.get('invite') || null;
    } else if (param === 'enigmas') {
      enigmasOpen = true;
    } else if (param === 'defesa') {
      defesaOpen = true;
    } else {
      try {
        room = decodeURIComponent(param);
      } catch {
        room = param;
      }
    }
  }
  return { route, room, arenaCode, quizOpen, quizChallenge, quizInvite, enigmasOpen, defesaOpen, commId };
};

// Convites/compartilhamentos chegam com parâmetros na URL (ex.:
// #conexoes/quiz?desafio=... ou ?convite=...). O modo visitante só vale para
// esses links — nunca para um F5 comum na tela de login.
const INVITE_KEYS = ['convite', 'invite', 'desafio', 'challenge'];

const hasInviteParams = () => {
  if (typeof window === 'undefined') return false;
  const hashQuery = (location.hash || '').split('?')[1] || '';
  const search = (location.search || '').replace(/^\?/, '');
  const params = new URLSearchParams(`${hashQuery}&${search}`);
  return INVITE_KEYS.some((key) => params.has(key));
};

// "Consome" o convite: remove só os parâmetros de convite da URL, mantendo a
// rota (ex.: #conexoes/quiz). Assim um recarregamento depois não reativa o
// modo visitante.
const clearInviteParams = () => {
  if (typeof window === 'undefined') return;
  const hash = location.hash || '';
  const hashQuery = hash.split('?')[1] || '';
  const search = (location.search || '').replace(/^\?/, '');
  const hadInvite =
    INVITE_KEYS.some((k) => new URLSearchParams(hashQuery).has(k)) ||
    INVITE_KEYS.some((k) => new URLSearchParams(search).has(k));
  if (!hadInvite) return;

  // Search (fora do hash).
  const searchParams = new URLSearchParams(search);
  INVITE_KEYS.forEach((key) => searchParams.delete(key));
  const restSearch = searchParams.toString();

  // Hash (ex.: #conexoes/quiz?desafio=... -> #conexoes/quiz).
  let cleanHash = '';
  if (hash) {
    const [path, query] = hash.slice(1).split('?');
    const hashParams = new URLSearchParams(query || '');
    INVITE_KEYS.forEach((key) => hashParams.delete(key));
    const restHash = hashParams.toString();
    cleanHash = '#' + path + (restHash ? '?' + restHash : '');
  }
  history.replaceState(
    null,
    '',
    location.pathname + (restSearch ? '?' + restSearch : '') + cleanHash
  );
};

const initialUi = () => {
  const { route, room, arenaCode, quizOpen, quizChallenge, quizInvite, enigmasOpen, defesaOpen, commId } = readHash();
  return {
    route,
    draft: readDraft() || {
      text: '',
      media: [],
      format: 'classic',
      options: [],
      reactions: DEFAULT_REACTIONS,
      invited: [],
      communityId: null,
      schedule: DEFAULT_SCHEDULE,
      live: null,
    },
    open: {},
    profTab: 'posts',
    chat: null,
    chatOpen: false,
    chatQ: '',
    typing: {},
    room,
    arenaCode,
    quizOpen,
    quizChallenge,
    quizInvite,
    enigmasOpen,
    defesaOpen,
    commId,
    chanFilter: 'all',
    myLive: null,
    authTab: 'in',
    modal: null,
    clips: null,
    commSeed: COVERS[0],
    commDraft: null,
    settings: readSettings(),
    theme:
      lsGet(THEME_KEY) ||
      (typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'),
  };
};

export function AppProvider({ children }) {
  const [data, setData] = useState(null);
  const [guest, setGuest] = useState(false);
  const [ui, setUi] = useState(initialUi);
  const [ready, setReady] = useState(false);
  const [resultsTick, setResultsTick] = useState(0);
  const [session, setSession] = useState(null);
  const [recovery, setRecovery] = useState(isRecoveryLink);
  const [toastMsg, setToastMsg] = useState('');
  const [canInstall, setCanInstall] = useState(false);
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  );
  const [onlinePeople, setOnlinePeople] = useState([]);
  const [typingPeople, setTypingPeople] = useState({});

  const installPrompt = useRef(null);
  const toastTimer = useRef();
  const timers = useRef({});
  const lastUserId = useRef(null);
  const recoveryRef = useRef(isRecoveryLink);
  const uiRef = useRef(ui);
  const dataRef = useRef(data);
  const sessionRef = useRef(session);
  const presenceRef = useRef(null);
  const typingTimersRef = useRef({});
  const lastTypingRef = useRef({});
  const viewedRef = useRef(new Set());
  const feedCursorRef = useRef(null);
  const resultsNotifiedRef = useRef(new Set());
  const resultsHydratedRef = useRef(new Set());
  uiRef.current = ui;
  dataRef.current = data;
  sessionRef.current = session;

  const toast = useCallback((msg) => {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(''), 2800);
  }, []);

  useEffect(() => {
    // O tema acompanha a preferência salva (localStorage e, quando logado,
    // também no perfil do Supabase) — inclusive nas telas de autenticação.
    document.documentElement.dataset.theme = ui.theme;
    lsSet(THEME_KEY, ui.theme);
    const uid = sessionRef.current?.id;
    if (uid) remote.setProfileTheme(uid, ui.theme);
  }, [ui.theme]);

  useEffect(() => {
    lsSet(SETTINGS_KEY, JSON.stringify(ui.settings));
    document.documentElement.dataset.motion = ui.settings.reduceMotion ? 'reduce' : 'full';
  }, [ui.settings]);

  // Rascunho do site: salvo automaticamente no armazenamento local.
  useEffect(() => {
    writeDraft(ui.draft);
  }, [ui.draft]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onPrompt = (event) => {
      event.preventDefault();
      installPrompt.current = event;
      setCanInstall(true);
    };
    const onInstalled = () => {
      installPrompt.current = null;
      setCanInstall(false);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleOnline = () => {
      setOnline(true);
      toast('Conexão restabelecida.');
    };
    const handleOffline = () => {
      setOnline(false);
      toast('Você está offline. O conteúdo local continua disponível.');
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [toast]);

  useEffect(() => {
    const onHash = () => {
      const { route, room, arenaCode, quizOpen, quizChallenge, quizInvite, enigmasOpen, defesaOpen, commId } = readHash();
      setUi((u) =>
        u.route === route &&
        u.room === room &&
        u.arenaCode === arenaCode &&
        u.quizOpen === quizOpen &&
        u.enigmasOpen === enigmasOpen &&
        u.defesaOpen === defesaOpen &&
        u.commId === commId &&
        (u.quizChallenge || null) === (quizChallenge || null)
          ? u
          : { ...u, route, room, arenaCode, quizOpen, quizChallenge, quizInvite, enigmasOpen, defesaOpen, commId }
      );
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    if (data?.email) writeCache(data.email, data);
  }, [data]);

  // Visitante: navega pelo site com um estado local vazio por 10 segundos;
  // o GuestGate bloqueia a interação e pede cadastro quando o tempo acaba.
  const startGuest = useCallback(() => {
    setGuest(true);
    setSession(null);
    setData(newState('Visitante', 'visitante@fluxo.app'));
    // Consome o convite da URL para que um F5 depois não reative o visitante.
    clearInviteParams();
  }, []);

  const exitGuest = useCallback(() => {
    setGuest(false);
    setData(null);
    setSession(null);
  }, []);

  const startLocal = useCallback((email, name) => {
    setGuest(false);
    const cached = readCache(email);
    const state = cached || newState(name || email.split('@')[0], email);
    if (!cached) writeCache(email, state);
    setSession({ email, name: state.me.name, demo: true });
    setData(state);
    const deep = readHash();
    setUi((u) => ({
      ...u,
      chat: state.chats[0]?.id || null,
      chatOpen: false,
      room: deep.route === 'conexoes' ? deep.room : null,
      myLive: null,
      modal: null,
      typing: {},
    }));
    setReady(true);
  }, []);

  const startSupabase = useCallback(
    async (user) => {
      if (lastUserId.current === user.id && dataRef.current) return;
      lastUserId.current = user.id;
      setGuest(false);
      setSession(user);
      const email = user.email || 'conta';
      const cached = readCache(email);
      const base = cached || newState(user.user_metadata?.name || email.split('@')[0], email);
      const localPostIds = base.posts.map((p) => p.id);
      const localChanIds = base.chans.map((c) => c.id);
      let workspace = null;
      try {
        workspace = await remote.loadWorkspace(user, localPostIds, localChanIds);
      } catch (error) {
        console.warn(error);
        toast('Não foi possível carregar o Supabase. Seguindo com os dados locais.');
      }
      const merged = workspace ? mergeWorkspace(base, workspace, user) : base;
      setData(merged);
      const deep = readHash();
      setUi((u) => ({
        ...u,
        chat: merged.chats[0]?.id || null,
        chatOpen: false,
        room: deep.route === 'conexoes' ? deep.room : null,
        myLive: null,
        modal: null,
        typing: {},
        theme:
          workspace?.profile?.theme === 'light' || workspace?.profile?.theme === 'dark'
            ? workspace.profile.theme
            : u.theme,
        settings: workspace?.feedPrefs
          ? {
              ...u.settings,
              feed: { ...feedPrefs(u.settings), ...workspace.feedPrefs },
            }
          : u.settings,
      }));
      feedCursorRef.current = null;
      writeCache(email, merged);
      setReady(true);

      // Aplica convite de quiz que veio por link antes do cadastro: só agora,
      // com sessão ativa, o bônus de +3 rodadas pode ser concedido.
      const pendingInvite = quizReadPendingInvite();
      if (pendingInvite) {
        quizClaimInvite(pendingInvite).then((ok) => {
          if (ok) {
            quizClearPendingInvite();
            toast('Convite aceito! Você ganhou +3 rodadas no Quiz BOOM.');
          }
        });
      }
    },
    [toast]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (isSupabaseEnabled) {
        if (isRecoveryLink) {
          if (!cancelled) setReady(true);
          return;
        }
        const s = await remote.getSession();
        if (cancelled) return;
        if (s?.user) await startSupabase(s.user);
        else if (hasInviteParams()) startGuest();
        setReady(true);
      } else {
        const email = lsGet(SESSION_KEY);
        if (email) startLocal(email);
        else if (hasInviteParams()) startGuest();
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [startLocal, startSupabase, startGuest]);

  useEffect(() => {
    if (!isSupabaseEnabled) return undefined;
    return remote.onAuthChange((s, event) => {
      if (event === 'PASSWORD_RECOVERY') {
        recoveryRef.current = true;
        setRecovery(true);
        setReady(true);
        return;
      }
      if (recoveryRef.current) return;
      if (s?.user) startSupabase(s.user);
      else {
        lastUserId.current = null;
        if (hasInviteParams()) startGuest();
        else {
          setGuest(false);
          setSession(null);
          setData(null);
        }
      }
    });
  }, [startSupabase, startGuest]);

  useEffect(() => {
    if (!isSupabaseEnabled || !session?.id) return undefined;
    return remote.subscribeDirectMessages(session.id, (row, event) => {
      if (!row) return;
      if (event === 'UPDATE') {
        if (!row.id) return;
        // Edição de texto chega em tempo real para os dois lados.
        if (row.edited_at) {
          setData((cur) =>
            cur
              ? {
                  ...cur,
                  chats: cur.chats.map((chat) => ({
                    ...chat,
                    msgs: chat.msgs.map((item) =>
                      item.id === row.id
                        ? {
                            ...item,
                            text: row.text || '',
                            editedAt: new Date(row.edited_at).getTime(),
                            ...(row.attachment !== undefined
                              ? { attachment: row.attachment || undefined }
                              : {}),
                          }
                        : item
                    ),
                  })),
                }
              : cur
          );
          return;
        }
        if (!row.read) return;
        // O "visto" do outro lado chega em tempo real: marca os meus envios.
        setData((cur) =>
          cur
            ? {
                ...cur,
                chats: cur.chats.map((chat) => ({
                  ...chat,
                  msgs: chat.msgs.map((item) =>
                    item.id === row.id ? { ...item, st: 'read' } : item
                  ),
                })),
              }
            : cur
        );
        return;
      }
      if (event === 'DELETE') {
        if (!row.id) return;
        setData((cur) =>
          cur
            ? {
                ...cur,
                chats: cur.chats.map((chat) =>
                  chat.msgs.some((item) => item.id === row.id)
                    ? { ...chat, msgs: chat.msgs.filter((item) => item.id !== row.id) }
                    : chat
                ),
              }
            : cur
        );
        return;
      }
      if (!row.sender_id) return;
      // Ignora mensagens de quem não se segue mutuamente (defesa no cliente).
      if (!canMessage(row.sender_id)) return;
      const settings = uiRef.current.settings || DEFAULT_SETTINGS;
      const viewing =
        uiRef.current.route === 'mensagens' && uiRef.current.chat === row.sender_id;
      const message = {
        id: row.id,
        me: false,
        text: row.text || '',
        ts: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
        st: '',
        ...(row.attachment ? { attachment: row.attachment } : {}),
      };
      setData((cur) => {
        if (!cur) return cur;
        const exists = cur.chats.some((chat) => chat.with === row.sender_id);
        const chats = exists
          ? cur.chats.map((chat) =>
              chat.with === row.sender_id
                ? {
                    ...chat,
                    msgs: chat.msgs.some((item) => item.id === message.id)
                      ? chat.msgs
                      : [...chat.msgs, message],
                    unread: viewing ? chat.unread : (chat.unread || 0) + 1,
                  }
                : chat
            )
          : [
              {
                id: row.sender_id,
                with: row.sender_id,
                unread: 1,
                msgs: [message],
              },
              ...cur.chats,
            ];
        return { ...cur, chats };
      });
      if (viewing) {
        remote.markDirectMessagesRead(session.id, row.sender_id);
      }
      const muted = (settings.mutedChats || []).includes(row.sender_id);
      if (settings.messageSound && !muted) playMessageSound();
      if (
        settings.notifications &&
        !muted &&
        document.hidden &&
        row.sender_id !== session.id
      ) {
        showDeviceNotification('Nova mensagem no Fluxo', {
          body: row.text || 'Você recebeu um anexo.',
          tag: `dm:${row.sender_id}`,
          data: { url: '/#mensagens' },
        });
      }
    });
  }, [session?.id]);

  // Novos seguidores em tempo real: atualiza o sino e avisa no celular.
  useEffect(() => {
    if (!isSupabaseEnabled || !session?.id) return undefined;
    return remote.subscribeFollows(session.id, (row) => {
      const followerId = row?.follower_id;
      if (!followerId || followerId === session.id) return;
      const settings = uiRef.current.settings || DEFAULT_SETTINGS;
      setData((cur) => {
        if (!cur) return cur;
        const alreadyFollower = (cur.followers || []).includes(followerId);
        const entry = {
          id: `follow:${followerId}`,
          type: 'follow',
          actorId: followerId,
          ts: Date.now(),
        };
        const already = (cur.notifications || []).some(
          (item) => item.id === entry.id
        );
        return {
          ...cur,
          followers: alreadyFollower
            ? cur.followers
            : [...(cur.followers || []), followerId],
          me: cur.me
            ? {
                ...cur.me,
                followers: (cur.me.followers || 0) + (alreadyFollower ? 0 : 1),
              }
            : cur.me,
          notifications: already
            ? cur.notifications
            : [entry, ...(cur.notifications || [])].slice(0, 80),
        };
      });
      const person = dataRef.current?.users?.[followerId];
      const label = person?.name || 'Alguém';
      if (settings.notifications && document.hidden) {
        showDeviceNotification('Novo seguidor no Fluxo', {
          body: `${label} começou a seguir você`,
          tag: `follow:${followerId}`,
          data: { url: '/#perfil' },
        });
      } else {
        toast(`${label} começou a seguir você`);
      }
    });
  }, [session?.id, toast]);

  // Presença online e "digitando…" via Realtime (presence + broadcast).
  useEffect(() => {
    if (!isSupabaseEnabled || !session?.id) return undefined;
    const client = remote.joinPresence(session.id, {
      onSync: (ids) => setOnlinePeople(ids),
      onTyping: (payload) => {
        const from = payload?.from;
        if (!from || !payload?.to || payload.to !== session.id) return;
        setTypingPeople((current) => ({ ...current, [from]: payload.to }));
        clearTimeout(typingTimersRef.current[from]);
        typingTimersRef.current[from] = window.setTimeout(() => {
          delete typingTimersRef.current[from];
          setTypingPeople((current) => {
            if (!(from in current)) return current;
            const next = { ...current };
            delete next[from];
            return next;
          });
        }, 4200);
      },
    });
    presenceRef.current = client;
    return () => {
      presenceRef.current = null;
      Object.values(typingTimersRef.current).forEach((id) => clearTimeout(id));
      typingTimersRef.current = {};
      lastTypingRef.current = {};
      setTypingPeople({});
      setOnlinePeople([]);
      client?.leave();
    };
  }, [session?.id]);

  useEffect(() => {
    if (!isSupabaseEnabled || !session?.id || !ui.room) return undefined;
    return remote.subscribeChannelMessages(ui.room, (row) => {
      if (!row || !row.id || !row.channel_id) return;
      const message = {
        id: row.id,
        by: row.author_id === session.id ? 'me' : row.author_id,
        text: row.text || '',
        ts: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
      };
      setData((cur) => {
        if (!cur) return cur;
        const channel = cur.chans.find((item) => item.id === row.channel_id);
        if (!channel) return cur;
        if (channel.msgs.some((item) => item.id === message.id)) return cur;
        return {
          ...cur,
          chans: cur.chans.map((item) =>
            item.id === row.channel_id
              ? { ...item, msgs: [...item.msgs, message] }
              : item
          ),
        };
      });
    });
  }, [session?.id, ui.room]);

  // Reforço por polling para o canal aberto. O Realtime depende de a
  // publicação estar habilitada nas tabelas; o polling garante que mensagens
  // da live e o encerramento apareçam para quem assiste mesmo sem isso.
  useEffect(() => {
    if (!isSupabaseEnabled || !session?.id || !ui.room) return undefined;
    const channelId = ui.room;
    let cancelled = false;
    let running = false;

    const merge = async () => {
      if (cancelled || running || document.hidden) return;
      running = true;
      try {
        const [row, rows, pollRows] = await Promise.all([
          remote.fetchChannelSnapshot(channelId),
          remote.fetchChannelMessages(channelId),
          remote.fetchChannelPolls(channelId),
        ]);
        if (cancelled) return;
        setData((cur) => {
          if (!cur) return cur;
          const channel = cur.chans.find((item) => item.id === channelId);
          if (!channel) return cur;
          let next = channel;
          if (row) {
            next = {
              ...next,
              name: row.name || next.name,
              desc: row.description ?? next.desc,
              kind: row.kind || next.kind,
              live: !!row.is_live,
              livekit: !!row.livekit,
              title: row.title || '',
              viewers: row.viewers || 0,
              seed: row.seed || next.seed,
            };
          }
          const known = new Set(next.msgs.map((item) => item.id));
          const incoming = rows
            .filter((item) => item && item.id && !known.has(item.id))
            .map((item) => ({
              id: item.id,
              by: item.author_id === session.id ? 'me' : item.author_id,
              text: item.text || '',
              ts: item.created_at
                ? new Date(item.created_at).getTime()
                : Date.now(),
            }));
          if (incoming.length) {
            next = {
              ...next,
              msgs: [...next.msgs, ...incoming].sort((a, b) => a.ts - b.ts),
            };
          }
          const incomingPolls = (pollRows || [])
            .map((poll) => localPoll(poll, session.id))
            .filter(Boolean);
          if (incomingPolls.length) {
            const map = new Map((next.polls || []).map((poll) => [poll.id, poll]));
            incomingPolls.forEach((poll) => map.set(poll.id, poll));
            next = {
              ...next,
              polls: [...map.values()].sort((a, b) => b.ts - a.ts),
            };
          }
          return {
            ...cur,
            chans: cur.chans.map((item) =>
              item.id === channelId ? next : item
            ),
          };
        });
      } finally {
        running = false;
      }
    };

    merge();
    const timer = window.setInterval(merge, 4500);
    const onVisible = () => {
      if (!document.hidden) merge();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [session?.id, ui.room]);

  // Enquetes da live: Realtime + polling mantêm chat e feed sincronizados.
  useEffect(() => {
    if (!isSupabaseEnabled || !session?.id || !ui.room) return undefined;
    const channelId = ui.room;
    let cancelled = false;
    let timer = null;
    const refresh = async () => {
      const rows = await remote.fetchChannelPolls(channelId);
      if (cancelled) return;
      const polls = (rows || []).map((row) => localPoll(row, session.id)).filter(Boolean);
      if (!polls.length) return;
      setData((cur) => {
        if (!cur) return cur;
        const channel = cur.chans.find((item) => item.id === channelId);
        if (!channel) return cur;
        const map = new Map((channel.polls || []).map((poll) => [poll.id, poll]));
        polls.forEach((poll) => map.set(poll.id, poll));
        return {
          ...cur,
          chans: cur.chans.map((item) =>
            item.id === channelId
              ? { ...item, polls: [...map.values()].sort((a, b) => b.ts - a.ts) }
              : item
          ),
        };
      });
    };
    // O Realtime cobre o uso normal. A verificação periódica garante que, quando
    // o prazo termina, os votos liberados apareçam mesmo sem novo evento.
    const interval = window.setInterval(refresh, 10_000);
    const unsubscribe = remote.subscribeChannelPolls(channelId, () => {
      if (timer) clearTimeout(timer);
      timer = window.setTimeout(refresh, 350);
    });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      window.clearInterval(interval);
      unsubscribe();
    };
  }, [session?.id, ui.room]);

  // Avisa uma única vez quando uma publicação programada libera resultados.
  // O que já foi avisado fica no navegador para não repetir a cada abertura.
  useEffect(() => {
    const key = `fluxo:results-notified:${session?.id || 'local'}`;
    try {
      const raw = window.localStorage.getItem(key);
      const list = raw ? JSON.parse(raw) : [];
      resultsNotifiedRef.current = new Set(Array.isArray(list) ? list : []);
    } catch {
      resultsNotifiedRef.current = new Set();
    }
    resultsHydratedRef.current = new Set();
  }, [session?.id]);

  useEffect(() => {
    const timer = setInterval(() => setResultsTick((value) => value + 1), 15_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!data) return;
    const now = Date.now();
    const key = `fluxo:results-notified:${session?.id || 'local'}`;
    const persist = () => {
      try {
        window.localStorage.setItem(
          key,
          JSON.stringify([...resultsNotifiedRef.current].slice(-500))
        );
      } catch {
        /* armazenamento indisponível */
      }
    };
    const due = [];
    (data.posts || []).forEach((post) => {
      const interactive = normalizeInteractive(post.interactive);
      const schedule = scheduleOf(interactive);
      if (!schedule || !resultsReleased(interactive, now)) return;
      if (resultsNotifiedRef.current.has(post.id)) return;
      // Janela de 24h: quem estava offline ainda recebe uma vez; publicações
      // muito antigas não geram enxurrada de avisos.
      if (!schedule.resultsAt || now - schedule.resultsAt > 24 * 3_600_000) {
        resultsNotifiedRef.current.add(post.id);
        persist();
        return;
      }
      const mine =
        post.by === 'me' ||
        (post.interactions || []).some(
          (row) => row.by === 'me' && row.kind !== 'view'
        );
      if (!mine) return;
      resultsNotifiedRef.current.add(post.id);
      persist();
      due.push(post);
    });
    due.slice(0, 2).forEach((post) => {
      const label = String(post.text || 'Sua experiência interativa').slice(0, 70);
      toast(`Resultados disponíveis: ${label}`);
      if (uiRef.current.settings?.notifications) {
        showDeviceNotification('Resultados disponíveis no Fluxo', {
          body: label,
          tag: `fluxo-results-${post.id}`,
        });
      }
    });
  }, [data, toast, session?.id, resultsTick]);

  // Quando um prazo termina, recarrega as participações liberadas. Isso mantém
  // o feed com os mesmos votos/respostas que o chat e libera os resultados sem
  // precisar recarregar a página. Antes do prazo o RLS não devolve nada.
  useEffect(() => {
    if (!isSupabaseEnabled || !session?.id || !data) return;
    const now = Date.now();
    const due = (data.posts || []).filter((post) => {
      const interactive = normalizeInteractive(post.interactive);
      if (!scheduleOf(interactive) || !resultsReleased(interactive, now)) return false;
      return !resultsHydratedRef.current.has(post.id);
    });
    if (!due.length) return;
    const ids = due.map((post) => post.id);
    ids.forEach((id) => resultsHydratedRef.current.add(id));
    let cancelled = false;
    (async () => {
      const rows = await remote.fetchPostInteractions(ids);
      if (cancelled || !rows?.length) return;
      const byPost = new Map();
      rows.forEach((row) => {
        if (!row?.post_id) return;
        if (!byPost.has(row.post_id)) byPost.set(row.post_id, []);
        byPost.get(row.post_id).push({
          id: row.id,
          by: row.user_id === session.id ? 'me' : row.user_id,
          kind: row.kind,
          optionId: row.option_id || null,
          text: row.text || '',
          ts: new Date(row.created_at || Date.now()).getTime(),
        });
      });
      setData((cur) => {
        if (!cur) return cur;
        return {
          ...cur,
          posts: cur.posts.map((post) => {
            const fetched = byPost.get(post.id);
            if (!fetched) return post;
            const map = new Map();
            (post.interactions || []).forEach((row) => map.set(row.by + ':' + row.kind, row));
            fetched.forEach((row) => map.set(row.by + ':' + row.kind, row));
            const interactions = [...map.values()].sort((a, b) => a.ts - b.ts);
            return {
              ...post,
              interactions,
              views: interactions.filter((row) => row.kind === 'view').length,
            };
          }),
        };
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [data, session?.id, resultsTick]);

  useEffect(() => {
    if (!isSupabaseEnabled || !session?.id) return undefined;
    return remote.subscribeChannels((payload) => {
      const row = payload.new || payload.old;
      if (!row?.id) return;
      const settings = uiRef.current.settings || DEFAULT_SETTINGS;
      const goingLive =
        payload.eventType === 'UPDATE' && payload.new?.is_live && !payload.old?.is_live;
      setData((cur) => {
        if (!cur) return cur;
        if (payload.eventType === 'DELETE') {
          return {
            ...cur,
            chans: cur.chans.filter((item) => item.id !== row.id),
          };
        }
        const exists = cur.chans.some((item) => item.id === row.id);
        if (!exists) {
          if (!row.is_live) return cur;
          const channel = {
            id: row.id,
            owner: row.owner_id === session.id ? 'me' : row.owner_id,
            name: row.name || 'Canal',
            desc: row.description || '',
            kind: row.kind || 'palco',
            followers: row.followers || 0,
            live: true,
            livekit: !!row.livekit,
            title: row.title || '',
            viewers: row.viewers || 0,
            joined: false,
            seed: row.seed || `${row.id}-palco`,
            polls: [],
            msgs: [],
          };
          return { ...cur, chans: [channel, ...cur.chans] };
        }
        return {
          ...cur,
          chans: cur.chans.map((item) =>
            item.id === row.id
              ? {
                  ...item,
                  live: !!row.is_live,
                  livekit: !!row.livekit,
                  title: row.title || item.title,
                  viewers: row.viewers ?? item.viewers,
                }
              : item
          ),
        };
      });
      if (!goingLive) return;
      if (payload.new.owner_id === session.id) return;
      const interested =
        (dataRef.current?.follows || []).includes(payload.new.owner_id) ||
        (settings.liveChannels || []).includes(row.id);
      if (!settings.notifications || !interested) return;
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      try {
        new Notification('Live no ar no Fluxo', {
          body: `${payload.new.title || payload.new.name || 'Um canal'} está ao vivo agora.`,
          icon: '/assets/icon-192.png',
          tag: `live-${row.id}`,
        });
      } catch {
        /* notification is best-effort */
      }
    });
  }, [session?.id]);

  // Sino de notificações: curtidas nos meus posts, comentários e seguidores.
  useEffect(() => {
    if (!isSupabaseEnabled || !session?.id) return undefined;
    return remote.subscribeNotifications(session.id, (kind, row) => {
      if (!row) return;
      const uidv = session.id;
      const ts = row.created_at ? new Date(row.created_at).getTime() : Date.now();
      const cur = dataRef.current;
      if (!cur) return;

      if (kind === 'comment-delete') {
        if (!row?.id) return;
        setData((state) =>
          state
            ? {
                ...state,
                posts: state.posts.map((post) => ({
                  ...post,
                  comments: (post.comments || []).filter(
                    (comment) => comment.id !== row.id
                  ),
                })),
              }
            : state
        );
        return;
      }

      let notification = null;
      const rowInteractive = normalizeInteractive(row.interactive);
      if (kind === 'interaction') {
        const post = cur.posts.find((p) => p.id === row.post_id);
        if (!post || !row.id) return;
        const entry = {
          id: row.id,
          by: row.user_id === uidv ? 'me' : row.user_id,
          kind: row.kind,
          optionId: row.option_id || null,
          text: row.text || '',
          ts,
        };
        setData((state) => {
          if (!state) return state;
          return {
            ...state,
            posts: state.posts.map((p) => {
              if (p.id !== row.post_id) return p;
              const kept = (p.interactions || []).filter(
                (item) =>
                  item.id !== entry.id &&
                  !(item.by === entry.by && item.kind === entry.kind)
              );
              return {
                ...p,
                interactions: [...kept, entry].sort((a, b) => a.ts - b.ts),
              };
            }),
          };
        });
        if (row.user_id !== uidv && post.by === 'me') {
          notification = {
            id: `interaction:${row.id}`,
            type: 'interaction',
            actorId: row.user_id,
            postId: row.post_id,
            interactionKind: row.kind,
            optionId: row.option_id || null,
            ts,
          };
        }
      } else if (kind === 'follow') {
        if (row.following_id === uidv && row.follower_id !== uidv) {
          notification = {
            id: `follow:${row.follower_id}`,
            type: 'follow',
            actorId: row.follower_id,
            ts,
          };
        }
      } else if (kind === 'like') {
        const post = cur.posts.find((p) => p.id === row.post_id);
        if (row.user_id !== uidv && post && post.by === 'me') {
          notification = {
            id: `like:${row.post_id}:${row.user_id}`,
            type: 'like',
            actorId: row.user_id,
            postId: row.post_id,
            emoji: row.emoji || '❤️',
            ts,
          };
        }
      } else if (kind === 'comment') {
        const post = cur.posts.find((p) => p.id === row.post_id);
        const mine = post?.by === 'me';
        if (row.author_id !== uidv && mine) {
          notification = {
            id: `comment:${row.id}`,
            type: 'comment',
            actorId: row.author_id,
            postId: row.post_id,
            text: row.text || '',
            ts,
          };
        } else if (
          row.author_id !== uidv &&
          !mine &&
          mentionsHandle(row.text, cur.me?.handle)
        ) {
          notification = {
            id: `mention:comment:${row.id}`,
            type: 'mention',
            source: 'comment',
            actorId: row.author_id,
            postId: row.post_id,
            ts,
          };
        }
      } else if (kind === 'post') {
        const interactive = rowInteractive;
        const challenged =
          interactive?.format === 'challenge' &&
          interactive.invited?.includes(uidv);
        const mentioned = mentionsHandle(row.text, cur.me?.handle);
        if (row.author_id === uidv || (!mentioned && !challenged)) {
          return;
        }
        notification = challenged
          ? {
              id: `challenge:${row.id}`,
              type: 'challenge',
              actorId: row.author_id,
              postId: row.id,
              ts,
            }
          : {
              id: `mention:post:${row.id}`,
              type: 'mention',
              source: 'post',
              actorId: row.author_id,
              postId: row.id,
              ts,
            };
      }
      if (!notification) return;

      setData((state) => {
        if (!state) return state;
        const notifications = state.notifications || [];
        if (notifications.some((n) => n.id === notification.id)) return state;
        const next = {
          ...state,
          notifications: [notification, ...notifications].slice(0, 80),
        };
        if (kind === 'follow') {
          const followers = state.followers || [];
          if (!followers.includes(row.follower_id)) {
            next.followers = [row.follower_id, ...followers];
          }
          next.me = { ...state.me, followers: (state.me.followers || 0) + 1 };
        } else if (kind === 'like' || kind === 'unlike') {
          const delta = kind === 'like' ? 1 : -1;
          next.posts = state.posts.map((p) => {
            if (p.id !== row.post_id) return p;
            const emoji = row.emoji || '❤️';
            const counts = { ...(p.reactionCounts || {}) };
            counts[emoji] = Math.max(0, (counts[emoji] || 0) + delta);
            return {
              ...p,
              likes: Math.max(0, (p.likes || 0) + delta),
              reactionCounts: counts,
            };
          });
        } else if (kind === 'comment') {
          const comment = { id: row.id, by: row.author_id, text: row.text || '', ts };
          next.posts = state.posts.map((p) =>
            p.id === row.post_id
              ? p.comments.some((c) => c.id === comment.id)
                ? p
                : { ...p, comments: [...p.comments, comment] }
              : p
          );
        } else if (kind === 'post') {
          // Convites e edições chegam por UPDATE. Se o post já está no feed,
          // atualiza o formato interativo (convites) e o texto.
          const existing = state.posts.find((p) => p.id === row.id);
          if (existing) {
            next.posts = state.posts.map((p) =>
              p.id === row.id
                ? {
                    ...p,
                    text: row.text ?? p.text,
                    commentsDisabled: !!row.comments_disabled,
                    interactive: rowInteractive
                      ? {
                          ...rowInteractive,
                          invited: rowInteractive.invited.map((id) =>
                            id === uidv ? 'me' : id
                          ),
                        }
                      : p.interactive,
                  }
                : p
            );
            return next;
          }
          // A publicação mencionada ainda não estava no feed: entra agora,
          // senão a notificação abriria um post inexistente.
          if (!state.posts.some((p) => p.id === row.id)) {
            const media = parseRemoteMedia(row.media);
            if (!media.length && row.media_url) {
              media.push({
                kind: row.kind === 'video' ? 'video' : 'photo',
                src: row.media_url,
                seed: row.seed || row.id,
                dur: row.dur,
              });
            }
            if (!media.length && (row.kind === 'photo' || row.kind === 'video')) {
              media.push({ kind: row.kind, seed: row.seed || row.id, dur: row.dur });
            }
            const isStory =
              row.kind === 'story' || String(row.seed || '').startsWith('story:');
            next.posts = [
              {
                id: row.id,
                by: row.author_id,
                ts,
                text: row.text || '',
                kind: isStory ? 'story' : row.kind || 'text',
                seed: row.seed || row.id,
                src: row.media_url || media[0]?.src,
                media,
                dur: row.dur ?? undefined,
                likes: row.likes || 0,
                liked: false,
                myReaction: null,
                reactionCounts: {},
                saved: false,
                commentsDisabled: !!row.comments_disabled,
                comments: [],
                interactive: rowInteractive
                  ? {
                      ...rowInteractive,
                      invited: rowInteractive.invited.map((id) =>
                        id === uidv ? 'me' : id
                      ),
                    }
                  : null,
                interactions: [],
              },
              ...state.posts,
            ];
          }
        }
        return next;
      });

      const settings = uiRef.current.settings || DEFAULT_SETTINGS;
      if (
        !settings.notifications ||
        typeof Notification === 'undefined' ||
        Notification.permission !== 'granted' ||
        !document.hidden
      ) {
        return;
      }
      const actor = (cur.users || {})[notification.actorId];
      const post = notification.postId
        ? cur.posts.find((p) => p.id === notification.postId)
        : null;
      try {
        new Notification('Fluxo', {
          body: `${actor?.name || 'Alguém'} ${notificationText(notification, post)}`,
          icon: '/assets/icon-192.png',
          tag: notification.id,
        });
      } catch {
        /* notification is best-effort */
      }
    });
  }, [session?.id]);

  // Guarda quando a pessoa viu as notificações pela última vez (por conta).
  useEffect(() => {
    if (!session?.id) return;
    const seen = Number(lsGet(notifSeenKey(session.id))) || 0;
    setUi((u) => (u.notifSeen === seen ? u : { ...u, notifSeen: seen }));
  }, [session?.id]);

  function markNotifsSeen() {
    const id = sessionRef.current?.id;
    const now = Date.now();
    if (id) lsSet(notifSeenKey(id), String(now));
    setUi((u) => ({ ...u, notifSeen: now }));
  }

  useEffect(() => {
    return () => {
      clearTimeout(toastTimer.current);
      Object.values(timers.current).forEach(clearTimeout);
    };
  }, []);

  async function submitAuth({ tab, name, email, password, confirm }) {
    const mail = email.trim().toLowerCase();
    if (tab === 'up' && name.trim().length < 2) return 'Digite seu nome.';
    if (!/^\S+@\S+\.\S+$/.test(mail)) return 'Digite um e-mail válido.';
    if (password.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
    if (tab === 'up' && password !== confirm) return 'As senhas não coincidem.';

    try {
      if (isSupabaseEnabled) {
        if (tab === 'up') {
          const res = await remote.signUp({ name: name.trim(), email: mail, password });
          if (res.session?.user) {
            await startSupabase(res.session.user);
            toast('Conta criada. Bem-vindo ao fluxo!');
          } else {
            toast('Conta criada! Confirme seu e-mail para entrar.');
          }
        } else {
          const res = await remote.signIn({ email: mail, password });
          await startSupabase(res.user);
        }
      } else {
        if (tab === 'up') {
          const accounts = demoAccounts();
          if (accounts[mail]) throw new Error('Este e-mail já tem conta. Use a aba Entrar.');
          accounts[mail] = { name: name.trim(), h: await sha256(password) };
          lsSet(ACCOUNTS_KEY, JSON.stringify(accounts));
          lsSet(SESSION_KEY, mail);
          startLocal(mail, name.trim());
        } else {
          const accounts = demoAccounts();
          if (!accounts[mail] || accounts[mail].h !== (await sha256(password))) {
            throw new Error('E-mail ou senha incorretos.');
          }
          lsSet(SESSION_KEY, mail);
          startLocal(mail, accounts[mail].name);
        }
      }
      return null;
    } catch (error) {
      return error.message || 'Não foi possível entrar.';
    }
  }

  async function google() {
    if (!isSupabaseEnabled) {
      startLocal('visitante.google@demo.fluxo', 'Visitante Google');
      toast('Modo demonstração: login com Google simulado.');
      return;
    }
    try {
      await remote.signInWithGoogle();
    } catch (error) {
      toast(error.message || 'Não foi possível entrar com Google.');
    }
  }

  async function requestPasswordReset(email) {
    const mail = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(mail)) return 'Digite um e-mail válido.';
    if (!isSupabaseEnabled) {
      return 'A recuperação de senha precisa do Supabase configurado.';
    }
    try {
      await remote.resetPassword(mail, remote.publicSiteUrl?.() || window.location.origin);
      return null;
    } catch (error) {
      return error.message || 'Não foi possível enviar o e-mail.';
    }
  }

  async function finishRecovery({ password, confirm }) {
    if (password.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
    if (password !== confirm) return 'As senhas não coincidem.';
    if (!isSupabaseEnabled) {
      return 'A recuperação de senha precisa do Supabase configurado.';
    }
    try {
      const result = await remote.updatePassword(password);
      recoveryRef.current = false;
      setRecovery(false);
      const user = result?.user || (await remote.getSession())?.user;
      if (user) await startSupabase(user);
      toast('Senha atualizada. Você já está conectado.');
      return null;
    } catch (error) {
      return error.message || 'Não foi possível atualizar a senha.';
    }
  }

  async function cancelRecovery() {
    recoveryRef.current = false;
    setRecovery(false);
    if (isSupabaseEnabled) await remote.signOut();
    setSession(null);
    setData(null);
    setReady(true);
    if (location.hash) history.replaceState(null, '', location.pathname);
  }

  function requestConfirm({ title, text, confirmLabel = 'Confirmar', tone = 'primary', action }) {
    setUi((u) => ({
      ...u,
      modal: { type: 'confirm', title, text, confirmLabel, tone, action },
    }));
  }

  async function logout() {
    if (liveChannelOfMine()) finishLive({ silent: true });
    if (isSupabaseEnabled) await remote.signOut();
    else lsSet(SESSION_KEY, '');
    lastUserId.current = null;
    Object.values(timers.current).forEach(clearTimeout);
    timers.current = {};
    setData(null);
    setSession(null);
    setUi((u) => ({
      ...u,
      chat: null,
      chatOpen: false,
      room: null,
      myLive: null,
      modal: null,
      typing: {},
    }));
    if (location.hash) history.replaceState(null, '', location.pathname);
  }

  async function deleteAccount(password) {
    const email = session?.email || data?.email || '';
    const typed = String(password || '');

    try {
      if (isSupabaseEnabled) {
        // Contas criadas com e-mail/senha pedem a senha atual. Contas só com
        // Google não têm senha, então exigem a confirmação digitada.
        const hasPassword = (
          session?.app_metadata?.providers ||
          (session?.identities || []).map((identity) => identity.provider)
        ).includes('email');
        if (hasPassword) {
          if (!typed) return 'Digite a senha da sua conta para confirmar.';
          try {
            await remote.verifyPassword(email, typed);
          } catch {
            return 'Senha incorreta. A conta não foi excluída.';
          }
        } else if (typed.trim().toUpperCase() !== 'EXCLUIR') {
          return 'Digite EXCLUIR para confirmar a exclusão.';
        }
        if (liveChannelOfMine()) finishLive({ silent: true });
        await remote.deleteAccount();
      } else {
        const accounts = demoAccounts();
        if (email && accounts[email]) {
          if (!typed || accounts[email].h !== (await sha256(typed))) {
            return 'Senha incorreta. A conta não foi excluída.';
          }
          delete accounts[email];
          lsSet(ACCOUNTS_KEY, JSON.stringify(accounts));
        }
        if (liveChannelOfMine()) finishLive({ silent: true });
        lsSet(SESSION_KEY, '');
      }
    } catch (error) {
      return error.message || 'Não foi possível excluir a conta.';
    }

    if (email) {
      try {
        localStorage.removeItem(cacheKey(email));
        localStorage.removeItem(notifSeenKey(session?.id || email));
      } catch {
        /* cache é melhor esforço */
      }
    }

    lastUserId.current = null;
    Object.values(timers.current).forEach(clearTimeout);
    timers.current = {};
    setData(null);
    setSession(null);
    setUi((u) => ({
      ...u,
      chat: null,
      chatOpen: false,
      room: null,
      myLive: null,
      modal: null,
      typing: {},
    }));
    if (location.hash) history.replaceState(null, '', location.pathname);
    toast('Sua conta foi excluída.');
    return null;
  }

  const go = (route, skipLiveGuard = false) => {
    const live = liveChannelOfMine();
    if (!skipLiveGuard && live && route !== 'conexoes') {
      requestConfirm({
        title: 'Encerrar a live?',
        text: 'Para sair do palco e navegar pelo Fluxo, a transmissão precisa ser encerrada.',
        confirmLabel: 'Encerrar e sair',
        tone: 'hot',
        action: () => {
          finishLive({ silent: true, id: live.id });
          go(route, true);
        },
      });
      return;
    }
    const target = '#' + route;
    if (location.hash !== target) location.hash = target;
    setUi((u) => ({ ...u, route, room: route === 'conexoes' ? null : u.room }));
    window.scrollTo(0, 0);
  };

  // Paginação do feed por cursor e compartilhamento comunidade -> feed.
  async function loadMoreFeed() {
    const { rows, nextCursor } = await remote.fetchFeedPage(feedCursorRef.current, 12);
    feedCursorRef.current = nextCursor;
    if (!rows.length) return { added: 0, nextCursor: null };
    const uidv = sessionRef.current?.id;
    const mapped = rows.map((row) => {
      const media = parseRemoteMedia(row.media);
      if (!media.length && row.media_url) {
        media.push({
          kind: ['video', 'audio'].includes(row.kind) ? row.kind : 'photo',
          src: row.media_url,
          seed: row.seed || row.id,
          dur: row.dur,
        });
      }
      if (!media.length && ['photo', 'video', 'audio'].includes(row.kind)) {
        media.push({ kind: row.kind, seed: row.seed || row.id, dur: row.dur });
      }
      return {
        id: row.id,
        by: uidv && row.author_id === uidv ? 'me' : row.author_id,
        ts: row.created_at ? Date.parse(row.created_at) : Date.now(),
        text: row.text || '',
        kind: row.kind || 'text',
        media,
        src: row.media_url || media[0]?.src || null,
        seed: row.seed || undefined,
        communityId: row.community_id || null,
        likes: 0,
        liked: false,
        myReaction: null,
        reactionCounts: {},
        saved: false,
        comments: [],
        interactions: [],
        interactive: normalizeInteractive(row.interactive),
        views: 0,
        viewed: false,
      };
    });
    setData((cur) => {
      const seen = new Set(cur.posts.map((post) => post.id));
      const fresh = mapped.filter((post) => !seen.has(post.id));
      return fresh.length ? { ...cur, posts: [...cur.posts, ...fresh] } : cur;
    });
    return { added: mapped.length, nextCursor };
  }

  function shareCommunityPostToFeed(postId) {
    const post = dataRef.current?.posts.find((item) => item.id === postId);
    if (!post?.communityId) return false;
    const community = dataRef.current?.comms?.find((item) => item.id === post.communityId);
    if (community?.private) {
      toast('Posts de comunidades privadas não podem ir para o feed.');
      return false;
    }
    const updated = { ...post, shareToFeed: true };
    setData((cur) => ({
      ...cur,
      posts: cur.posts.map((item) => (item.id === postId ? updated : item)),
    }));
    if (sessionRef.current?.id) remote.updatePost(updated);
    toast('Publicação compartilhada no feed');
    return true;
  }

  // Comunicados oficiais das comunidades.
  function addCommunityAnnouncement(communityId, fields) {
    const row = {
      id: uid(),
      community_id: communityId,
      author_id: sessionRef.current?.id || 'me',
      title: String(fields.title || '').trim().slice(0, 140),
      body: String(fields.body || '').trim().slice(0, 4000),
      image_url: fields.imageUrl || null,
      priority: Math.max(0, Math.min(10, Number(fields.priority) || 0)),
      pinned: !!fields.pinned,
      created_at: new Date().toISOString(),
    };
    if (!row.title) return;
    if (sessionRef.current?.id) remote.saveCommunityAnnouncement(row);
    setData((cur) => ({
      ...cur,
      commExtras: {
        ...(cur.commExtras || {}),
        announcements: [row, ...(cur.commExtras?.announcements || [])],
      },
    }));
  }

  function updateCommunityAnnouncement(id, patch) {
    if (sessionRef.current?.id) remote.updateCommunityAnnouncement(id, patch);
    setData((cur) => ({
      ...cur,
      commExtras: {
        ...(cur.commExtras || {}),
        announcements: (cur.commExtras?.announcements || []).map((row) =>
          row.id === id ? { ...row, ...patch } : row
        ),
      },
    }));
  }

  function removeCommunityAnnouncement(id) {
    if (sessionRef.current?.id) remote.removeCommunityAnnouncement(id);
    setData((cur) => ({
      ...cur,
      commExtras: {
        ...(cur.commExtras || {}),
        announcements: (cur.commExtras?.announcements || []).filter((row) => row.id !== id),
      },
    }));
  }

  function markAnnouncementRead(id) {
    const uidv = sessionRef.current?.id;
    if (uidv) remote.markCommunityAnnouncementRead(id, uidv);
    setData((cur) => ({
      ...cur,
      commExtras: {
        ...(cur.commExtras || {}),
        announcements: (cur.commExtras?.announcements || []).map((row) =>
          row.id === id ? { ...row, readCount: (row.readCount || 0) + 1 } : row
        ),
      },
    }));
  }

  // Notificações persistentes das comunidades (tabela community_notifications).
  function markCommunityNotificationsRead() {
    const rows = dataRef.current?.commExtras?.notifications || [];
    const unread = rows.filter((row) => !row.read);
    if (!unread.length) return;
    if (sessionRef.current?.id) {
      unread.forEach((row) => remote.setCommunityNotificationRead(row.id));
    }
    setData((cur) => ({
      ...cur,
      commExtras: {
        ...(cur.commExtras || {}),
        notifications: (cur.commExtras?.notifications || []).map((row) =>
          row.read ? row : { ...row, read: true }
        ),
      },
    }));
  }

  // Áudio enviado direto no chat da comunidade (barra de digitação).
  async function sendCommunityAudio(communityId, blob, meta = {}) {
    if (!communityId || !blob) return;
    const mime = meta.mime || blob.type || 'audio/webm';
    const name = `audio-${Date.now()}.${mime.includes('mp4') ? 'm4a' : 'webm'}`;
    const privateCommunity = !!dataRef.current?.comms?.find(
      (community) => community.id === communityId
    )?.private;
    let src = privateCommunity ? '' : URL.createObjectURL(blob);
    let storagePath = null;
    let storageBucket = null;
    if (sessionRef.current?.id) {
      const uploaded = await remote.uploadCommunityAudio(
        blob,
        communityId,
        sessionRef.current.id,
        mime,
        privateCommunity
      );
      if (!uploaded && privateCommunity) {
        throw new Error('Não foi possível enviar o áudio para esta comunidade.');
      }
      if (uploaded) {
        src = uploaded.url || '';
        storagePath = uploaded.path;
        storageBucket = uploaded.bucket;
      }
    }
    const media = [{
      kind: 'audio',
      src,
      name,
      duration: Math.max(1, Number(meta.duration) || 0),
      waves: Array.isArray(meta.waves) ? meta.waves.slice(0, 96) : [],
      storagePath,
      storageBucket,
    }];
    const post = {
      id: uid(),
      by: 'me',
      ts: Date.now(),
      text: '',
      kind: 'audio',
      media,
      src,
      likes: 0,
      liked: false,
      myReaction: null,
      reactionCounts: {},
      saved: false,
      commentsDisabled: false,
      comments: [],
      interactive: null,
      interactions: [],
      communityId,
    };
    setData((cur) => ({ ...cur, posts: [post, ...cur.posts] }));
    if (sessionRef.current?.id) remote.savePost(post, sessionRef.current.id);
  }

  async function attachMedia(files) {
    const list = Array.from(files || []).filter(Boolean);
    if (!list.length) return;
    const current = uiRef.current.draft.media || [];
    const room = MAX_POST_MEDIA - current.length;
    if (room <= 0) {
      toast(`Você pode anexar até ${MAX_POST_MEDIA} itens por publicação.`);
      return;
    }
    const selected = list.slice(0, room);
    const draftCommunityId = uiRef.current.draft?.communityId;
    const privateCommunity = !!dataRef.current?.comms?.find(
      (community) => community.id === draftCommunityId
    )?.private;
    let kept = 0;
    let cloudFailed = 0;
    try {
      for (const file of selected) {
        const kind = mediaKind(file);
        if (kind === 'video') {
          const seconds = await fileVideoDuration(file);
          if (seconds != null && seconds > MAX_VIDEO_SECONDS + 1) {
            toast(
              `“${file.name}” tem ${fmtDur(seconds)}. Os vídeos devem ter no máximo 3 minutos.`
            );
            continue;
          }
        }
        if (isSupabaseEnabled && file.size > MAX_MEDIA_BYTES) {
          toast(
            `“${file.name}” tem ${mb(file.size)}. O limite de envio é 50 MB${
              kind === 'video' ? ' — corte o vídeo ou reduza a qualidade' : ''
            }.`
          );
          continue;
        }
        let src =
          kind === 'photo'
            ? await fileToDataURL(file, 1080)
            : kind === 'audio'
              ? await fileToRawDataURL(file)
              : URL.createObjectURL(file);
        let storagePath = null;
        let storageBucket = null;
        if (isSupabaseEnabled && sessionRef.current?.id) {
          const uploaded = privateCommunity
            ? await remote.uploadPrivateMedia(file, draftCommunityId, sessionRef.current.id)
            : await remote.uploadMedia(file, sessionRef.current.id);
          if (uploaded?.private) {
            storagePath = uploaded.path;
            storageBucket = uploaded.bucket;
          } else if (uploaded) {
            src = uploaded;
          } else {
            cloudFailed += 1;
          }
        }
        setUi((u) => {
          const nextMedia = [
            ...(u.draft.media || []),
            { kind, src, name: file.name, ...(storagePath ? { storagePath, storageBucket } : {}) },
          ];
          return {
            ...u,
            draft: {
              ...u.draft,
              media: nextMedia,
              ...(u.draft.format === 'imageVote'
                ? { options: syncImageVoteOptions(nextMedia, u.draft.options) }
                : {}),
            },
          };
        });
        kept += 1;
      }
      if (kept && cloudFailed) {
        toast(
          'Não foi possível enviar ' +
            (cloudFailed > 1 ? `${cloudFailed} mídias` : 'uma mídia') +
            ' para a nuvem. Ela pode não aparecer depois de recarregar.'
        );
      }
      if (list.length > room) {
        toast(`Adicionamos ${kept} de ${list.length}. O limite é ${MAX_POST_MEDIA}.`);
      }
    } catch {
      toast('Não foi possível processar um dos arquivos.');
    }
  }

  function removeDraftMedia(index) {
    setUi((u) => {
      const nextMedia = (u.draft.media || []).filter((_, i) => i !== index);
      return {
        ...u,
        draft: {
          ...u.draft,
          media: nextMedia,
          ...(u.draft.format === 'imageVote'
            ? { options: syncImageVoteOptions(nextMedia, u.draft.options) }
            : {}),
        },
      };
    });
  }

  function reorderDraftMedia(from, to) {
    setUi((u) => {
      const list = [...(u.draft.media || [])];
      if (from < 0 || to < 0 || from >= list.length || to >= list.length) return u;
      const [item] = list.splice(from, 1);
      list.splice(to, 0, item);
      return {
        ...u,
        draft: {
          ...u.draft,
          media: list,
          ...(u.draft.format === 'imageVote'
            ? { options: syncImageVoteOptions(list, u.draft.options) }
            : {}),
        },
      };
    });
  }

  function setDraftFormat(format) {
    setUi((u) => {
      const media = u.draft.media || [];
      let options = optionsForFormat(format, media, u.draft.options);
      if (format === 'imageVote' && media.length < 2) {
        options = syncImageVoteOptions(media, u.draft.options);
      }
      return {
        ...u,
        draft: {
          ...u.draft,
          format,
          options,
          invited: format === 'challenge' ? u.draft.invited || [] : [],
          schedule: isSchedulable(format)
            ? u.draft.schedule || DEFAULT_SCHEDULE
            : DEFAULT_SCHEDULE,
          live: null,
        },
      };
    });
  }

  function setDraftSchedule(patch) {
    setUi((u) => ({
      ...u,
      draft: {
        ...u.draft,
        schedule: { ...DEFAULT_SCHEDULE, ...(u.draft.schedule || {}), ...(patch || {}) },
      },
    }));
  }

  function setDraftOption(index, label) {
    setUi((u) => ({
      ...u,
      draft: {
        ...u.draft,
        options: (u.draft.options || []).map((option, i) =>
          i === index ? { ...option, label } : option
        ),
      },
    }));
  }

  function addDraftOption() {
    setUi((u) => {
      const options = u.draft.options || [];
      if (options.length >= 6) return u;
      return {
        ...u,
        draft: { ...u.draft, options: [...options, { id: uid(), label: '' }] },
      };
    });
  }

  function removeDraftOption(index) {
    setUi((u) => {
      const options = u.draft.options || [];
      if (options.length <= 2) return u;
      return {
        ...u,
        draft: {
          ...u.draft,
          options: options.filter((_, i) => i !== index),
        },
      };
    });
  }

  function toggleDraftReaction(emoji) {
    setUi((u) => {
      const current = u.draft.reactions || DEFAULT_REACTIONS;
      const has = current.includes(emoji);
      const next = has ? current.filter((item) => item !== emoji) : [...current, emoji];
      if (!next.length) {
        toast('Mantenha ao menos uma reação disponível.');
        return u;
      }
      return {
        ...u,
        draft: { ...u.draft, reactions: next.slice(0, 8) },
      };
    });
  }

  function toggleDraftInvite(id) {
    setUi((u) => {
      const current = u.draft.invited || [];
      const has = current.includes(id);
      if (!has && current.length >= 20) {
        toast('Você pode convidar até 20 pessoas por desafio.');
        return u;
      }
      return {
        ...u,
        draft: {
          ...u.draft,
          invited: has ? current.filter((item) => item !== id) : [...current, id],
        },
      };
    });
  }

  // Aplica o resultado do editor de mídia ao item do rascunho: fotos vêm com
  // a edição "queimada" em um novo arquivo; vídeos (ou fotos que não puderam
  // ser queimadas) mantêm o objeto de edição para ser aplicado na exibição.
  async function applyMediaEdit(index, { file = null, edit = null } = {}) {
    const current = uiRef.current.draft.media || [];
    if (!current[index]) return;
    if (file) {
      try {
        let src = await fileToDataURL(file, 1080);
        if (isSupabaseEnabled && sessionRef.current?.id) {
          const uploaded = await remote.uploadMedia(file, sessionRef.current.id);
          if (uploaded) src = uploaded;
        }
        setUi((u) => ({
          ...u,
          draft: {
            ...u.draft,
            media: (u.draft.media || []).map((item, i) =>
              i === index ? { ...item, src, edit: null } : item
            ),
          },
        }));
        toast('Edição aplicada à mídia.');
      } catch {
        toast('Não foi possível aplicar a edição à mídia.');
      }
      return;
    }
    setUi((u) => ({
      ...u,
      draft: {
        ...u.draft,
        media: (u.draft.media || []).map((item, i) =>
          i === index ? { ...item, edit: edit || null } : item
        ),
      },
    }));
  }

  // Adiciona novas mídias a uma publicação já existente (mesmas regras do
  // rascunho: limite de itens, 3 minutos de vídeo e 50 MB por arquivo).
  async function attachPostMedia(postId, files) {
    const post = dataRef.current?.posts.find((p) => p.id === postId);
    if (!post) return;
    const current = mediaOf(post);
    const room = MAX_POST_MEDIA - current.length;
    if (room <= 0) {
      toast(`Você pode anexar até ${MAX_POST_MEDIA} itens por publicação.`);
      return;
    }
    const list = Array.from(files || []).filter(Boolean).slice(0, room);
    let added = [];
    let cloudFailed = 0;
    try {
      for (const file of list) {
        const kind = mediaKind(file);
        if (kind === 'video') {
          const seconds = await fileVideoDuration(file);
          if (seconds != null && seconds > MAX_VIDEO_SECONDS + 1) {
            toast(
              `“${file.name}” tem ${fmtDur(seconds)}. Os vídeos devem ter no máximo 3 minutos.`
            );
            continue;
          }
        }
        if (isSupabaseEnabled && file.size > MAX_MEDIA_BYTES) {
          toast(
            `“${file.name}” tem ${mb(file.size)}. O limite de envio é 50 MB${
              kind === 'video' ? ' — corte o vídeo ou reduza a qualidade' : ''
            }.`
          );
          continue;
        }
        let src =
          kind === 'photo'
            ? await fileToDataURL(file, 1080)
            : kind === 'audio'
              ? await fileToRawDataURL(file)
              : URL.createObjectURL(file);
        if (isSupabaseEnabled && sessionRef.current?.id) {
          const uploaded = await remote.uploadMedia(file, sessionRef.current.id);
          if (uploaded) src = uploaded;
          else cloudFailed += 1;
        }
        added.push({ kind, src, name: file.name });
      }
      if (added.length) {
        updatePost(
          postId,
          { media: [...current, ...added].slice(0, MAX_POST_MEDIA) },
          { keepModal: true, message: 'Mídia adicionada' }
        );
      }
      if (cloudFailed) {
        toast(
          'Não foi possível enviar ' +
            (cloudFailed > 1 ? `${cloudFailed} mídias` : 'uma mídia') +
            ' para a nuvem. Ela pode não aparecer depois de recarregar.'
        );
      }
      if (list.length < Array.from(files || []).length) {
        toast(`Adicionamos ${added.length}. O limite é ${MAX_POST_MEDIA}.`);
      }
    } catch {
      toast('Não foi possível processar um dos arquivos.');
    }
  }

  // Remove uma mídia da publicação. Sem mídia e sem texto, a publicação não
  // pode ficar vazia.
  function removePostMedia(postId, index) {
    const post = dataRef.current?.posts.find((p) => p.id === postId);
    if (!post) return;
    const media = mediaOf(post).filter((_, i) => i !== index);
    if (!media.length && !String(post.text || '').trim()) {
      toast('A publicação precisa ter texto ou ao menos uma mídia.');
      return;
    }
    updatePost(postId, { media }, { keepModal: true, message: 'Mídia removida' });
  }

  // Aplica o editor de mídia (ajustes, texto, desenho, giro) a um item de uma
  // publicação existente. Fotos vêm com a edição queimada; vídeos guardam o
  // objeto para ser aplicado na exibição.
  async function applyPostMediaEdit(postId, index, { file = null, edit = null } = {}) {
    const post = dataRef.current?.posts.find((p) => p.id === postId);
    const media = mediaOf(post);
    const item = media[index];
    if (!post || !item) return;
    let nextItem = { ...item, edit: edit || null };
    if (file) {
      try {
        let src = await fileToDataURL(file, 1080);
        if (isSupabaseEnabled && sessionRef.current?.id) {
          const uploaded = await remote.uploadMedia(file, sessionRef.current.id);
          if (uploaded) src = uploaded;
        }
        nextItem = { ...nextItem, src, edit: null };
      } catch {
        toast('Não foi possível aplicar a edição à mídia.');
        return;
      }
    }
    updatePost(
      postId,
      {
        media: media.map((entry, i) => (i === index ? nextItem : entry)),
      },
      { keepModal: true, message: 'Mídia atualizada' }
    );
  }

  function publish(text, communityIdOverride = null) {
    const draft = uiRef.current.draft;
    const trimmed = text.trim();
    const format = draft.format || 'classic';
    const communityId = communityIdOverride || draft.communityId || null;
    const privateCommunity = !!dataRef.current?.comms?.find(
      (community) => community.id === communityId
    )?.private;
    // Mídia privada não persiste data URL/object URL no banco: só a referência
    // ao Storage, resolvida em URL assinada na leitura.
    const media = (draft.media || []).map((item) =>
      privateCommunity && item.storageBucket === 'community-private'
        ? { ...item, src: '' }
        : item
    );
    const scheduled = draft.schedule?.mode === 'scheduled';
    if (scheduled && !isSchedulable(format)) {
      toast('Publicações programadas são para enquetes, votações e desafios.');
      return;
    }
    const schedule = scheduled ? scheduleFromDraft(draft.schedule) : null;
    const interactive = buildInteractive(format, draft, media);
    if (interactive && schedule) interactive.schedule = schedule;

    if (format === 'poll' && (interactive?.options?.length || 0) < 2) {
      toast('Escreva pelo menos duas alternativas para a enquete.');
      return;
    }
    if (format === 'imageVote' && media.length < 2) {
      toast('A votação com imagens precisa de pelo menos duas mídias.');
      return;
    }
    if (!trimmed && !media.length && format !== 'poll') {
      toast('Escreva algo ou adicione uma foto ou vídeo.');
      return;
    }
    const post = {
      id: uid(),
      by: 'me',
      ts: Date.now(),
      text: trimmed,
      kind: media[0]?.kind || 'text',
      media,
      src: media[0]?.src,
      seed: media[0]?.seed || undefined,
      likes: 0,
      liked: false,
      myReaction: null,
      reactionCounts: {},
      saved: false,
      commentsDisabled: false,
      comments: [],
      interactive: interactive || null,
      interactions: [],
      communityId,
    };
    setData((cur) => ({ ...cur, posts: [post, ...cur.posts] }));
    setUi((u) => ({
      ...u,
      draft: {
        text: '',
        media: [],
        format: 'classic',
        options: [],
        reactions: DEFAULT_REACTIONS,
        invited: [],
        communityId: null,
        schedule: DEFAULT_SCHEDULE,
        live: null,
      },
    }));
    if (sessionRef.current?.id) remote.savePost(post, sessionRef.current.id);
    toast(
      schedule
        ? `Programado — fecha em ${Math.round(schedule.durationMinutes / 60 * 10) / 10}h e libera os resultados automaticamente`
        : 'Publicado'
    );
  }

  function saveInteraction(postId, kind, fields = {}) {
    const post = dataRef.current?.posts.find((p) => p.id === postId);
    if (!post) return null;
    const interactive = normalizeInteractive(post.interactive);
    const schedule = scheduleOf(interactive);
    if (kind !== 'view') {
      if (isLocked(interactive)) {
        toast(
          resultsReleased(interactive)
            ? 'Esta experiência já foi encerrada.'
            : 'O prazo terminou. Aguarde a liberação dos resultados.'
        );
        return null;
      }
      if (schedule && myInteraction(post, kind)) {
        toast('Participação confirmada — não pode ser alterada depois de enviada.');
        return null;
      }
    }
    const uidv = sessionRef.current?.id || null;
    const id = uidv ? `${postId}:${uidv}:${kind}` : `local:${postId}:${kind}`;
    const entry = {
      id,
      by: 'me',
      kind,
      optionId: fields.optionId || null,
      text: fields.text || '',
      ts: Date.now(),
    };
    setData((cur) => ({
      ...cur,
      posts: cur.posts.map((p) => {
        if (p.id !== postId) return p;
        const kept = (p.interactions || []).filter(
          (row) => row.id !== id && !(row.by === 'me' && row.kind === kind)
        );
        const interactions = [...kept, entry].sort((a, b) => a.ts - b.ts);
        return {
          ...p,
          interactions,
          views: interactions.filter((row) => row.kind === 'view').length,
          viewed: kind === 'view' ? true : p.viewed,
        };
      }),
      chans:
        kind === 'vote' && interactive?.live?.pollId
          ? cur.chans.map((c) => ({
              ...c,
              polls: (c.polls || []).map((poll) =>
                poll.id === interactive.live.pollId
                  ? {
                      ...poll,
                      votes: [
                        ...(poll.votes || []).filter((vote) => vote.by !== 'me'),
                        { id: `${poll.id}:me`, by: 'me', optionId: entry.optionId, ts: entry.ts },
                      ],
                    }
                  : poll
              ),
            }))
          : cur.chans,
    }));
    if (uidv) {
      remote.saveInteraction({
        id,
        postId,
        userId: uidv,
        kind,
        optionId: entry.optionId,
        text: entry.text,
      });
      if (kind === 'vote' && interactive?.live?.pollId) {
        remote.castChannelPollVote({
          pollId: interactive.live.pollId,
          userId: uidv,
          optionId: entry.optionId,
        });
      }
    }
    return entry;
  }

  // Visualização de foto/vídeo: registra uma vez por pessoa e por publicação.
  function viewPost(postId) {
    const post = dataRef.current?.posts.find((p) => p.id === postId);
    if (!post) return;
    // O autor não conta a própria visualização.
    if (post.by === 'me') return;
    if (viewedRef.current.has(postId)) return;
    if ((post.interactions || []).some((row) => row.kind === 'view' && row.by === 'me')) {
      viewedRef.current.add(postId);
      return;
    }
    viewedRef.current.add(postId);
    saveInteraction(postId, 'view');
  }

  // Tempo de visualização real (em segundos), usado como sinal de ranking.
  function recordDwell(postId, seconds) {
    const value = Math.max(0, Math.floor(Number(seconds) || 0));
    if (!postId || value < 2) return;
    saveInteraction(postId, 'dwell', { text: String(Math.min(value, 600)) });
  }

  function votePost(postId, optionId) {
    const post = dataRef.current?.posts.find((p) => p.id === postId);
    const interactive = normalizeInteractive(post?.interactive);
    if (!interactive || !interactive.options.some((option) => option.id === optionId)) {
      toast('Essa alternativa não está mais disponível.');
      return;
    }
    const entry = saveInteraction(postId, 'vote', { optionId });
    if (!entry) return;
    toast(
      scheduleOf(interactive)
        ? 'Voto confirmado — não pode ser alterado depois de enviado.'
        : 'Voto registrado'
    );
  }

  function answerPost(postId, text) {
    const trimmed = String(text || '').trim();
    if (!trimmed) {
      toast('Escreva a sua resposta.');
      return;
    }
    const post = dataRef.current?.posts.find((p) => p.id === postId);
    const interactive = normalizeInteractive(post?.interactive);
    const entry = saveInteraction(postId, 'answer', { text: trimmed.slice(0, 280) });
    if (!entry) return;
    toast(
      scheduleOf(interactive)
        ? 'Resposta enviada — não pode ser alterada depois de enviar.'
        : 'Resposta enviada'
    );
  }

  function joinChallenge(postId) {
    const post = dataRef.current?.posts.find((p) => p.id === postId);
    const interactive = normalizeInteractive(post?.interactive);
    const entry = saveInteraction(postId, 'join');
    if (!entry) return;
    toast(
      scheduleOf(interactive)
        ? 'Participação confirmada — não pode ser desfeita.'
        : 'Você entrou no desafio'
    );
  }

  function inviteToChallenge(postId, ids) {
    const post = dataRef.current?.posts.find((p) => p.id === postId);
    if (!post || post.interactive?.format !== 'challenge') return;
    const list = (Array.isArray(ids) ? ids : [ids]).filter(Boolean);
    if (!list.length) return;
    const uidv = sessionRef.current?.id;
    const current = (post.interactive.invited || []).map((id) =>
      id === 'me' && uidv ? uidv : id
    );
    const next = [...new Set([...current, ...list])].slice(0, 20);
    if (next.length === current.length) return;
    updatePost(
      postId,
      { interactive: { ...post.interactive, invited: next } },
      { keepModal: true, message: 'Convite enviado' }
    );
  }

  function reactPost(id, emoji = '❤️') {
    const post = dataRef.current?.posts.find((p) => p.id === id);
    if (!post) return;
    const previous = post.myReaction;
    const next = previous === emoji ? null : emoji;
    setData((cur) => ({
      ...cur,
      posts: cur.posts.map((p) => {
        if (p.id !== id) return p;
        const counts = { ...(p.reactionCounts || {}) };
        if (previous) counts[previous] = Math.max(0, (counts[previous] || 0) - 1);
        if (next) counts[next] = (counts[next] || 0) + 1;
        return {
          ...p,
          myReaction: next,
          liked: !!next,
          likes: Math.max(0, (p.likes || 0) + (next ? 1 : 0) - (previous ? 1 : 0)),
          reactionCounts: counts,
        };
      }),
    }));
    if (sessionRef.current?.id) remote.setLike(id, sessionRef.current.id, next);
  }

  function toggleLike(id) {
    reactPost(id, '❤️');
  }

  function toggleComments(id) {
    setUi((u) => ({ ...u, open: { ...u.open, [id]: !u.open[id] } }));
  }

  function openClips(postId) {
    const videos = (dataRef.current?.posts || [])
      .filter((post) => mediaOf(post).some((item) => item.kind === 'video' && item.src))
      .sort((a, b) => b.ts - a.ts);
    const index = Math.max(0, videos.findIndex((post) => post.id === postId));
    setUi((u) => ({ ...u, clips: { index }, modal: null }));
  }

  function closeClips() {
    setUi((u) => ({ ...u, clips: null }));
  }

  function setClipIndex(index) {
    setUi((u) => (u.clips ? { ...u, clips: { ...u.clips, index } } : u));
  }

  function openPost(id) {
    setUi((u) => ({
      ...u,
      open: { ...u.open, [id]: false },
      modal: { type: 'post', id },
    }));
  }

  function openUser(id) {
    if (!id) return;
    if (id === 'me') {
      setUi((u) => ({ ...u, modal: null, route: 'perfil' }));
      if (location.hash !== '#perfil') location.hash = '#perfil';
      return;
    }
    setUi((u) => ({ ...u, modal: { type: 'user', id } }));
  }

  function reportPost(postId) {
    const post = dataRef.current?.posts.find((item) => item.id === postId);
    if (!post) return;
    requestConfirm({
      title: 'Denunciar publicação?',
      text: 'A denúncia é diferente de ocultar ou deixar de seguir. Ela será registrada para análise.',
      confirmLabel: 'Denunciar',
      tone: 'hot',
      action: () => {
        if (sessionRef.current?.id) {
          remote.reportPost(postId, sessionRef.current.id, 'conteudo');
        }
        feedFeedback(postId, 'notInterested');
        toast('Denúncia registrada. O conteúdo foi ocultado do seu feed.');
      },
    });
  }

  function addComment(postId, text, parentId = null) {
    const trimmed = String(text || '').trim();
    if (!trimmed) return;
    const post = dataRef.current?.posts.find((p) => p.id === postId);
    if (post?.commentsDisabled) {
      toast('Os comentários desta publicação estão desativados.');
      return;
    }
    const comment = {
      id: uid(), by: 'me', text: trimmed, ts: Date.now(),
      ...(parentId ? { parentId } : {}),
    };
    setData((cur) => ({
      ...cur,
      posts: cur.posts.map((p) =>
        p.id === postId ? { ...p, comments: [...(p.comments || []), comment] } : p
      ),
    }));
    if (sessionRef.current?.id) {
      remote.addComment(comment, postId, sessionRef.current.id, parentId);
    }
  }

  function reactComment(postId, commentId) {
    const uidv = sessionRef.current?.id;
    if (!uidv) return;
    const post = dataRef.current?.posts.find((p) => p.id === postId);
    const comment = post?.comments.find((c) => c.id === commentId);
    if (!comment) return;
    const like = !comment.liked;
    setData((cur) => ({
      ...cur,
      posts: cur.posts.map((p) => p.id === postId
        ? {
            ...p,
            comments: p.comments.map((c) => c.id === commentId
              ? { ...c, liked: like, likes: Math.max(0, (c.likes || 0) + (like ? 1 : -1)) }
              : c),
          }
        : p),
    }));
    remote.toggleCommentLikeRemote(commentId, uidv, like);
  }

  function deleteComment(postId, commentId) {
    if (!postId || !commentId) return;
    const post = dataRef.current?.posts.find((p) => p.id === postId);
    const comment = post?.comments?.find((c) => c.id === commentId);
    if (!comment || comment.by !== 'me') return;
    setData((cur) => ({
      ...cur,
      posts: cur.posts.map((p) =>
        p.id === postId
          ? { ...p, comments: (p.comments || []).filter((c) => c.id !== commentId) }
          : p
      ),
    }));
    remote.deleteComment(commentId);
    toast('Comentário apagado');
  }

  function openEditPost(id) {
    setUi((u) => ({ ...u, modal: { type: 'editpost', id } }));
  }

  function updatePost(id, fields, options = {}) {
    const post = dataRef.current?.posts.find((p) => p.id === id);
    if (!post) return;
    const updated = {
      ...post,
      ...fields,
      text: (fields.text ?? post.text).trim(),
      commentsDisabled:
        fields.commentsDisabled === undefined
          ? !!post.commentsDisabled
          : !!fields.commentsDisabled,
    };
    // Mantém os campos derivados coerentes quando a mídia muda.
    if (Array.isArray(fields.media)) {
      const first = fields.media[0];
      updated.src = first?.src;
      updated.kind = first?.kind || 'text';
      if (first?.seed) updated.seed = first.seed;
    }
    setData((cur) => ({
      ...cur,
      posts: cur.posts.map((p) => (p.id === id ? updated : p)),
    }));
    if (!options.keepModal) setUi((u) => ({ ...u, modal: null }));
    if (sessionRef.current?.id) remote.updatePost(updated);
    toast(options.message || 'Publicação atualizada');
  }

  function toggleCommentsDisabled(id) {
    const post = dataRef.current?.posts.find((p) => p.id === id);
    if (!post) return;
    const disabled = !post.commentsDisabled;
    updatePost(
      id,
      { commentsDisabled: disabled },
      {
        keepModal: true,
        message: disabled ? 'Comentários desativados' : 'Comentários ativados',
      }
    );
  }

  function deletePost(id) {
    requestConfirm({
      title: 'Excluir publicação?',
      text: 'Essa ação não pode ser desfeita. Os comentários e reações também sairão do seu perfil.',
      confirmLabel: 'Excluir',
      tone: 'hot',
      action: () => removePost(id),
    });
  }

  function removePost(id) {
    setData((cur) => ({ ...cur, posts: cur.posts.filter((p) => p.id !== id) }));
    setUi((u) => ({
      ...u,
      open: { ...u.open, [id]: false },
      modal: u.modal?.type === 'post' && u.modal.id === id ? null : u.modal,
    }));
    if (sessionRef.current?.id) remote.deletePost(id);
    toast('Publicação excluída');
  }

  function toggleSave(id) {
    const post = dataRef.current?.posts.find((p) => p.id === id);
    if (!post) return;
    const saved = !post.saved;
    setData((cur) => ({
      ...cur,
      posts: cur.posts.map((p) => (p.id === id ? { ...p, saved } : p)),
    }));
    if (sessionRef.current?.id) remote.setSave(id, sessionRef.current.id, saved);
    if (saved) saveInteraction(id, 'save');
    toast(saved ? 'Publicação salva' : 'Removida dos salvos');
  }

  function share() {
    const url = location.href.split('#')[0];
    try {
      navigator.clipboard.writeText(url).then(
        () => toast('Link copiado'),
        () => toast('Não foi possível copiar o link.')
      );
    } catch {
      toast('Não foi possível copiar o link.');
    }
  }

  async function sharePost(id) {
    const post = dataRef.current?.posts.find((p) => p.id === id);
    if (!post) return;
    const url = location.href.split('#')[0] + '#feed';
    const preview = mediaOf(post)[0];
    const text = post.text
      ? `${post.text}\n\nVeja no Fluxo:`
      : 'Veja esta publicação no Fluxo:';
    const result = await shareLink({
      title: 'Fluxo',
      text,
      url,
      image: preview?.src || null,
    });
    if (result === 'copied' || result === 'shared') {
      saveInteraction(id, 'share');
      toast(result === 'copied' ? 'Link da publicação copiado' : 'Publicação compartilhada');
    } else if (result === 'error') toast('Não foi possível compartilhar.');
  }

  function openSharePost(id) {
    setUi((u) => ({ ...u, modal: { type: 'share', id } }));
  }

  function openNewChat() {
    setUi((u) => ({ ...u, modal: { type: 'newchat' } }));
  }

  // Só é possível conversar com quem você segue e que também segue você.
  function canMessage(otherId) {
    const cur = dataRef.current;
    if (!cur || !otherId || otherId === 'me') return false;
    return (
      (cur.follows || []).includes(otherId) &&
      (cur.followers || []).includes(otherId)
    );
  }

  function ensureChat(otherId) {
    const cur = dataRef.current;
    if (!cur || !otherId) return null;
    const existing = cur.chats.find((chat) => chat.with === otherId);
    if (existing) return existing;
    if (!canMessage(otherId)) return null;
    const chat = { id: otherId, with: otherId, unread: 0, msgs: [] };
    setData((state) => ({ ...state, chats: [chat, ...state.chats] }));
    return chat;
  }

  function startChat(otherId) {
    if (!canMessage(otherId)) {
      toast('Vocês precisam se seguir para trocar mensagens.');
      return;
    }
    ensureChat(otherId);
    setUi((u) => ({
      ...u,
      modal: null,
      route: 'mensagens',
      chat: otherId,
      chatOpen: true,
    }));
    if (location.hash !== '#mensagens') location.hash = '#mensagens';
  }

  function sharePostTo(postId, userIds) {
    const post = dataRef.current?.posts.find((p) => p.id === postId);
    const targets = (userIds || []).filter((id) => canMessage(id));
    if (!post || !targets.length) return;
    const preview = mediaOf(post)[0];
    const attachment = {
      kind: 'post',
      postId: post.id,
      authorId: post.by,
      title: post.text ? String(post.text).slice(0, 90) : 'Publicação compartilhada',
      text: (post.text || '').slice(0, 180),
      media: preview?.src || preview?.seed || null,
      mediaSeed: preview?.seed || null,
      mediaKind: preview?.kind === 'video' ? 'video' : 'photo',
    };
    const ts = Date.now();
    targets.forEach((userId, index) => {
      ensureChat(userId);
      const message = {
        id: uid(),
        me: true,
        text: '',
        ts: ts + index,
        st: 'sent',
        attachment,
      };
      setData((cur) => ({
        ...cur,
        chats: cur.chats.map((chat) =>
          chat.with === userId ? { ...chat, msgs: [...chat.msgs, message] } : chat
        ),
      }));
      if (sessionRef.current?.id) {
        remote.sendDirectMessage(message, sessionRef.current.id, userId);
      }
    });
    if (uiRef.current.settings?.soundOnSend) playSentSound();
    setUi((u) => ({ ...u, modal: null }));
    toast(
      targets.length === 1
        ? 'Publicação compartilhada'
        : `Publicação compartilhada com ${targets.length} pessoas`
    );
  }

  function shareQuizResult(result = {}) {
    const mode = result.mode === 'insane' ? 'Insano' : 'Clássico';
    const total = Number(result.total) || 0;
    const correct = Number(result.correct) || 0;
    const lines = [
      `💣 Quiz BOOM! · ${result.categoryName || 'Todas as categorias'}`,
      `Modo ${mode} · ${Number(result.score) || 0} pontos`,
      `${correct}/${total} acertos · melhor combo ${Number(result.bestCombo) || 0}x`,
    ];
    if (result.medal) lines.push(`🏅 ${result.medal}`);
    lines.push('Jogue também no Fluxo!');
    publish(lines.join('\n'));
  }

  function shareQuizChallenge(result = {}, userIds = []) {
    const current = dataRef.current;
    const targets = (userIds || []).filter((id) => canMessage(id));
    if (!current) return null;
    const me = current.me || {};
    const challenge = {
      id: uid(),
      challengerId: sessionRef.current?.id || 'local',
      challengerName: me.name || 'Um amigo',
      category: result.categoryId || 'todas',
      categoryName: result.categoryName || 'Todas as categorias',
      mode: result.mode === 'insane' ? 'insane' : 'classic',
      size: Number(result.total) || 10,
      targetScore: Number(result.score) || 0,
      medal: result.medal || null,
      createdAt: Date.now(),
    };
    saveQuizChallenge(challenge, Boolean(sessionRef.current?.id));
    const link = quizChallengeLink(challenge.id, {
      mode: challenge.mode,
      categoryName: challenge.categoryName,
      challengerName: challenge.challengerName,
      targetScore: challenge.targetScore,
    });
    const attachment = {
      kind: 'quiz',
      challengeId: challenge.id,
      challengerName: challenge.challengerName,
      categoryName: challenge.categoryName,
      mode: challenge.mode,
      size: challenge.size,
      targetScore: challenge.targetScore,
      link,
    };
    const ts = Date.now();
    targets.forEach((userId, index) => {
      ensureChat(userId);
      const message = {
        id: uid(),
        me: true,
        text: '',
        ts: ts + index,
        st: 'sent',
        attachment,
      };
      setData((cur) => ({
        ...cur,
        chats: cur.chats.map((chat) =>
          chat.with === userId ? { ...chat, msgs: [...chat.msgs, message] } : chat
        ),
      }));
      if (sessionRef.current?.id) {
        remote.sendDirectMessage(message, sessionRef.current.id, userId);
      }
    });
    if (targets.length) {
      toast(
        targets.length === 1
          ? 'Desafio enviado'
          : `Desafio enviado para ${targets.length} amigos`
      );
    }
    return { challenge, link };
  }

  async function shareQuizInvite(challenge) {
    if (!challenge) return;
    const link = challenge.link || quizChallengeLink(challenge.id);
    const image = quizCardImage(challenge);
    const meta = challenge.targetScore
      ? 'Meta: ' + Number(challenge.targetScore).toLocaleString('pt-BR') + ' pontos. '
      : '';
    const text =
      '💣 ' + (challenge.challengerName || 'Um amigo') +
      ' te desafiou no Quiz BOOM! ' + meta + 'Aceite no Fluxo:';
    const result = await shareLink({
      title: 'Desafio do Quiz BOOM · Fluxo',
      text,
      url: link,
      image,
      imageName: 'quiz-boom.png',
    });
    if (result === 'copied') toast('Link do desafio copiado');
    else if (result === 'shared') toast('Desafio compartilhado');
    else if (result === 'error') toast('Não foi possível compartilhar.');
    return result;
  }

  async function shareChannel(id) {
    const channel = dataRef.current?.chans.find((c) => c.id === id);
    if (!channel) return;
    const url =
      location.href.split('#')[0] + '#conexoes/' + encodeURIComponent(id);
    const text = channel.live
      ? `Assista à live "${channel.title || channel.name}" no Fluxo:`
      : `Participe do canal "${channel.name}" no Fluxo:`;
    const result = await shareLink({ title: 'Fluxo', text, url });
    if (result === 'copied') toast('Link do canal copiado');
    else if (result === 'shared') toast('Canal compartilhado');
    else if (result === 'error') toast('Não foi possível compartilhar.');
  }

  // -------------------------------------------------------------------------
  // Arena do Caos (Conexões → Jogos Online)
  // -------------------------------------------------------------------------

  function openArena(code = '') {
    const clean = String(code || '').trim().toUpperCase();
    const hash = clean
      ? `#conexoes/arena/${encodeURIComponent(clean)}`
      : '#conexoes/arena';
    setUi((u) => ({
      ...u,
      route: 'conexoes',
      room: null,
      quizOpen: false,
      enigmasOpen: false,
      defesaOpen: false,
      arenaCode: clean,
    }));
    if (location.hash !== hash) location.hash = hash;
  }

  function openArenaCode(code) {
    openArena(code);
  }

  function closeArena() {
    setUi((u) => ({ ...u, arenaCode: null }));
    if (location.hash !== '#conexoes') location.hash = '#conexoes';
  }

  function openQuiz() {
    setUi((u) => ({
      ...u,
      route: 'conexoes',
      room: null,
      arenaCode: null,
      quizOpen: true,
      quizChallenge: null,
      enigmasOpen: false,
      defesaOpen: false,
    }));
    if (location.hash !== '#conexoes/quiz') location.hash = '#conexoes/quiz';
  }

  function openQuizChallenge(id) {
    if (!id) return;
    setUi((u) => ({
      ...u,
      route: 'conexoes',
      room: null,
      arenaCode: null,
      quizOpen: true,
      quizChallenge: id,
    }));
    if (location.hash !== '#conexoes/quiz') location.hash = '#conexoes/quiz';
  }

  function closeQuiz() {
    setUi((u) => ({ ...u, quizOpen: false, quizChallenge: null, quizInvite: null }));
    if (location.hash !== '#conexoes') location.hash = '#conexoes';
  }

  function openEnigmas() {
    setUi((u) => ({
      ...u,
      route: 'conexoes',
      room: null,
      arenaCode: null,
      quizOpen: false,
      enigmasOpen: true,
      defesaOpen: false,
    }));
    if (location.hash !== '#conexoes/enigmas') location.hash = '#conexoes/enigmas';
  }

  function closeEnigmas() {
    setUi((u) => ({ ...u, enigmasOpen: false }));
    if (location.hash !== '#conexoes') location.hash = '#conexoes';
  }

  function openDefesa() {
    setUi((u) => ({
      ...u,
      route: 'conexoes',
      room: null,
      arenaCode: null,
      quizOpen: false,
      enigmasOpen: false,
      defesaOpen: true,
    }));
    if (location.hash !== '#conexoes/defesa') location.hash = '#conexoes/defesa';
  }

  function closeDefesa() {
    setUi((u) => ({ ...u, defesaOpen: false }));
    if (location.hash !== '#conexoes') location.hash = '#conexoes';
  }

  function recordEnigmaScore({ level, score, hints }) {
    const userId = sessionRef.current?.id;
    if (!userId) return Promise.resolve(false);
    return remote.saveEnigmaScore({
      userId,
      name: dataRef.current?.me?.name || 'Jogador',
      level,
      score,
      hints,
    });
  }

  function inviteToArena(userId, code) {
    const clean = String(code || '').trim().toUpperCase();
    if (!userId || !clean) return false;
    const chat = ensureChat(userId);
    if (!chat) return false;
    const meName = dataRef.current?.me?.name || 'Um amigo';
    sendMessageTo(
      chat.id,
      `${meName} te chamou para a Arena do Caos!`,
      {
        kind: 'arena',
        code: clean,
        title: 'Arena do Caos',
        host: meName,
      }
    );
    toast('Convite enviado no chat');
    return true;
  }

  function shareArenaResult(result = {}) {
    const placement = Number(result.placement) || 0;
    const total = Number(result.total) || 0;
    const kills = Number(result.kills) || 0;
    const damage = Number(result.damage) || 0;
    const winner = result.winnerName || '';
    const title =
      placement === 1
        ? '🏆 Venci a Arena do Caos!'
        : placement > 0
          ? `🎮 Fiquei em ${placement}º na Arena do Caos`
          : '🎮 Joguei a Arena do Caos';
    const lines = [title];
    if (kills || damage) {
      lines.push(`${kills} eliminação${kills === 1 ? '' : 'ões'} • ${damage} de dano`);
    }
    if (total) lines.push(`${total} jogadores na partida`);
    if (placement !== 1 && winner) lines.push(`Campeão: ${winner}`);
    if (result.code) lines.push(`Sala ${result.code}`);
    const post = {
      id: uid(),
      by: 'me',
      ts: Date.now(),
      text: lines.join('\n'),
      kind: 'text',
      media: [],
      src: undefined,
      seed: undefined,
      likes: 0,
      liked: false,
      myReaction: null,
      reactionCounts: {},
      saved: false,
      commentsDisabled: false,
      comments: [],
      interactive: null,
      interactions: [],
      communityId: null,
    };
    setData((cur) => ({ ...cur, posts: [post, ...cur.posts] }));
    if (sessionRef.current?.id) remote.savePost(post, sessionRef.current.id);
    toast('Resultado compartilhado no Feed');
    return post.id;
  }

  function follow(id) {
    const cur = dataRef.current;
    if (!cur) return;
    const following = cur.follows.includes(id);
    const users = { ...cur.users };
    if (users[id]) {
      users[id] = {
        ...users[id],
        followers: Math.max(0, users[id].followers + (following ? -1 : 1)),
      };
    }
    setData({
      ...cur,
      follows: following ? cur.follows.filter((x) => x !== id) : [...cur.follows, id],
      users,
    });
    if (sessionRef.current?.id) remote.setFollow(sessionRef.current.id, id, !following);
    toast(following ? 'Você deixou de seguir ' + (users[id]?.name || id) : 'Seguindo ' + (users[id]?.name || id));
  }

  function saveProfile(fields) {
    const newMe = { ...dataRef.current.me, ...fields };
    setData((cur) => ({ ...cur, me: newMe }));
    if (sessionRef.current?.id) remote.saveProfile(newMe, sessionRef.current.id);
    setUi((u) => ({ ...u, modal: null }));
    toast('Perfil atualizado');
  }

  function pickCover(value) {
    const newMe = { ...dataRef.current.me, cover: { k: 'art', v: value } };
    setData((cur) => ({ ...cur, me: newMe }));
    if (sessionRef.current?.id) remote.saveProfile(newMe, sessionRef.current.id);
  }

  async function uploadAvatar(file) {
    if (!file) return;
    try {
      let src = await fileToDataURL(file, 512);
      if (isSupabaseEnabled && sessionRef.current?.id) {
        const uploaded = await remote.uploadMedia(file, sessionRef.current.id);
        if (uploaded) src = uploaded;
      }
      const newMe = { ...dataRef.current.me, avatar: src };
      setData((cur) => ({ ...cur, me: newMe }));
      if (sessionRef.current?.id) remote.saveProfile(newMe, sessionRef.current.id);
      toast('Foto de perfil atualizada');
    } catch {
      toast('Não foi possível usar essa imagem.');
    }
  }

  async function uploadCover(file) {
    if (!file) return;
    try {
      let src = await fileToDataURL(file, 1400);
      if (isSupabaseEnabled && sessionRef.current?.id) {
        const uploaded = await remote.uploadMedia(file, sessionRef.current.id);
        if (uploaded) src = uploaded;
      }
      const newMe = { ...dataRef.current.me, cover: { k: 'img', v: src } };
      setData((cur) => ({ ...cur, me: newMe }));
      if (sessionRef.current?.id) remote.saveProfile(newMe, sessionRef.current.id);
      toast('Capa atualizada');
    } catch {
      toast('Não foi possível usar essa imagem.');
    }
  }

  function addScrap(text) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const scrap = { id: uid(), by: 'me', text: trimmed, ts: Date.now() };
    setData((cur) => ({
      ...cur,
      me: { ...cur.me, scraps: [scrap, ...cur.me.scraps] },
    }));
    if (sessionRef.current?.id) remote.addScrap(scrap, sessionRef.current.id, sessionRef.current.id);
  }

  function openComm(id) {
    const hash = `#comunidade/${encodeURIComponent(id)}`;
    if (location.hash !== hash) location.hash = hash;
    setUi((u) => ({ ...u, route: 'comunidade', commId: id, modal: null, room: null }));
    window.scrollTo(0, 0);
  }

  function closeModal() {
    setUi((u) => ({ ...u, modal: null }));
  }

  function toggleComm(id) {
    const community = dataRef.current?.comms.find((c) => c.id === id);
    if (!community) return;
    if (community.pending) {
      cancelJoinComm(id);
      return;
    }
    if (community.joined) {
      requestConfirm({
        title: 'Sair da comunidade?',
        text: `Você deixará de acompanhar ${community.name}. Pode entrar de novo quando quiser.`,
        confirmLabel: 'Sair',
        tone: 'hot',
        action: () => applyToggleComm(id),
      });
      return;
    }
    if (community.private) {
      requestJoinComm(id);
      return;
    }
    applyToggleComm(id);
  }

  function requestJoinComm(id) {
    const community = dataRef.current?.comms.find((c) => c.id === id);
    if (!community) return;
    setData((cur) => ({
      ...cur,
      comms: cur.comms.map((c) => (c.id === id ? { ...c, pending: true } : c)),
    }));
    if (sessionRef.current?.id) {
      remote.requestCommunityJoin(id, sessionRef.current.id);
    }
    toast(`Solicitação enviada para ${community.name}`);
  }

  function cancelJoinComm(id) {
    setData((cur) => ({
      ...cur,
      comms: cur.comms.map((c) => (c.id === id ? { ...c, pending: false } : c)),
    }));
    if (sessionRef.current?.id) remote.cancelCommunityJoin(id, sessionRef.current.id);
    toast('Solicitação cancelada');
  }

  function approveJoin(commId, userId) {
    setData((cur) => ({
      ...cur,
      comms: cur.comms.map((c) =>
        c.id === commId
          ? {
              ...c,
              requests: c.requests.filter((item) => item.userId !== userId),
              members: [...new Set([...(c.members || []), userId])],
              subs: c.subs + 1,
            }
          : c
      ),
    }));
    if (sessionRef.current?.id) {
      remote.setJoinRequestStatus(commId, userId, 'accepted');
      remote.setCommunityMembership(commId, userId, true);
    }
    toast('Participante aprovado');
  }

  function rejectJoin(commId, userId) {
    setData((cur) => ({
      ...cur,
      comms: cur.comms.map((c) =>
        c.id === commId
          ? { ...c, requests: c.requests.filter((item) => item.userId !== userId) }
          : c
      ),
    }));
    if (sessionRef.current?.id) {
      remote.setJoinRequestStatus(commId, userId, 'rejected');
    }
    toast('Solicitação recusada');
  }

  function inviteToComm(commId, userId) {
    const community = dataRef.current?.comms.find((c) => c.id === commId);
    if (!community || !userId || userId === 'me') return;
    const invite = {
      id: uid(),
      communityId: commId,
      inviterId: 'me',
      inviteeId: userId,
      status: 'pending',
    };
    if (sessionRef.current?.id) {
      remote.saveCommunityInvite(invite, sessionRef.current.id);
    }
    toast(`Convite enviado para ${dataRef.current.users[userId]?.name || 'a pessoa'}`);
  }

  function respondCommunityInvite(commId, inviteId, accept) {
    const community = dataRef.current?.comms.find((c) => c.id === commId);
    if (!community) return;
    if (inviteId) remote.setCommunityInviteStatus(inviteId, accept ? 'accepted' : 'declined');
    if (!accept) {
      setData((cur) => ({
        ...cur,
        comms: cur.comms.map((c) =>
          c.id === commId ? { ...c, invited: null } : c
        ),
      }));
      toast('Convite recusado');
      return;
    }
    setData((cur) => ({
      ...cur,
      comms: cur.comms.map((c) =>
        c.id === commId
          ? {
              ...c,
              invited: null,
              joined: true,
              subs: c.subs + 1,
              members: [...new Set([...(c.members || []), 'me'])],
            }
          : c
      ),
    }));
    if (sessionRef.current?.id) {
      remote.setCommunityMembership(commId, sessionRef.current.id, true);
    }
    toast(`Bem-vindo a ${community.name}`);
  }

  function linkCommChannel(commId, chanId) {
    if (!chanId) return;
    setData((cur) => ({
      ...cur,
      comms: cur.comms.map((c) =>
        c.id === commId
          ? { ...c, channelIds: [...new Set([...(c.channelIds || []), chanId])] }
          : c
      ),
    }));
    remote.saveCommunityChannel(commId, chanId);
    toast('Canal vinculado à comunidade');
  }

  function unlinkCommChannel(commId, chanId) {
    setData((cur) => ({
      ...cur,
      comms: cur.comms.map((c) =>
        c.id === commId
          ? { ...c, channelIds: (c.channelIds || []).filter((id) => id !== chanId) }
          : c
      ),
    }));
    remote.deleteCommunityChannel(commId, chanId);
    toast('Canal desvinculado');
  }

  async function uploadCommunityArt(commId, kind, file) {
    if (!file) return;
    try {
      let src = await fileToDataURL(file, kind === 'icon' ? 320 : 1400);
      if (sessionRef.current?.id) {
        const uploaded = await remote.uploadMedia(file, sessionRef.current.id);
        if (uploaded) src = uploaded;
      }
      const community = dataRef.current?.comms.find((c) => c.id === commId);
      if (!community) return;
      const updated = {
        ...community,
        iconUrl: kind === 'icon' ? src : community.iconUrl,
        coverUrl: kind === 'cover' ? src : community.coverUrl,
      };
      setData((cur) => ({
        ...cur,
        comms: cur.comms.map((c) => (c.id === commId ? updated : c)),
      }));
      remote.updateCommunity(updated);
      toast(kind === 'icon' ? 'Ícone atualizado' : 'Capa atualizada');
    } catch {
      toast('Não foi possível usar essa imagem.');
    }
  }

  function applyToggleComm(id) {
    const community = dataRef.current?.comms.find((c) => c.id === id);
    if (!community) return;
    const joined = !community.joined;
    const updated = {
      ...community,
      joined,
      pending: false,
      subs: Math.max(0, community.subs + (joined ? 1 : -1)),
      members: joined
        ? [...new Set([...(community.members || []), 'me'])]
        : (community.members || []).filter((member) => member !== 'me'),
    };
    if (!joined && community.mods.includes('me')) {
      updated.mods = community.mods.filter((m) => m !== 'me');
    }
    setData((cur) => ({
      ...cur,
      comms: cur.comms.map((c) => (c.id === id ? updated : c)),
    }));
    if (sessionRef.current?.id) {
      remote.setCommunityMembership(id, sessionRef.current.id, joined);
    }
    toast(joined ? 'Você entrou em ' + community.name : 'Você saiu de ' + community.name);
  }

  async function createComm({
    name,
    cat,
    desc,
    rules,
    seed,
    private: isPrivate,
    iconUrl,
    coverUrl,
    iconFile,
    coverFile,
  }) {
    let finalIcon = iconUrl || null;
    let finalCover = coverUrl || null;
    if (sessionRef.current?.id) {
      if (iconFile) {
        const uploaded = await remote.uploadMedia(iconFile, sessionRef.current.id);
        if (uploaded) finalIcon = uploaded;
      }
      if (coverFile) {
        const uploaded = await remote.uploadMedia(coverFile, sessionRef.current.id);
        if (uploaded) finalCover = uploaded;
      }
    }
    const community = {
      id: uid(),
      name,
      cat,
      desc: desc || 'Um novo fluxo para conversar.',
      subs: 1,
      owner: 'me',
      mods: ['me'],
      joined: true,
      pending: false,
      invited: null,
      private: !!isPrivate,
      iconUrl: finalIcon,
      coverUrl: finalCover,
      seed: (seed || COVERS[0]) + '-c',
      rules: rules?.length ? rules : ['Respeite todo mundo no fluxo.'],
      members: ['me'],
      requests: [],
      channelIds: [],
      topics: [],
    };
    setData((cur) => ({ ...cur, comms: [community, ...cur.comms] }));
    const hash = `#comunidade/${encodeURIComponent(community.id)}`;
    if (location.hash !== hash) location.hash = hash;
    setUi((u) => ({
      ...u,
      profTab: 'comms',
      route: 'comunidade',
      commId: community.id,
      modal: null,
      room: null,
    }));
    if (sessionRef.current?.id) remote.saveCommunity(community, sessionRef.current.id);
    toast('Comunidade criada');
  }

  function openNewCommFromTopic(term) {
    setUi((u) => ({
      ...u,
      modal: { type: 'newcomm' },
      commDraft: { name: term ? `Comunidade de ${term}` : '' },
    }));
  }

  function addModerator(commId, userId) {
    const community = dataRef.current?.comms.find((c) => c.id === commId);
    if (!community || community.mods.includes(userId)) return;
    setData((cur) => ({
      ...cur,
      comms: cur.comms.map((c) =>
        c.id === commId ? { ...c, mods: [...c.mods, userId] } : c
      ),
    }));
    if (sessionRef.current?.id) {
      remote.setCommunityMembership(commId, userId, true, 'moderator');
    }
    toast((dataRef.current.users[userId]?.name || userId) + ' agora é moderador');
  }

  function removeModerator(commId, userId) {
    const person = dataRef.current?.users[userId];
    requestConfirm({
      title: 'Remover moderador?',
      text: `${person?.name || 'Essa pessoa'} continuará na comunidade, mas perderá os poderes de moderação.`,
      confirmLabel: 'Remover',
      tone: 'hot',
      action: () => applyRemoveModerator(commId, userId),
    });
  }

  function applyRemoveModerator(commId, userId) {
    setData((cur) => ({
      ...cur,
      comms: cur.comms.map((c) =>
        c.id === commId ? { ...c, mods: c.mods.filter((m) => m !== userId) } : c
      ),
    }));
    if (sessionRef.current?.id) {
      remote.setCommunityMembership(commId, userId, true, 'member');
    }
    toast('Moderador removido');
  }

  function addTopic(commId, title) {
    const trimmed = title.trim();
    if (!trimmed) return;
    const topic = { id: uid(), by: 'me', title: trimmed, replies: 0, ts: Date.now() };
    setData((cur) => ({
      ...cur,
      comms: cur.comms.map((c) =>
        c.id === commId ? { ...c, topics: [topic, ...c.topics] } : c
      ),
    }));
    if (sessionRef.current?.id) remote.saveTopic(topic, commId, sessionRef.current.id);
  }

  function deleteTopic(commId, topicId) {
    requestConfirm({
      title: 'Remover tópico?',
      text: 'O tópico será apagado para todas as pessoas da comunidade.',
      confirmLabel: 'Remover',
      tone: 'hot',
      action: () => applyDeleteTopic(commId, topicId),
    });
  }

  function applyDeleteTopic(commId, topicId) {
    setData((cur) => ({
      ...cur,
      comms: cur.comms.map((c) =>
        c.id === commId ? { ...c, topics: c.topics.filter((t) => t.id !== topicId) } : c
      ),
    }));
    if (sessionRef.current?.id) remote.deleteTopic(topicId);
    toast('Tópico removido');
  }

  function toggleEmojiFavoriteAction(emoji) {
    const uidv = sessionRef.current?.id;
    const current = dataRef.current?.emojiFavorites || [];
    const favorite = !current.includes(emoji);
    setData((cur) => ({
      ...cur,
      emojiFavorites: favorite
        ? [...(cur.emojiFavorites || []), emoji]
        : (cur.emojiFavorites || []).filter((e) => e !== emoji),
    }));
    if (uidv) remote.toggleEmojiFavorite(uidv, emoji, favorite);
  }

  // --- Comunidades v2 ---
  function addCommunityGalleryItem(entry) {
    const row = { id: uid(), author_id: sessionRef.current?.id, created_at: new Date().toISOString(), ...entry };
    setData((cur) => ({
      ...cur,
      commExtras: { ...cur.commExtras, gallery: [row, ...(cur.commExtras?.gallery || [])] },
    }));
    if (sessionRef.current?.id) remote.addCommunityGallery(row);
    toast('Mídia adicionada à galeria');
  }

  function removeCommunityGalleryItem(id) {
    setData((cur) => ({
      ...cur,
      commExtras: { ...cur.commExtras, gallery: (cur.commExtras?.gallery || []).filter((g) => g.id !== id) },
    }));
    remote.removeCommunityGallery(id);
    toast('Mídia removida');
  }

  function addCommunityEventEntry(entry) {
    const row = { id: uid(), created_by: sessionRef.current?.id, created_at: new Date().toISOString(), ...entry };
    setData((cur) => ({
      ...cur,
      commExtras: { ...cur.commExtras, events: [row, ...(cur.commExtras?.events || [])] },
    }));
    if (sessionRef.current?.id) remote.addCommunityEvent(row);
    toast('Evento criado');
  }

  function editCommunityEventEntry(id, patch) {
    setData((cur) => ({
      ...cur,
      commExtras: { ...cur.commExtras, events: (cur.commExtras?.events || []).map((e) => e.id === id ? { ...e, ...patch } : e) },
    }));
    remote.updateCommunityEvent(id, patch);
    toast('Evento atualizado');
  }

  function removeCommunityEventEntry(id) {
    setData((cur) => ({
      ...cur,
      commExtras: { ...cur.commExtras, events: (cur.commExtras?.events || []).filter((e) => e.id !== id) },
    }));
    remote.removeCommunityEvent(id);
    toast('Evento removido');
  }

  function toggleCommunityRsvpEntry(eventId) {
    const uidv = sessionRef.current?.id;
    if (!uidv) return;
    const current = (dataRef.current?.commExtras?.rsvps || []).some((r) => r.event_id === eventId && r.user_id === uidv);
    setData((cur) => ({
      ...cur,
      commExtras: {
        ...cur.commExtras,
        rsvps: current
          ? (cur.commExtras?.rsvps || []).filter((r) => !(r.event_id === eventId && r.user_id === uidv))
          : [...(cur.commExtras?.rsvps || []), { event_id: eventId, user_id: uidv }],
      },
    }));
    remote.toggleCommunityRsvp(eventId, uidv, !current);
    toast(current ? 'Presença cancelada' : 'Presença confirmada');
  }

  function addCommunityClassifiedEntry(entry) {
    const row = { id: uid(), author_id: sessionRef.current?.id, created_at: new Date().toISOString(), status: 'active', ...entry };
    setData((cur) => ({
      ...cur,
      commExtras: { ...cur.commExtras, classifieds: [row, ...(cur.commExtras?.classifieds || [])] },
    }));
    if (sessionRef.current?.id) remote.addCommunityClassified(row);
    toast('Anúncio publicado');
  }

  function editCommunityClassifiedEntry(id, patch) {
    setData((cur) => ({
      ...cur,
      commExtras: { ...cur.commExtras, classifieds: (cur.commExtras?.classifieds || []).map((c) => c.id === id ? { ...c, ...patch } : c) },
    }));
    remote.updateCommunityClassified(id, patch);
    toast('Anúncio atualizado');
  }

  function reportCommunityClassified(id, reason) {
    const uidv = sessionRef.current?.id;
    if (!uidv) {
      toast('Entre na sua conta para denunciar.');
      return;
    }
    remote.reportCommunityClassified(id, uidv, reason);
    toast('Denúncia enviada. A moderação vai analisar.');
  }

  function removeCommunityClassifiedEntry(id) {
    setData((cur) => ({
      ...cur,
      commExtras: { ...cur.commExtras, classifieds: (cur.commExtras?.classifieds || []).filter((c) => c.id !== id) },
    }));
    remote.removeCommunityClassified(id);
    toast('Anúncio removido');
  }

  function pinCommunityTopic(commId, topicId) {
    const topic = dataRef.current?.comms.find((c) => c.id === commId)?.topics.find((t) => t.id === topicId);
    const pinned = !topic?.pinned;
    setData((cur) => ({
      ...cur,
      comms: cur.comms.map((c) => c.id === commId
        ? { ...c, topics: c.topics.map((t) => t.id === topicId ? { ...t, pinned } : t) }
        : c),
    }));
    remote.setTopicPinned(topicId, pinned);
    toast(pinned ? 'Tópico fixado' : 'Tópico desafixado');
  }

  function openChat(id) {
    const chat = dataRef.current?.chats.find((c) => c.id === id);
    setData((cur) => ({
      ...cur,
      chats: cur.chats.map((c) => (c.id === id ? { ...c, unread: 0 } : c)),
    }));
    setUi((u) => ({ ...u, chat: id, chatOpen: true }));
    if (sessionRef.current?.id && chat?.with) {
      remote.markDirectMessagesRead(sessionRef.current.id, chat.with);
    }
  }

  function sendMessageTo(chatId, text, attachment) {
    const chat = dataRef.current?.chats.find((c) => c.id === chatId);
    const trimmed = (text || '').trim();
    if (!chat || (!trimmed && !attachment)) return null;
    if (chat.with && !canMessage(chat.with)) {
      toast('Vocês precisam se seguir para trocar mensagens.');
      return null;
    }
    const message = {
      id: uid(),
      me: true,
      text: trimmed,
      ts: Date.now(),
      st: 'sent',
      ...(attachment ? { attachment } : {}),
    };
    setData((cur) => ({
      ...cur,
      chats: cur.chats.map((c) =>
        c.id === chatId ? { ...c, msgs: [...c.msgs, message] } : c
      ),
    }));
    if (sessionRef.current?.id && chat.with) {
      remote.sendDirectMessage(message, sessionRef.current.id, chat.with);
    }
    if (uiRef.current.settings?.soundOnSend) playSentSound();
    return message;
  }

  function sendMessage(text, attachment) {
    return sendMessageTo(uiRef.current.chat, text, attachment);
  }

  function sendTyping(to) {
    if (!to) return;
    const now = Date.now();
    if (now - (lastTypingRef.current[to] || 0) < 2200) return;
    lastTypingRef.current[to] = now;
    presenceRef.current?.sendTyping(to);
  }

  async function sendChatFile(file, kind, caption = '') {
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) {
      toast('Arquivo muito grande (máximo de 12 MB).');
      return;
    }
    try {
      const src =
        kind === 'photo'
          ? await fileToDataURL(file, 1600)
          : await fileToRawDataURL(file);
      sendMessage('', {
        kind,
        src,
        name: file.name || 'arquivo',
        mime: file.type || '',
        ...(caption ? { caption } : {}),
      });
    } catch {
      toast('Não foi possível ler esse arquivo.');
    }
  }

  /** Variante usada pelo envio múltiplo: propaga falha para permitir retry. */
  async function sendChatMedia(file, kind, caption = '') {
    if (!file) throw new Error('Arquivo vazio.');
    if (file.size > 12 * 1024 * 1024) {
      throw new Error('Arquivo muito grande (máximo de 12 MB).');
    }
    const src =
      kind === 'photo'
        ? await fileToDataURL(file, 1600)
        : await fileToRawDataURL(file);
    const message = sendMessage('', {
      kind,
      src,
      name: file.name || 'arquivo',
      mime: file.type || '',
      ...(caption ? { caption } : {}),
    });
    if (!message) throw new Error('Não foi possível enviar o arquivo.');
    return message;
  }

  async function sendChatBlob(blob, kind, name) {
    if (!blob || !blob.size) return;
    if (blob.size > 12 * 1024 * 1024) {
      toast('Arquivo muito grande (máximo de 12 MB).');
      return;
    }
    try {
      const src = await fileToRawDataURL(blob);
      sendMessage('', {
        kind,
        src,
        name: name || 'arquivo',
        mime: blob.type || '',
      });
    } catch {
      toast('Não foi possível processar a gravação.');
    }
  }

  /**
   * Envio de áudio do gravador gestual. Prefere o bucket `audio` (contrato
   * idêntico ao mobile) e mantém fallback local quando não há sessão.
   * Nunca é chamado automaticamente: o gravador exige confirmação explícita.
   */
  async function sendChatAudio(blob, meta = {}) {
    if (!blob || !blob.size) throw new Error('Gravação vazia.');
    if (blob.size > 5 * 1024 * 1024) {
      throw new Error('Áudio muito grande (máximo de 5 MB).');
    }
    const session = sessionRef.current;
    const uploaded = session?.id
      ? await remote.uploadAudio(blob, session.id, meta.mime || blob.type)
      : null;
    let src = uploaded?.url;
    if (!src) {
      // Sem sessão ou falha no Storage: mantém compatibilidade com o
      // comportamento anterior usando data URL local.
      src = await fileToRawDataURL(blob);
    }
    const message = sendMessage('', {
      kind: 'audio',
      src,
      name: `audio-${Date.now()}.${(meta.mime || '').includes('mp4') ? 'm4a' : 'webm'}`,
      mime: meta.mime || blob.type || 'audio/webm',
      duration: Math.max(1, Number(meta.duration) || 0),
      waves: Array.isArray(meta.waves) ? meta.waves.slice(0, 96) : [],
      storagePath: uploaded?.path || null,
    });
    if (!message) throw new Error('Não foi possível enviar o áudio.');
    return message;
  }

  function likeMessage(chatId, index) {
    setData((cur) => ({
      ...cur,
      chats: cur.chats.map((c) =>
        c.id === chatId
          ? {
              ...c,
              msgs: c.msgs.map((m, i) => (i === index ? { ...m, liked: !m.liked } : m)),
            }
          : c
      ),
    }));
  }

  async function editMessage(chatId, index, text) {
    const chat = dataRef.current?.chats.find((c) => c.id === chatId);
    const message = chat?.msgs?.[index];
    const clean = String(text || '').trim();
    if (!chat || !message || !message.me || !clean) return;
    if (clean === String(message.text || '').trim()) return;
    const previous = message.text || '';
    const editedAt = Date.now();
    setData((cur) => ({
      ...cur,
      chats: cur.chats.map((c) =>
        c.id === chatId
          ? {
              ...c,
              msgs: c.msgs.map((m, i) =>
                i === index ? { ...m, text: clean, editedAt } : m
              ),
            }
          : c
      ),
    }));
    const ok = sessionRef.current?.id && message.id
      ? await remote.updateDirectMessage(message.id, clean)
      : true;
    if (!ok) {
      setData((cur) => ({
        ...cur,
        chats: cur.chats.map((c) =>
          c.id === chatId
            ? {
                ...c,
                msgs: c.msgs.map((m, i) =>
                  i === index ? { ...m, text: previous, editedAt: undefined } : m
                ),
              }
            : c
        ),
      }));
      toast('Não foi possível editar a mensagem.');
      return;
    }
    toast('Mensagem editada');
  }

  function deleteMessage(chatId, index) {
    const chat = dataRef.current?.chats.find((c) => c.id === chatId);
    const message = chat?.msgs?.[index];
    if (!chat || !message) return;
    setData((cur) => ({
      ...cur,
      chats: cur.chats.map((c) =>
        c.id === chatId
          ? { ...c, msgs: c.msgs.filter((_item, i) => i !== index) }
          : c
      ),
    }));
    if (sessionRef.current?.id && message.id) {
      remote.deleteDirectMessage(message.id);
    }
    toast('Mensagem apagada');
  }

  function clearChat(chatId) {
    const chat = dataRef.current?.chats.find((c) => c.id === chatId);
    if (!chat) return;
    requestConfirm({
      title: 'Limpar histórico?',
      text: 'As mensagens desta conversa serão apagadas para as duas pessoas.',
      confirmLabel: 'Limpar',
      tone: 'hot',
      action: () => {
        setData((cur) => ({
          ...cur,
          chats: cur.chats.map((c) => (c.id === chatId ? { ...c, msgs: [] } : c)),
        }));
        if (sessionRef.current?.id) {
          remote.deleteDirectMessagesWith(sessionRef.current.id, chat.with);
        }
        toast('Histórico limpo');
      },
    });
  }

  function deleteChat(chatId) {
    const chat = dataRef.current?.chats.find((c) => c.id === chatId);
    if (!chat) return;
    requestConfirm({
      title: 'Apagar conversa?',
      text: 'A conversa sai da sua lista e as mensagens são apagadas para as duas pessoas.',
      confirmLabel: 'Apagar',
      tone: 'hot',
      action: () => {
        setData((cur) => ({
          ...cur,
          chats: cur.chats.filter((c) => c.id !== chatId),
        }));
        setUi((u) =>
          u.chat === chatId ? { ...u, chat: null, chatOpen: false } : u
        );
        if (sessionRef.current?.id) {
          remote.deleteDirectMessagesWith(sessionRef.current.id, chat.with);
        }
        toast('Conversa apagada');
      },
    });
  }

  function setChatWallpaper(withId, seed) {
    if (!withId) return;
    const walls = { ...(uiRef.current.settings?.chatWalls || {}) };
    if (seed) walls[withId] = seed;
    else delete walls[withId];
    setSetting('chatWalls', walls);
    toast(seed ? 'Papel de parede atualizado' : 'Papel de parede padrão restaurado');
  }

  function openRoom(id) {
    const live = liveChannelOfMine();
    if (live && live.id !== id) {
      requestConfirm({
        title: 'Encerrar a live?',
        text: 'Sua transmissão será encerrada para você entrar em outro canal.',
        confirmLabel: 'Encerrar e abrir',
        tone: 'hot',
        action: () => {
          finishLive({ silent: true, id: live.id });
          applyOpenRoom(id);
        },
      });
      return;
    }
    applyOpenRoom(id);
  }

  function applyOpenRoom(id) {
    setUi((u) => ({ ...u, room: id, route: 'conexoes', quizOpen: false }));
    const target = '#conexoes/' + encodeURIComponent(id);
    if (location.hash !== target) location.hash = target;
  }

  function backRoom() {
    const live = liveChannelOfMine();
    if (live) {
      requestConfirm({
        title: 'Sair e encerrar a live?',
        text: 'Ao voltar para a lista de canais, sua transmissão será finalizada.',
        confirmLabel: 'Sair e encerrar',
        tone: 'hot',
        action: () => {
          finishLive({ silent: true, id: live.id });
          applyBackRoom();
        },
      });
      return;
    }
    applyBackRoom();
  }

  function applyBackRoom() {
    setUi((u) => ({ ...u, room: null }));
    if (location.hash !== '#conexoes') location.hash = '#conexoes';
  }

  function joinRoom() {
    const roomId = uiRef.current.room;
    const channel = dataRef.current?.chans.find((c) => c.id === roomId);
    if (!channel) return;
    if (channel.joined) {
      requestConfirm({
        title: 'Sair do canal?',
        text: `Você deixará de acompanhar ${channel.name}.`,
        confirmLabel: 'Sair',
        tone: 'hot',
        action: () => applyJoinRoom(),
      });
      return;
    }
    applyJoinRoom();
  }

  function applyJoinRoom() {
    const roomId = uiRef.current.room;
    const channel = dataRef.current?.chans.find((c) => c.id === roomId);
    if (!channel) return;
    const joined = !channel.joined;
    setData((cur) => ({
      ...cur,
      chans: cur.chans.map((c) =>
        c.id === roomId
          ? { ...c, joined, followers: Math.max(0, c.followers + (joined ? 1 : -1)) }
          : c
      ),
    }));
    if (sessionRef.current?.id) {
      remote.setChannelMembership(roomId, sessionRef.current.id, joined);
    }
    toast(joined ? 'Você entrou no canal' : 'Você saiu do canal');
  }

  function createChannel({ name, desc, kind }) {
    const channel = {
      id: uid(),
      owner: 'me',
      name,
      desc: desc || 'Canal novo.',
      kind,
      followers: 1,
      live: false,
      title: '',
      viewers: 0,
      joined: true,
      msgs: [],
      polls: [],
      seed: name + '-palco',
    };
    setData((cur) => ({ ...cur, chans: [channel, ...cur.chans] }));
    setUi((u) => ({ ...u, modal: null, room: channel.id, route: 'conexoes' }));
    const target = '#conexoes/' + encodeURIComponent(channel.id);
    if (location.hash !== target) location.hash = target;
    if (sessionRef.current?.id) {
      remote.saveChannel(channel, sessionRef.current.id);
      remote.setChannelMembership(channel.id, sessionRef.current.id, true);
    }
    toast('Canal criado');
  }

  function toggleChannelSubscription(channelId) {
    const channel = dataRef.current?.chans.find((c) => c.id === channelId);
    if (!channel) return;
    const subscribe = !channel.subscribed;
    setData((cur) => ({
      ...cur,
      chans: cur.chans.map((c) => c.id === channelId
        ? { ...c, subscribed: subscribe, followers: Math.max(0, (c.followers || 0) + (subscribe ? 1 : -1)) }
        : c),
    }));
    if (sessionRef.current?.id) {
      remote.setChannelSubscription(channelId, sessionRef.current.id, subscribe);
    }
    toast(subscribe ? `Você se inscreveu em ${channel.name}` : `Você saiu de ${channel.name}`);
  }

  function deleteChannel(id) {
    const channel = dataRef.current?.chans.find((c) => c.id === id);
    if (!channel || channel.owner !== 'me') return;
    requestConfirm({
      title: 'Excluir canal?',
      text: `O canal "${channel.name}" e todas as mensagens serão removidos para todos.`,
      confirmLabel: 'Excluir canal',
      tone: 'hot',
      action: () => applyDeleteChannel(id),
    });
  }

  function applyDeleteChannel(id) {
    setData((cur) => ({
      ...cur,
      chans: cur.chans.filter((c) => c.id !== id),
    }));
    setUi((u) => ({
      ...u,
      room: u.room === id ? null : u.room,
      myLive: u.myLive?.id === id ? null : u.myLive,
      modal: null,
    }));
    if (location.hash.startsWith('#conexoes/')) location.hash = '#conexoes';
    if (sessionRef.current?.id) remote.deleteChannel(id);
    toast('Canal excluído');
  }

  async function startLive({ chanId, title, category }) {
    const cur = dataRef.current;
    if (!cur) return;
    if (uiRef.current.myLive) {
      toast('Você já está ao vivo. Encerre a transmissão atual primeiro.');
      return;
    }
    const realLive = isLiveKitEnabled && !!sessionRef.current?.id;
    const start = Date.now();
    // Sem canal escolhido, reaproveita um palco próprio ou cria um automaticamente.
    // Nenhuma mensagem fictícia é inserida no chat da transmissão.
    let channel =
      chanId && chanId !== 'new'
        ? cur.chans.find((c) => c.id === chanId)
        : cur.chans.find((c) => c.owner === 'me' && c.kind === 'palco');
    if (!channel) {
      channel = {
        id: uid(),
        owner: 'me',
        name: cur.me.name,
        desc: String(category || '').trim() || `Transmissão de ${cur.me.name}`,
        kind: 'palco',
        followers: 1,
        live: true,
        livekit: realLive,
        title,
        viewers: 1,
        joined: true,
        msgs: [],
        polls: [],
        seed: cur.me.name + '-palco',
      };
    } else {
      channel = {
        ...channel,
        live: true,
        livekit: realLive,
        title,
        desc: String(category || '').trim() || channel.desc,
        viewers: 1,
      };
    }
    if (sessionRef.current?.id) {
      await remote.saveChannel(channel, sessionRef.current.id);
      await remote.setChannelMembership(channel.id, sessionRef.current.id, true);
    }

    setData((state) => {
      const exists = state.chans.some((c) => c.id === channel.id);
      return {
        ...state,
        chans: exists
          ? state.chans.map((c) => (c.id === channel.id ? channel : c))
          : [channel, ...state.chans],
      };
    });
    setUi((u) => ({
      ...u,
      myLive: { id: channel.id, start, peak: 1 },
      modal: null,
      room: channel.id,
      route: 'conexoes',
    }));
    const target = '#conexoes/' + encodeURIComponent(channel.id);
    if (location.hash !== target) location.hash = target;
    toast(realLive ? 'Conectando câmera e microfone...' : 'Você está ao vivo');
  }

  function liveChannelOfMine() {
    const cur = dataRef.current;
    if (!cur) return null;
    const roomId = uiRef.current.room;
    const room = roomId ? cur.chans.find((c) => c.id === roomId) : null;
    if (room && room.owner === 'me' && room.live) return room;
    return cur.chans.find((c) => c.owner === 'me' && c.live) || null;
  }

  function endLive() {
    const channel = liveChannelOfMine();
    if (!channel) return;
    requestConfirm({
      title: 'Encerrar live?',
      text: 'A transmissão será finalizada para todas as pessoas que estão assistindo.',
      confirmLabel: 'Encerrar',
      tone: 'hot',
      action: () => finishLive({ id: channel.id }),
    });
  }

  function finishLive({ silent = false, id } = {}) {
    const live = uiRef.current.myLive;
    const channelId = id || live?.id || liveChannelOfMine()?.id;
    if (!channelId) return;
    const channel = dataRef.current?.chans.find((c) => c.id === channelId);
    const peak = live?.peak || channel?.viewers || 0;
    const now = Date.now();
    const chatPolls = (channel?.polls || []).filter(
      (poll) => poll.mode === 'chat' && poll.status === 'open'
    );
    const chatPollIds = new Set(chatPolls.map((poll) => poll.id));
    if (channel) {
      const updated = {
        ...channel,
        live: false,
        livekit: false,
        polls: (channel.polls || []).map((poll) =>
          chatPollIds.has(poll.id)
            ? { ...poll, status: 'closed', closedAt: now }
            : poll
        ),
      };
      setData((cur) => ({
        ...cur,
        chans: cur.chans.map((c) => (c.id === channelId ? updated : c)),
      }));
      if (sessionRef.current?.id) remote.saveChannel(updated, sessionRef.current.id);
      chatPolls.forEach((poll) => remote.closeChannelPoll(poll.id));
    }
    setUi((u) => ({
      ...u,
      myLive: u.myLive && u.myLive.id !== channelId ? u.myLive : null,
    }));
    if (!silent) toast('Live encerrada. Pico de ' + fmt(peak) + ' espectadores.');
  }

  // Cria enquete no chat da live. "fluxo" também publica no feed e mantém o
  // vínculo com a transmissão; "chat" fica exclusiva de quem está assistindo.
  function createLivePoll({
    question,
    options,
    mode = 'chat',
    durationValue = 30,
    durationUnit = 'minutes',
  }) {
    const channelId = uiRef.current.room;
    const channel = dataRef.current?.chans.find((c) => c.id === channelId);
    if (!channel || channel.owner !== 'me') {
      toast('Só o criador da live pode criar enquetes.');
      return null;
    }
    if (!channel.live) {
      toast('Inicie a live para criar enquetes no chat.');
      return null;
    }
    const trimmed = String(question || '').trim();
    const list = (options || [])
      .map((label, index) => ({
        id: `opt-${index + 1}`,
        label: String(label || '').trim(),
      }))
      .filter((option) => option.label)
      .slice(0, 6);
    if (!trimmed) {
      toast('Escreva a pergunta da enquete.');
      return null;
    }
    if (list.length < 2) {
      toast('Escreva pelo menos duas alternativas.');
      return null;
    }
    const unit = SCHEDULE_UNITS.find((item) => item.id === durationUnit) || SCHEDULE_UNITS[0];
    const amount = Math.max(1, Math.round(Number(durationValue) || 1));
    const durationMinutes = Math.min(
      MAX_SCHEDULE_MINUTES,
      Math.max(MIN_SCHEDULE_MINUTES, Math.round(amount * unit.factor))
    );
    const now = Date.now();
    const closesAt = now + durationMinutes * 60_000;
    const poll = {
      id: uid(),
      channelId,
      createdBy: 'me',
      question: trimmed,
      options: list,
      mode: mode === 'fluxo' ? 'fluxo' : 'chat',
      status: 'open',
      postId: null,
      closesAt,
      closedAt: null,
      ts: now,
      votes: [],
    };

    let post = null;
    if (poll.mode === 'fluxo') {
      const iso = (value) => new Date(value).toISOString();
      post = {
        id: uid(),
        by: 'me',
        ts: now,
        text: trimmed,
        kind: 'text',
        media: [],
        likes: 0,
        liked: false,
        myReaction: null,
        reactionCounts: {},
        saved: false,
        commentsDisabled: false,
        comments: [],
        interactions: [],
        communityId: null,
        interactive: {
          format: 'poll',
          options: list.map((option) => ({ id: option.id, label: option.label })),
          reactions: [],
          invited: [],
          schedule: {
            mode: 'scheduled',
            durationMinutes,
            releaseMinutes: 0,
            opensAt: iso(now),
            closesAt: iso(closesAt),
            resultsAt: iso(closesAt),
          },
          live: {
            channelId,
            pollId: poll.id,
            onlyChat: false,
            title: channel.title || channel.name,
          },
        },
      };
      poll.postId = post.id;
    }

    setData((cur) => ({
      ...cur,
      posts: post ? [post, ...cur.posts] : cur.posts,
      chans: cur.chans.map((c) =>
        c.id === channelId ? { ...c, polls: [poll, ...(c.polls || [])] } : c
      ),
    }));

    const uidv = sessionRef.current?.id || null;
    if (uidv) {
      remote.saveChannelPoll(poll, channelId, uidv);
      if (post) remote.savePost(post, uidv);
    }
    toast(
      poll.mode === 'fluxo'
        ? 'Enquete publicada no chat e no Fluxo'
        : 'Enquete exclusiva do chat criada'
    );
    return poll;
  }

  function voteLivePoll(pollId, optionId) {
    const channelId = uiRef.current.room;
    const cur = dataRef.current;
    const channel = cur?.chans.find((c) => c.id === channelId);
    const poll = (channel?.polls || []).find((item) => item.id === pollId);
    if (!poll) return null;
    if (livePollStatus(poll) !== 'open') {
      toast('Esta enquete já foi encerrada.');
      return null;
    }
    if ((poll.votes || []).some((vote) => vote.by === 'me')) {
      toast('Voto confirmado — não pode ser alterado depois de enviado.');
      return null;
    }
    if (!(poll.options || []).some((option) => option.id === optionId)) {
      toast('Essa alternativa não está mais disponível.');
      return null;
    }

    const vote = { id: `${pollId}:me`, by: 'me', optionId, ts: Date.now() };
    // Mostra o voto na hora. No modo Supabase o Realtime confirma em seguida
    // com os mesmos dados e sem duplicar (a limpeza remove o voto anterior).
    const applyLocalVote = () =>
      setData((state) => ({
        ...state,
        chans: state.chans.map((c) =>
          c.id === channelId
            ? {
                ...c,
                polls: (c.polls || []).map((item) =>
                  item.id === pollId
                    ? {
                        ...item,
                        votes: [
                          ...(item.votes || []).filter((row) => row.by !== 'me'),
                          vote,
                        ],
                      }
                    : item
                ),
              }
            : c
        ),
      }));

    const linked = (cur.posts || []).find(
      (post) => normalizeInteractive(post.interactive)?.live?.pollId === pollId
    );
    if (linked) {
      // saveInteraction espelha o voto no chat e no post_interactions.
      const entry = saveInteraction(linked.id, 'vote', { optionId });
      if (!entry) return null;
      applyLocalVote();
    } else {
      const uidv = sessionRef.current?.id || null;
      applyLocalVote();
      if (uidv) remote.castChannelPollVote({ pollId, userId: uidv, optionId });
    }
    toast('Voto registrado — não pode ser alterado');
    return true;
  }

  function closeLivePoll(pollId) {
    const channelId = uiRef.current.room;
    const cur = dataRef.current;
    const channel = cur?.chans.find((c) => c.id === channelId);
    const poll = (channel?.polls || []).find((item) => item.id === pollId);
    if (!poll || channel?.owner !== 'me') return;
    const now = Date.now();
    const closedPost = poll.postId
      ? (cur.posts || []).find((post) => post.id === poll.postId)
      : null;
    const closedInteractive = closedPost
      ? normalizeInteractive(closedPost.interactive)
      : null;
    const nextInteractive =
      closedInteractive?.schedule
        ? {
            ...closedInteractive,
            schedule: {
              ...closedInteractive.schedule,
              closesAt: new Date(now).toISOString(),
              resultsAt: new Date(now).toISOString(),
            },
          }
        : null;

    setData((state) => ({
      ...state,
      posts:
        poll.postId && nextInteractive
          ? state.posts.map((post) =>
              post.id === poll.postId ? { ...post, interactive: nextInteractive } : post
            )
          : state.posts,
      chans: state.chans.map((c) =>
        c.id === channelId
          ? {
              ...c,
              polls: (c.polls || []).map((item) =>
                item.id === pollId
                  ? { ...item, status: 'closed', closedAt: now }
                  : item
              ),
            }
          : c
      ),
    }));

    const uidv = sessionRef.current?.id || null;
    if (uidv) {
      remote.closeChannelPoll(pollId);
      if (closedPost && nextInteractive) {
        remote.savePost({ ...closedPost, interactive: nextInteractive }, uidv);
      }
    }
    toast('Enquete encerrada — resultados liberados');
  }

  function sendRoomMessage(text) {
    const roomId = uiRef.current.room;
    const channel = dataRef.current?.chans.find((c) => c.id === roomId);
    const trimmed = text.trim();
    if (!channel || !trimmed) return;
    const message = {
      id: uid(),
      by: 'me',
      text: trimmed,
      ts: Date.now(),
      ...(channel.kind === 'avisos'
        ? { reacts: { '❤️': 0, '🔥': 0, '👏': 0 }, mine: {} }
        : {}),
    };
    setData((cur) => ({
      ...cur,
      chans: cur.chans.map((c) =>
        c.id === roomId ? { ...c, msgs: [...c.msgs, message] } : c
      ),
    }));
    if (sessionRef.current?.id) remote.addChannelMessage(message, roomId, sessionRef.current.id);
  }

  function reactNotice(chanId, messageId, emoji) {
    const channel = dataRef.current?.chans.find((c) => c.id === chanId);
    const message = channel?.msgs.find((m) => m.id === messageId);
    if (!message) return;
    const on = !(message.mine?.[emoji]);
    const reacts = {
      ...(message.reacts || {}),
      [emoji]: Math.max(0, (message.reacts?.[emoji] || 0) + (on ? 1 : -1)),
    };
    const mine = { ...(message.mine || {}), [emoji]: on };
    setData((cur) => ({
      ...cur,
      chans: cur.chans.map((c) =>
        c.id === chanId
          ? {
              ...c,
              msgs: c.msgs.map((m) =>
                m.id === messageId ? { ...m, reacts, mine } : m
              ),
            }
          : c
      ),
    }));
    if (sessionRef.current?.id) remote.setReaction(messageId, sessionRef.current.id, emoji, on);
  }

  async function createStickerPack(name) {
    const trimmed = String(name || '').trim();
    if (!trimmed) {
      toast('Dê um nome ao pacote de figurinhas.');
      return null;
    }
    const pack = {
      id: uid(),
      name: trimmed,
      icon: '🖼️',
      ts: Date.now(),
      custom: true,
      stickers: [],
    };
    setData((cur) => ({
      ...cur,
      customStickerPacks: [...(cur.customStickerPacks || []), pack],
    }));
    if (sessionRef.current?.id) remote.saveStickerPack(pack, sessionRef.current.id);
    toast('Pacote criado');
    return pack;
  }

  async function addStickerToPack(packId, file) {
    if (!file || !packId) return;
    try {
      let src = await fileToDataURL(file, 512);
      if (sessionRef.current?.id) {
        const uploaded = await remote.uploadMedia(file, sessionRef.current.id);
        if (uploaded) src = uploaded;
      }
      const sticker = { id: uid(), src, ts: Date.now() };
      setData((cur) => ({
        ...cur,
        customStickerPacks: (cur.customStickerPacks || []).map((pack) =>
          pack.id === packId
            ? { ...pack, stickers: [...pack.stickers, sticker] }
            : pack
        ),
      }));
      if (sessionRef.current?.id) {
        remote.saveStickerRow(sticker, packId, sessionRef.current.id);
      }
      toast('Figurinha adicionada');
    } catch {
      toast('Não foi possível usar essa imagem.');
    }
  }

  function removeStickerFromPack(packId, stickerId) {
    setData((cur) => ({
      ...cur,
      customStickerPacks: (cur.customStickerPacks || []).map((pack) =>
        pack.id === packId
          ? { ...pack, stickers: pack.stickers.filter((item) => item.id !== stickerId) }
          : pack
      ),
    }));
    remote.deleteStickerRow(stickerId);
    toast('Figurinha removida');
  }

  function deleteStickerPack(packId) {
    const pack = (dataRef.current?.customStickerPacks || []).find(
      (item) => item.id === packId
    );
    requestConfirm({
      title: 'Excluir pacote?',
      text: `As figurinhas de ${pack?.name || 'este pacote'} serão removidas.`,
      confirmLabel: 'Excluir',
      tone: 'hot',
      action: () => {
        (pack?.stickers || []).forEach((item) => remote.deleteStickerRow(item.id));
        setData((cur) => ({
          ...cur,
          customStickerPacks: (cur.customStickerPacks || []).filter(
            (item) => item.id !== packId
          ),
        }));
        remote.deleteStickerPackRemote(packId);
        toast('Pacote excluído');
      },
    });
  }

  function setSetting(key, value) {
    setUi((u) => ({ ...u, settings: { ...u.settings, [key]: value } }));
  }

  // Personaliza as reações exibidas no picker das publicações.
  function setReactions(emojis) {
    const list = (emojis || []).filter(Boolean).slice(0, 12);
    setSetting('reactions', list.length ? list : REACTIONS_PADRAO);
  }

  function openReactions() {
    setUi((u) => ({ ...u, modal: { type: 'reactions' } }));
  }

  function setFeedPref(patch) {
    const current = feedPrefs(uiRef.current.settings);
    const next = { ...current, ...(patch || {}) };
    setSetting('feed', next);
    if (sessionRef.current?.id) remote.saveFeedPreferences(sessionRef.current.id, next);
  }

  function resetFeedPrefs() {
    setSetting('feed', { ...DEFAULT_FEED_PREFS });
    if (sessionRef.current?.id) {
      remote.saveFeedPreferences(sessionRef.current.id, { ...DEFAULT_FEED_PREFS });
    }
    toast('Preferências do feed restauradas');
  }

  // Feedback das recomendações. Cada escolha tem efeito próprio e persistente.
  function feedFeedback(postId, kind, value) {
    const prefs = feedPrefs(uiRef.current.settings);
    const post = dataRef.current?.posts.find((item) => item.id === postId);
    if (!post) return;
    if (kind === 'notInterested') {
      setFeedPref({ hiddenPosts: [...new Set([...prefs.hiddenPosts, postId])] });
      toast('Vamos mostrar menos conteúdos como este');
    } else if (kind === 'lessLike') {
      const term = String(post.text || '').split(/\s+/).filter((word) => word.length > 4)[0];
      setFeedPref({
        hiddenPosts: [...new Set([...prefs.hiddenPosts, postId])],
        mutedTopics: term ? [...new Set([...prefs.mutedTopics, term])] : prefs.mutedTopics,
      });
      toast(term ? `Menos assuntos como “${term}”` : 'Vamos mostrar menos conteúdos assim');
    } else if (kind === 'muteTopic') {
      const term = String(value || '').trim();
      if (!term) return;
      setFeedPref({ mutedTopics: [...new Set([...prefs.mutedTopics, term])] });
      toast(`Assunto “${term}” silenciado`);
    } else if (kind === 'hideProfile') {
      setFeedPref({ hiddenProfiles: [...new Set([...prefs.hiddenProfiles, post.by])] });
      toast('Publicações deste perfil ocultadas');
    } else if (kind === 'unhideProfile') {
      setFeedPref({ hiddenProfiles: prefs.hiddenProfiles.filter((id) => id !== post.by) });
      toast('Perfil reexibido no feed');
    } else if (kind === 'muteCommunity') {
      const id = post.communityId;
      if (!id) return;
      setFeedPref({ mutedComms: [...new Set([...prefs.mutedComms, id])] });
      toast('Comunidade silenciada no feed');
    }
  }

  function addInterest(term) {
    const value = String(term || '').trim();
    if (!value) return;
    const current = dataRef.current?.me?.interests || [];
    if (current.includes(value)) return;
    const next = [...current, value];
    setData((cur) => ({ ...cur, me: { ...cur.me, interests: next } }));
    if (sessionRef.current?.id) {
      remote.saveProfile({ ...dataRef.current.me, interests: next }, sessionRef.current.id);
    }
  }

  function removeInterest(term) {
    const current = dataRef.current?.me?.interests || [];
    const next = current.filter((item) => item !== term);
    setData((cur) => ({ ...cur, me: { ...cur.me, interests: next } }));
    if (sessionRef.current?.id) {
      remote.saveProfile({ ...dataRef.current.me, interests: next }, sessionRef.current.id);
    }
  }

  function muteTopic(term) {
    const value = String(term || '').trim();
    if (!value) return;
    const prefs = feedPrefs(uiRef.current.settings);
    setFeedPref({ mutedTopics: [...new Set([...prefs.mutedTopics, value])] });
    toast(`Assunto “${value}” silenciado`);
  }

  function unmuteTopic(term) {
    const prefs = feedPrefs(uiRef.current.settings);
    setFeedPref({ mutedTopics: prefs.mutedTopics.filter((item) => item !== term) });
  }

  function toggleChatMute(withId) {
    const settings = uiRef.current.settings || DEFAULT_SETTINGS;
    const list = settings.mutedChats || [];
    const on = !list.includes(withId);
    setSetting(
      'mutedChats',
      on ? [...list, withId] : list.filter((id) => id !== withId)
    );
    toast(on ? 'Conversa silenciada' : 'Conversa reativada');
  }

  function toggleLiveAlert(id) {
    const settings = uiRef.current.settings || DEFAULT_SETTINGS;
    const list = settings.liveChannels || [];
    const on = !list.includes(id);
    setSetting(
      'liveChannels',
      on ? [...list, id] : list.filter((item) => item !== id)
    );
    toast(
      on
        ? 'Você será avisado quando este canal entrar ao vivo'
        : 'Alerta de live desativado'
    );
  }

  async function installApp() {
    const prompt = installPrompt.current;
    if (!prompt) {
      toast('Use o menu do navegador e escolha "Instalar aplicativo" ou "Adicionar à tela inicial".');
      return;
    }
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch {
      /* prompt is best-effort */
    }
    installPrompt.current = null;
    setCanInstall(false);
  }

  function clearLocalCache() {
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key && key.startsWith(DATA_PREFIX)) keys.push(key);
      }
      keys.forEach((key) => localStorage.removeItem(key));
      toast('Cache local limpo. O conteúdo na nuvem não foi alterado.');
    } catch {
      toast('Não foi possível limpar o cache.');
    }
  }

  const actions = {
    submitAuth,
    google,
    exitGuest,
    requestPasswordReset,
    finishRecovery,
    cancelRecovery,
    logout,
    deleteAccount,
    openDeleteAccount: () => setUi((u) => ({ ...u, modal: { type: 'deleteaccount' } })),
    notify: toast,
    setAuthTab: (authTab) => setUi((u) => ({ ...u, authTab })),
    openSearch: () => setUi((u) => ({ ...u, modal: { type: 'search' } })),
    openObs: (id) => setUi((u) => ({ ...u, modal: { type: 'obs', id } })),
    toggleTheme: () =>
      setUi((u) => ({ ...u, theme: u.theme === 'dark' ? 'light' : 'dark' })),
    go,
    setDraftText: (text) => setUi((u) => ({ ...u, draft: { ...u.draft, text } })),
    setDraftFormat,
    setDraftSchedule,
    setDraftCommunity: (communityId) =>
      setUi((u) => ({ ...u, draft: { ...u.draft, communityId: communityId || null } })),
    setDraftOption,
    addDraftOption,
    removeDraftOption,
    toggleDraftReaction,
    toggleDraftInvite,
    clearDraftMedia: () =>
      setUi((u) => ({ ...u, draft: { ...u.draft, media: [] } })),
    resetDraft: () =>
      setUi((u) => ({
        ...u,
        draft: {
          ...u.draft,
          text: '',
          media: [],
          format: 'classic',
          options: [],
          communityId: null,
          live: null,
        },
      })),
    removeDraftMedia,
    reorderDraftMedia,
    applyMediaEdit,
    attachMedia,
    attachPostMedia,
    removePostMedia,
    applyPostMediaEdit,
    publish,
    sendCommunityAudio,
    votePost,
    answerPost,
    joinChallenge,
    inviteToChallenge,
    toggleLike,
    reactPost,
    toggleComments,
    openPost,
    openClips,
    closeClips,
    setClipIndex,
    openUser,
    reportPost,
    addComment,
    reactComment,
    deleteComment,
    openEditPost,
    updatePost,
    toggleCommentsDisabled,
    deletePost,
    toggleSave,
    share,
    sharePost,
    openSharePost,
    sharePostTo,
    shareChannel,
    openSettings: () => setUi((u) => ({ ...u, modal: { type: 'settings' } })),
    openNotifications: () => setUi((u) => ({ ...u, modal: { type: 'notifications' } })),
    openComposer: () => setUi((u) => ({ ...u, modal: { type: 'composer' } })),
    saveDraftNow: () => {
      writeDraft(uiRef.current.draft);
      toast('Rascunho salvo');
    },
    discardDraft: () => {
      writeDraft(null);
      setUi((u) => ({
        ...u,
        draft: {
          text: '', media: [], format: 'classic', options: [], reactions: DEFAULT_REACTIONS,
          invited: [], communityId: null, schedule: DEFAULT_SCHEDULE, live: null,
        },
      }));
      toast('Rascunho descartado');
    },
    markNotifsSeen,
    markCommunityNotificationsRead,
    loadMoreFeed,
    shareCommunityPostToFeed,
    addCommunityAnnouncement,
    updateCommunityAnnouncement,
    removeCommunityAnnouncement,
    markAnnouncementRead,
    setSetting,
    createStickerPack,
    addStickerToPack,
    removeStickerFromPack,
    deleteStickerPack,
    setFeedPref,
    resetFeedPrefs,
    feedFeedback,
    setReactions,
    openReactions,
    addInterest,
    removeInterest,
    muteTopic,
    unmuteTopic,
    openFeedPrefs: () => setUi((u) => ({ ...u, modal: { type: 'feedprefs' } })),
    playTestSound: playMessageSound,
    installApp,
    clearCache: clearLocalCache,
    openNewChat,
    canMessage,
    startChat,
    follow,
    setProfTab: (profTab) => setUi((u) => ({ ...u, profTab })),
    openProfileList: (kind = 'following') =>
      setUi((u) => ({ ...u, modal: { type: 'profilelist', kind } })),
    saveProfile,
    pickCover,
    uploadAvatar,
    uploadCover,
    addScrap,
    openComm,
    openCommAdmin: (id) => setUi((u) => ({ ...u, modal: { type: 'comm', id, admin: true } })),
    closeModal,
    toggleComm,
    createComm,
    requestJoinComm,
    cancelJoinComm,
    approveJoin,
    rejectJoin,
    inviteToComm,
    respondCommunityInvite,
    linkCommChannel,
    unlinkCommChannel,
    uploadCommunityArt,
    openNewCommFromTopic,
    addModerator,
    removeModerator,
    addTopic,
    deleteTopic,
    toggleEmojiFavorite: toggleEmojiFavoriteAction,
    pinCommunityTopic,
    addCommunityGalleryItem,
    removeCommunityGalleryItem,
    addCommunityEventEntry,
    editCommunityEventEntry,
    removeCommunityEventEntry,
    toggleCommunityRsvpEntry,
    addCommunityClassifiedEntry,
    editCommunityClassifiedEntry,
    removeCommunityClassifiedEntry,
    reportCommunityClassified,
    setCommSeed: (commSeed) => setUi((u) => ({ ...u, commSeed })),
    openChat,
    backChat: () => setUi((u) => ({ ...u, chatOpen: false })),
    setChatQuery: (chatQ) => setUi((u) => ({ ...u, chatQ })),
    sendMessage,
    sendMessageTo,
    sendTyping,
    sendChatFile,
    sendChatMedia,
    sendChatBlob,
    sendChatAudio,
    viewPost,
    recordDwell,
    likeMessage,
    editMessage,
    deleteMessage,
    clearChat,
    deleteChat,
    setChatWallpaper,
    setChanFilter: (chanFilter) => setUi((u) => ({ ...u, chanFilter })),
    openRoom,
    backRoom,
    openArena,
    openArenaCode,
    closeArena,
    openQuiz,
    openQuizChallenge,
    closeQuiz,
    openEnigmas,
    closeEnigmas,
    openDefesa,
    closeDefesa,
    requestConfirm,
    loadEnigmaRanking: () => remote.loadEnigmaRanking(),
    recordEnigmaScore,
    inviteToArena,
    shareArenaResult,
    shareQuizResult,
    shareQuizChallenge,
    shareQuizInvite,
    clearRoom: () => {
      setUi((u) => ({ ...u, room: null }));
      if (location.hash !== '#conexoes') location.hash = '#conexoes';
    },
    joinRoom,
    createChannel,
    toggleChannelSubscription,
    deleteChannel,
    toggleLiveAlert,
    toggleChatMute,
    startLive,
    endLive,
    sendRoomMessage,
    createLivePoll,
    voteLivePoll,
    closeLivePoll,
    reactNotice,
    openEditProfile: () => setUi((u) => ({ ...u, modal: { type: 'profile' } })),
    openNewComm: () => setUi((u) => ({ ...u, modal: { type: 'newcomm' } })),
    openNewChannel: () => setUi((u) => ({ ...u, modal: { type: 'newchan' } })),
    // Live direta: qualquer pessoa autenticada entra no ar sem precisar criar canal.
    // O canal de transmissão é criado automaticamente em startLive, se necessário.
    openLive: () => setUi((u) => ({ ...u, modal: { type: 'live' } })),
  };

  const value = {
    data,
    guest,
    ui,
    ready,
    session,
    recovery,
    mode: isSupabaseEnabled ? 'supabase' : 'demo',
    online,
    onlinePeople,
    typingPeople,
    canInstall,
    toast: toastMsg,
    actions,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
