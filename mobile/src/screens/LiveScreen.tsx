import React, { useEffect, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import StackHeader from '../components/StackHeader';
import { AvatarView, Card, EmptyState } from '../components/Ui';
import { colors, radius, spacing } from '../lib/theme';
import { getChannel, getChannelMessages, sendChannelMessage } from '../lib/api';
import { supabase } from '../lib/supabase';
import { isLiveKitConfigured } from '../lib/env';

export default function LiveScreen({ channelId, host }: { channelId: string; host: boolean }) {
  const { profile, users, actions } = useApp();
  const [channel, setChannel] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [ch, msgs] = await Promise.all([getChannel(channelId), getChannelMessages(channelId)]);
        setChannel(ch);
        setMessages(msgs.map((m: any) => ({ id: String(m.id), authorId: String(m.author_id), text: String(m.text || ''), createdAt: new Date(m.created_at).getTime() })));
      } catch (e: any) {
        actions.toast(e?.message || 'Não foi possível abrir a live.');
      } finally {
        setLoading(false);
      }
    })();
  }, [channelId]);

  useEffect(() => {
    const sub = supabase
      .channel(`live-chat-${channelId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'channel_messages', filter: `channel_id=eq.${channelId}` }, (payload) => {
        const row = payload.new as any;
        setMessages((cur) => cur.some((m) => m.id === String(row.id)) ? cur : [...cur, { id: String(row.id), authorId: String(row.author_id), text: String(row.text || ''), createdAt: new Date(row.created_at).getTime() }]);
      })
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [channelId]);

  async function send() {
    const clean = text.trim();
    if (!clean || !profile?.id) return;
    try {
      await sendChannelMessage({ channelId, authorId: profile.id, text: clean });
      setText('');
    } catch (e: any) {
      actions.toast(e?.message || 'Não foi possível enviar.');
    }
  }

  const live = channel?.live;

  return (
    <SafeAreaView style={styles.root}>
      <StackHeader title={channel?.name ? `Live: ${channel.name}` : 'Live'} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ padding: spacing.lg, gap: 10 }}>
          <Card style={{ gap: 8 }}>
            <Text style={styles.title}>{channel?.name || 'Canal ao vivo'}</Text>
            <Text style={styles.meta}>
              {isLiveKitConfigured
                ? 'A reprodução de vídeo LiveKit nativa não está implementada nesta versão do app. Chat e atualizações em tempo real funcionam abaixo.'
                : 'LiveKit não configurado. Chat e atualizações em tempo real funcionam abaixo.'}
            </Text>
            {host ? <Text style={styles.meta}>Você está como anfitrião.</Text> : null}
            {live?.pollId ? <Text style={styles.meta}>Enquete ativa: {live.title || live.pollId}</Text> : null}
          </Card>
        </View>

        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 12, gap: 8, flexGrow: messages.length ? 0 : 1 }}
          renderItem={({ item }) => {
            const author = users[item.authorId];
            return (
              <View style={styles.msg}>
                <AvatarView user={author} size={28} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.msgName}>{author?.name || 'Usuário'}</Text>
                  <Text style={styles.msgText}>{item.text}</Text>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={loading ? undefined : <EmptyState icon="chatbubbles-outline" title="Sem mensagens" text="Envie a primeira mensagem do chat da live." />}
        />

        <View style={styles.composer}>
          <TextInput value={text} onChangeText={setText} placeholder="Mensagem no chat" placeholderTextColor={colors.faint} style={styles.input} />
          <Pressable onPress={send} disabled={!text.trim()} style={[styles.send, !text.trim() && { opacity: 0.5 }]}>
            <Ionicons name="send" size={18} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  title: { color: colors.text, fontWeight: '800', fontSize: 18 },
  meta: { color: colors.muted, lineHeight: 20 },
  msg: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  msgName: { color: colors.text, fontWeight: '700', fontSize: 13 },
  msgText: { color: colors.text, fontSize: 14, lineHeight: 20 },
  composer: { flexDirection: 'row', gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: colors.border },
  input: { flex: 1, height: 42, borderRadius: 21, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, color: colors.text, paddingHorizontal: 14 },
  send: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
});
