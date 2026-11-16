import React, { useMemo, useState } from 'react';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { AvatarView } from './Ui';
import { colors, radius, spacing } from '../lib/theme';
import { timeAgo } from '../lib/format';
import { normalizeInteractive, scheduleLabel, schedulePhase } from '../lib/interactive';
import type { Post, Interactive as InteractiveType, InteractiveOption } from '../types';

function tallyVotes(post: Post) {
  const counts = new Map<string, number>();
  (post.interactions || []).forEach((i) => {
    if (i.kind === 'vote' && i.optionId) counts.set(i.optionId, (counts.get(i.optionId) || 0) + 1);
  });
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  return { counts, total };
}

function Header({ interactive, icon, label, meta }: { interactive: InteractiveType | null; icon: any; label: string; meta: string }) {
  const phase = schedulePhase(interactive);
  return (
    <View style={styles.head}>
      <Ionicons name={icon} size={16} color={colors.primary} />
      <Text style={styles.headLabel}>{label}</Text>
      {meta ? <Text style={styles.headMeta}>{meta}</Text> : null}
      {phase !== 'open' ? <Text style={styles.phase}>{scheduleLabel(interactive)}</Text> : null}
    </View>
  );
}

function Poll({ post, interactive }: { post: Post; interactive: InteractiveType }) {
  const { actions, users, profile } = useApp();
  const phase = schedulePhase(interactive);
  const showResults = phase === 'results';
  const { counts, total } = tallyVotes(post);
  const myVote = (post.interactions || []).find((i) => i.userId === profile?.id && i.kind === 'vote')?.optionId;

  return (
    <View style={styles.card}>
      <Header interactive={interactive} icon="stats-chart" label="Enquete" meta={total ? `${total} ${total === 1 ? 'voto' : 'votos'}` : ''} />
      <View style={{ gap: 8, marginTop: 10 }}>
        {interactive.options.map((opt) => {
          const count = counts.get(opt.id) || 0;
          const pct = total ? Math.round((count / total) * 100) : 0;
          const selected = myVote === opt.id;
          return (
            <Pressable
              key={opt.id}
              onPress={() => phase === 'open' && actions.votePost(post, opt.id)}
              style={[styles.option, selected && styles.optionOn]}
              disabled={phase !== 'open'}
            >
              {showResults ? <View style={[styles.bar, { width: `${pct}%` }]} /> : null}
              <Text style={styles.optionLabel}>{opt.label}</Text>
              {showResults ? <Text style={styles.pct}>{pct}%</Text> : null}
            </Pressable>
          );
        })}
      </View>
      {phase === 'closed' ? <Text style={styles.hint}>Aguarde a liberação dos resultados.</Text> : null}
      {phase === 'open' && myVote ? <Text style={styles.hint}>Toque em outra opção para mudar seu voto.</Text> : null}
    </View>
  );
}

function ImageVote({ post, interactive }: { post: Post; interactive: InteractiveType }) {
  const { actions, profile } = useApp();
  const phase = schedulePhase(interactive);
  const showResults = phase === 'results';
  const { counts, total } = tallyVotes(post);
  const myVote = (post.interactions || []).find((i) => i.userId === profile?.id && i.kind === 'vote')?.optionId;

  return (
    <View style={styles.card}>
      <Header interactive={interactive} icon="images" label="Votação" meta={total ? `${total} ${total === 1 ? 'voto' : 'votos'}` : ''} />
      <View style={styles.imageGrid}>
        {interactive.options.map((opt) => {
          const media = post.media[opt.mediaIndex ?? 0];
          const count = counts.get(opt.id) || 0;
          const pct = total ? Math.round((count / total) * 100) : 0;
          const selected = myVote === opt.id;
          return (
            <Pressable
              key={opt.id}
              onPress={() => phase === 'open' && actions.votePost(post, opt.id)}
              style={[styles.imageCell, selected && styles.imageCellOn]}
              disabled={phase !== 'open'}
            >
              {media?.src ? (
                <Image source={{ uri: media.src }} style={StyleSheet.absoluteFill} contentFit="cover" />
              ) : (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceAlt }]} />
              )}
              <View style={styles.imageLabelBg}>
                <Text style={styles.imageLabel} numberOfLines={1}>{opt.label}</Text>
              </View>
              {showResults ? (
                <View style={styles.imageResult}>
                  <Text style={styles.pct}>{pct}%</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function QuestionCard({ post, interactive }: { post: Post; interactive: InteractiveType }) {
  const { actions, users, profile } = useApp();
  const [text, setText] = useState('');
  const phase = schedulePhase(interactive);
  const answers = (post.interactions || []).filter((i) => i.kind === 'answer').sort((a, b) => b.createdAt - a.createdAt);

  return (
    <View style={styles.card}>
      <Header interactive={interactive} icon="help-circle" label="Pergunta" meta={`${answers.length} ${answers.length === 1 ? 'resposta' : 'respostas'}`} />
      {phase === 'open' ? (
        <View style={styles.answerRow}>
          <TextInput
            value={text}
            onChangeText={(t) => setText(t.slice(0, 280))}
            placeholder="Escreva sua resposta…"
            placeholderTextColor={colors.faint}
            style={styles.answerInput}
            maxLength={280}
          />
          <Pressable
            onPress={() => { if (text.trim()) { actions.answerPost(post, text); setText(''); } }}
            style={[styles.sendBtn, !text.trim() && { opacity: 0.5 }]}
            disabled={!text.trim()}
          >
            <Ionicons name="send" size={18} color="#fff" />
          </Pressable>
        </View>
      ) : (
        <Text style={styles.hint}>As respostas foram encerradas.</Text>
      )}
      {answers.length ? (
        <View style={{ gap: 10, marginTop: 12 }}>
          {answers.slice(0, 8).map((a) => {
            const user = users[a.userId];
            return (
              <View key={a.id} style={styles.answer}>
                <AvatarView user={user} size={28} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.answerName}>{user?.name || 'Alguém'} · {timeAgo(a.createdAt)}</Text>
                  <Text style={styles.answerText}>{a.text}</Text>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function Challenge({ post, interactive }: { post: Post; interactive: InteractiveType }) {
  const { actions, profile } = useApp();
  const phase = schedulePhase(interactive);
  const joined = (post.interactions || []).filter((i) => i.kind === 'join');
  const mine = joined.some((i) => i.userId === profile?.id);

  return (
    <View style={styles.card}>
      <Header interactive={interactive} icon="flash" label="Desafio" meta={`${joined.length} ${joined.length === 1 ? 'participante' : 'participantes'}`} />
      <View style={styles.challengeRow}>
        <Pressable
          onPress={() => actions.joinChallenge(post)}
          disabled={phase !== 'open' || mine}
          style={[styles.joinBtn, (mine || phase !== 'open') && styles.joinBtnOff]}
        >
          <Ionicons name={mine ? 'checkmark' : 'flash'} size={18} color="#fff" />
          <Text style={styles.joinText}>{mine ? 'Você está participando' : phase !== 'open' ? 'Encerrado' : 'Participar do desafio'}</Text>
        </Pressable>
      </View>
      {interactive.invited?.length ? <Text style={styles.hint}>{interactive.invited.length} pessoa(s) convidada(s).</Text> : null}
    </View>
  );
}

export default function Interactive({ post, compact = false }: { post: Post; compact?: boolean }) {
  const interactive = useMemo(() => normalizeInteractive(post.interactive), [post.interactive]);
  if (!interactive) return null;
  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      {interactive.format === 'poll' ? <Poll post={post} interactive={interactive} /> : null}
      {interactive.format === 'imageVote' ? <ImageVote post={post} interactive={interactive} /> : null}
      {interactive.format === 'question' ? <QuestionCard post={post} interactive={interactive} /> : null}
      {interactive.format === 'challenge' ? <Challenge post={post} interactive={interactive} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.lg, marginTop: 6 },
  wrapCompact: { paddingHorizontal: 8 },
  card: { padding: 14, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  headLabel: { color: colors.text, fontWeight: '800', fontSize: 14 },
  headMeta: { color: colors.muted, fontSize: 12 },
  phase: { color: colors.pink, fontSize: 11, fontWeight: '800', marginLeft: 'auto' },
  option: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  optionOn: { borderWidth: 1, borderColor: colors.primary },
  optionLabel: { color: colors.text, fontWeight: '700', fontSize: 14 },
  bar: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: colors.primary + '33' },
  pct: { color: colors.primary, fontWeight: '800', fontSize: 13 },
  hint: { color: colors.muted, fontSize: 12, marginTop: 8 },
  imageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  imageCell: { width: '48%', aspectRatio: 1, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  imageCellOn: { borderWidth: 2, borderColor: colors.primary },
  imageLabelBg: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 8, backgroundColor: 'rgba(0,0,0,0.55)' },
  imageLabel: { color: '#fff', fontWeight: '700', fontSize: 12 },
  imageResult: { position: 'absolute', top: 8, right: 8, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.6)' },
  answerRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  answerInput: { flex: 1, minHeight: 42, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, color: colors.text, paddingHorizontal: 12, fontSize: 14 },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  answer: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  answerName: { color: colors.muted, fontSize: 11 },
  answerText: { color: colors.text, fontSize: 13, lineHeight: 18 },
  challengeRow: { marginTop: 10 },
  joinBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 44, borderRadius: radius.md, backgroundColor: colors.primary },
  joinBtnOff: { backgroundColor: colors.surfaceAlt },
  joinText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
