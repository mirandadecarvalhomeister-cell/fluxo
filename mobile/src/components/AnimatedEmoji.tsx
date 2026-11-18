import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, Pressable } from 'react-native';
import LottieView from 'lottie-react-native';
import { REACTION_TO_CODE } from '../lib/animatedEmoji';
import { colors } from '../lib/theme';

/** Emoji animado do Noto (Lottie). Cai para Unicode se não houver arquivo local. */
export default function AnimatedEmoji({ emoji, size = 26, autoplay = true, loop = false }: {
  emoji: string;
  size?: number;
  autoplay?: boolean;
  loop?: boolean;
}) {
  const code = REACTION_TO_CODE[emoji];
  const source = code ? emojiSources[code] : null;
  const animRef = useRef<LottieView>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (autoplay && !failed) {
      const t = setTimeout(() => { animRef.current?.play(); }, 30);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [emoji, autoplay, loop, failed]);

  if (!source || failed) {
    return <Text style={[styles.fallback, { fontSize: size }]}>{emoji}</Text>;
  }

  return (
    <Pressable
      onPress={() => animRef.current?.play()}
      style={{ width: size, height: size }}
      hitSlop={2}
    >
      <LottieView
        ref={animRef}
        source={source}
        style={StyleSheet.absoluteFill}
        autoPlay={autoplay}
        loop={loop}
        onAnimationFailure={() => setFailed(true)}
      />
    </Pressable>
  );
}

// Registro estático dos arquivos locais (Metro exige require() explícito).
const emojiSources: Record<string, any> = {
  '2764_fe0f': require('../../assets/emoji/2764_fe0f.json'),
  '1f525': require('../../assets/emoji/1f525.json'),
  '1f44f': require('../../assets/emoji/1f44f.json'),
  '1f602': require('../../assets/emoji/1f602.json'),
  '1f62e': require('../../assets/emoji/1f62e.json'),
  '1f622': require('../../assets/emoji/1f622.json'),
  '1f389': require('../../assets/emoji/1f389.json'),
  '1f49c': require('../../assets/emoji/1f49c.json'),
  '1f60d': require('../../assets/emoji/1f60d.json'),
  '1f62d': require('../../assets/emoji/1f62d.json'),
  '1f44d': require('../../assets/emoji/1f44d.json'),
  '1f680': require('../../assets/emoji/1f680.json'),
  '2728': require('../../assets/emoji/2728.json'),
  '1f4af': require('../../assets/emoji/1f4af.json'),
  '1f973': require('../../assets/emoji/1f973.json'),
  '1f60e': require('../../assets/emoji/1f60e.json'),
};

const styles = StyleSheet.create({
  fallback: { color: colors.text, lineHeight: undefined, textAlign: 'center' },
});
