import { useEffect, useRef, useState } from 'react';
import { ago } from '../lib/utils';
import { userOf } from '../lib/selectors';
import { hasEdits, mediaDisplayStyle, wrapperAspect } from '../lib/mediaEdit';
import { useApp } from '../store/AppContext';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { EditOverlay } from './MediaEditor';

const SEEN_KEY = 'fluxo.storiesSeen';
const DAY = 24 * 60 * 60 * 1000;

export function readSeenStories() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeSeenStories(ids) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(ids.slice(-500)));
  } catch {
    /* ignore quota errors */
  }
}

export function activeStories(data) {
  const now = Date.now();
  return data.posts
    .filter((post) => post.kind === 'story' && now - post.ts < DAY)
    .sort((a, b) => a.ts - b.ts);
}

export function storyGroups(data) {
  const map = new Map();
  activeStories(data).forEach((story) => {
    if (!map.has(story.by)) map.set(story.by, []);
    map.get(story.by).push(story);
  });
  return [...map.entries()]
    .map(([id, stories]) => ({ id, author: userOf(data, id), stories }))
    .sort(
      (a, b) =>
        b.stories[b.stories.length - 1].ts - a.stories[a.stories.length - 1].ts
    );
}

export function StoriesBar({ groups, onOpen, onAdd }) {
  const { data } = useApp();
  const seen = new Set(readSeenStories());
  const mine = groups.find((group) => group.id === 'me');
  const others = groups.filter((group) => group.id !== 'me');
  const unseen = (group) => group.stories.some((story) => !seen.has(story.id));
  const mineUnseen = mine ? unseen(mine) : false;

  return (
    <div className="stories" aria-label="Stories">
      <div className="story-item">
        <button
          type="button"
          className={`story-av${mine ? ' ring' : ''}${
            mine && !mineUnseen ? ' seen' : ''
          }`}
          onClick={() => (mine ? onOpen('me') : onAdd())}
          aria-label={mine ? 'Ver seu story' : 'Adicionar story'}
        >
          <Avatar user={data.me} size={56} />
        </button>
        <button
          type="button"
          className="story-plus"
          onClick={onAdd}
          aria-label="Adicionar story"
        >
          <Icon name="plus" />
        </button>
        <span className="story-name">Seu story</span>
      </div>
      {others.map((group) => (
        <div className="story-item" key={group.id}>
          <button
            type="button"
            className={`story-av${unseen(group) ? ' ring' : ' seen'}`}
            onClick={() => onOpen(group.id)}
            aria-label={`Ver story de ${group.author.name}`}
          >
            <Avatar user={group.author} size={56} />
          </button>
          <span className="story-name">{group.author.name.split(' ')[0]}</span>
        </div>
      ))}
    </div>
  );
}

export function StoryViewer({ groups, startId, onClose }) {
  const { actions } = useApp();
  const startGroup = Math.max(
    0,
    groups.findIndex((group) => group.id === startId)
  );
  const initialGroup = groups[startGroup];
  const seen = readSeenStories();
  const firstUnseen = initialGroup
    ? initialGroup.stories.findIndex((story) => !seen.includes(story.id))
    : 0;
  const [gi, setGi] = useState(startGroup);
  const [si, setSi] = useState(firstUnseen >= 0 ? firstUnseen : 0);
  const [progress, setProgress] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [reply, setReply] = useState('');
  const [paused, setPaused] = useState(false);
  const videoRef = useRef(null);
  const seenRef = useRef(new Set(seen));

  const group = groups[gi];
  const story = group?.stories?.[si];
  const media = story?.media?.[0];
  const isVideo = media?.kind === 'video' && !!media.src;

  function next() {
    if (!group) return;
    if (si < group.stories.length - 1) setSi(si + 1);
    else if (gi < groups.length - 1) {
      setGi(gi + 1);
      setSi(0);
    } else onClose();
  }

  function prev() {
    if (!group) return;
    if (si > 0) setSi(si - 1);
    else if (gi > 0) {
      const previous = groups[gi - 1];
      setGi(gi - 1);
      setSi(Math.max(0, previous.stories.length - 1));
    }
  }

  useEffect(() => {
    if (!story) onClose();
  }, [story?.id]);

  useEffect(() => {
    if (!story || seenRef.current.has(story.id)) return;
    seenRef.current.add(story.id);
    writeSeenStories([...seenRef.current]);
  }, [story?.id]);

  useEffect(() => {
    setVideoDuration(0);
    setReply('');
    setPaused(false);
  }, [story?.id]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (paused) video.pause();
    else {
      const playing = video.play();
      if (playing?.catch) playing.catch(() => {});
    }
  }, [paused, story?.id]);

  useEffect(() => {
    if (!story) return undefined;
    const duration = isVideo ? 0 : 5000;
    if (!duration || paused) return undefined;
    const started = Date.now();
    setProgress(0);
    const timer = setInterval(() => {
      const pct = Math.min(100, ((Date.now() - started) / duration) * 100);
      setProgress(pct);
      if (pct >= 100) {
        clearInterval(timer);
        next();
      }
    }, 50);
    return () => clearInterval(timer);
  }, [story?.id, isVideo, videoDuration, paused]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    function onKey(event) {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') next();
      if (event.key === 'ArrowLeft') prev();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!group || !story) return null;

  return (
    <div className="story-viewer" role="dialog" aria-modal="true" aria-label="Stories">
      <div className="story-progress">
        {group.stories.map((item, index) => (
          <span className="story-bar" key={item.id}>
            <i
              style={{
                width:
                  index < si
                    ? '100%'
                    : index === si
                      ? `${progress}%`
                      : '0%',
              }}
            />
          </span>
        ))}
      </div>

      <div className="story-head">
        <Avatar user={group.author} size={40} />
        <div className="grow">
          <b>{group.author.name}</b>
          <span className="muted sm">{ago(story.ts)}</span>
        </div>
        {story.by === 'me' ? (
          <button
            type="button"
            className="icon-btn"
            onClick={() => actions.deleteStory(story.id)}
            aria-label="Excluir story"
          >
            <Icon name="trash" />
          </button>
        ) : null}
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar">
          <Icon name="x" />
        </button>
      </div>

      <div className="story-stage">
        {media?.src && media.edit && hasEdits(media.edit) ? (
          <span
            className="med-wrap med-fit"
            style={{ aspectRatio: String(wrapperAspect(media.edit)) }}
          >
            {isVideo ? (
              <video
                ref={videoRef}
                src={media.src}
                autoPlay
                playsInline
                style={mediaDisplayStyle(media.edit)}
                onLoadedMetadata={(event) =>
                  setVideoDuration(event.currentTarget.duration || 0)
                }
                onTimeUpdate={(event) =>
                  setProgress(
                    Math.min(
                      100,
                      (event.currentTarget.currentTime /
                        (event.currentTarget.duration || 1)) *
                        100
                    )
                  )
                }
                onEnded={next}
                onError={next}
              />
            ) : (
              <img src={media.src} alt="" style={mediaDisplayStyle(media.edit)} />
            )}
            <EditOverlay edit={media.edit} />
          </span>
        ) : (
          <>
            {media?.kind === 'photo' && media.src ? (
              <img src={media.src} alt="" />
            ) : null}
            {isVideo ? (
              <video
                ref={videoRef}
                src={media.src}
                autoPlay
                playsInline
                onLoadedMetadata={(event) =>
                  setVideoDuration(event.currentTarget.duration || 0)
                }
                onTimeUpdate={(event) =>
                  setProgress(
                    Math.min(
                      100,
                      (event.currentTarget.currentTime /
                        (event.currentTarget.duration || 1)) *
                        100
                    )
                  )
                }
                onEnded={next}
                onError={next}
              />
            ) : null}
          </>
        )}
        {!media && story.text ? (
          <div className="story-text">
            <span>{story.text}</span>
          </div>
        ) : null}
        {media && story.text ? <p className="story-caption">{story.text}</p> : null}
        <button
          type="button"
          className="story-tap prev"
          onClick={prev}
          aria-label="Story anterior"
        />
        <button
          type="button"
          className="story-tap next"
          onClick={next}
          aria-label="Próximo story"
        />
      </div>

      {story.by !== 'me' ? (
        <form
          className="story-reply"
          onSubmit={(event) => {
            event.preventDefault();
            if (!reply.trim()) return;
            actions.replyStory(story.id, reply);
            setReply('');
            setPaused(false);
          }}
        >
          <input
            className="input"
            placeholder={`Responder ${group.author.name.split(' ')[0]} no direct...`}
            value={reply}
            maxLength={500}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
            onChange={(event) => setReply(event.target.value)}
          />
          <button className="btn primary sm" type="submit" disabled={!reply.trim()}>
            <Icon name="send" /> Responder
          </button>
        </form>
      ) : null}
    </div>
  );
}
