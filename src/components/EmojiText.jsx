import { TagText } from './Brand';
import AnimatedEmoji from './AnimatedEmoji';
import { flagCode, hasAnimatedEmoji } from '../lib/animatedEmoji';
import FlagEmoji from './FlagEmoji';

// Texto com menções/marks preservados e emojis do Noto animados inline.
// Usado no feed, no chat da live e nas mensagens diretas.
export default function EmojiText({ text, size = 20, links = false }) {
  const value = String(text || '');
  const parts = value.split(
    /(\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*)/gu
  );
  return (
    <>
      {parts.map((part, i) =>
        hasAnimatedEmoji(part) ? (
          <AnimatedEmoji key={i} emoji={part} size={size} />
        ) : flagCode(part) ? (
          <FlagEmoji key={i} emoji={part} size={size} />
        ) : (
          <TagText key={i} text={part} links={links} />
        )
      )}
    </>
  );
}
