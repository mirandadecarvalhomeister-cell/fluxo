export type MediaKind = 'photo' | 'video';

export type MediaItem = {
  kind: MediaKind;
  src?: string | null;
  seed?: string | null;
  dur?: number | null;
  edit?: Record<string, unknown> | null;
};

export type Profile = {
  id: string;
  name: string;
  handle: string;
  bio: string;
  city: string;
  humor: string;
  interests: string[];
  avatar: string | null;
  followers: number;
  cover: unknown;
};

export type InteractiveOption = {
  id: string;
  label: string;
  mediaIndex?: number;
};

export type Interactive = {
  format: 'poll' | 'question' | 'imageVote' | 'challenge' | 'reactions';
  options: InteractiveOption[];
  reactions: string[];
  invited: string[];
  schedule?: {
    mode: 'scheduled';
    durationMinutes: number;
    releaseMinutes: number;
    opensAt: string;
    closesAt: string;
    resultsAt: string;
  } | null;
  live?: {
    channelId: string;
    pollId: string;
    onlyChat: boolean;
    title: string;
  };
};

export type Post = {
  id: string;
  authorId: string;
  createdAt: number;
  text: string;
  kind: 'text' | 'photo' | 'video' | 'story';
  media: MediaItem[];
  seed: string;
  dur?: number | null;
  likes: number;
  liked: boolean;
  myReaction: string | null;
  saved: boolean;
  commentsDisabled: boolean;
  interactive: Interactive | null;
  commentCount: number;
  reactionCounts: Record<string, number>;
  communityId?: string | null;
};

export type Comment = {
  id: string;
  postId: string;
  authorId: string;
  text: string;
  createdAt: number;
};

export type DirectMessage = {
  id: string;
  senderId: string;
  recipientId: string;
  text: string;
  attachment: Record<string, any> | null;
  read: boolean;
  createdAt: number;
  editedAt?: number | null;
};

export type QuizRankingRow = {
  position: number;
  userId: string;
  name: string;
  handle: string;
  avatar: string | null;
  score: number;
  rounds: number;
  bestCombo: number;
};

export type QuizChallenge = {
  id: string;
  challengerId: string;
  challengerName: string;
  category: string;
  categoryName?: string;
  mode: 'classic' | 'insane';
  size: number;
  targetScore: number;
  medal?: string | null;
  createdAt: number;
};

export type QuizResult = {
  score: number;
  correct: number;
  wrong: number;
  timeouts: number;
  answered: number;
  total: number;
  bestCombo: number;
  categoryId: string;
  categoryName: string;
  mode: 'classic' | 'insane';
  durationMs: number;
  userId: string;
  name: string;
  handle: string;
  avatar: string | null;
  medal?: string | null;
};

export type ChatThread = {
  userId: string;
  last: DirectMessage | null;
  unread: number;
};

export type Channel = {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  kind: string;
  isLive: boolean;
  livekit: boolean;
  title: string;
  viewers: number;
  seed: string | null;
  createdAt: number;
};

export type ChannelMessage = {
  id: string;
  channelId: string;
  authorId: string;
  text: string;
  createdAt: number;
};

export type LivePoll = {
  id: string;
  channelId: string;
  createdBy: string;
  question: string;
  options: { id: string; label: string }[];
  mode: 'chat' | 'fluxo';
  status: 'open' | 'closed';
  postId: string | null;
  createdAt: number;
  votes: { id: string; userId: string; optionId: string }[];
};

export type AppNotification = {
  id: string;
  type: 'like' | 'comment' | 'follow' | 'mention';
  actorId: string;
  postId?: string;
  text?: string;
  emoji?: string;
  createdAt: number;
  read: boolean;
};

export type RealtimeStatus = 'connecting' | 'online' | 'offline';

export type VideoQuality = 'auto' | 'low' | 'medium' | 'high';

export type Preferences = {
  autoplay: boolean;
  dataSaver: boolean;
  videoQuality: VideoQuality;
  sound: boolean;
  reduceMotion: boolean;
  notifications: boolean;
};
