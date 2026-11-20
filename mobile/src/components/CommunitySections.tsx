import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useApp } from '../context/AppContext';
import { colors, radius, spacing } from '../lib/theme';
import { timeAgo } from '../lib/format';
import { mediaOf } from '../lib/media';
import { EmptyState, GhostButton, PrimaryButton } from './Ui';
import {
  fetchCommunityAnnouncements, publishCommunityAnnouncement, markCommunityAnnouncementRead,
  fetchCommunityEvents, createCommunityEvent, setCommunityEventRsvp,
  fetchCommunityClassifieds, setCommunityClassifiedStatus, reportCommunityClassified,
  type CommunityAnnouncement, type CommunityEvent, type CommunityClassified,
} from '../lib/api';
import type { Post } from '../types';

type Props = { communityId: string; owner: boolean; uid: string };

function Section({ children }: { children: React.ReactNode }) {
  return <View style={styles.section}>{children}</View>;
}

/** Galeria derivada das mídias publicadas na comunidade. */
export function CommunityGallery({ posts }: { posts: Post[] }) {
  const { actions } = useApp();
  const [filter, setFilter] = useState<'all' | 'photo' | 'video' | 'audio'>('all');
  const items = posts.flatMap((post) =>
    mediaOf(post)
      .filter((media) => media.src && ['photo', 'video', 'audio'].includes(media.kind || ''))
      .map((media, index) => ({ id: `${post.id}-${index}`, postId: post.id, ...media }))
  );
  const shown = items.filter((media) => filter === 'all' || media.kind === filter);
  return (
    <Section>
      <View style={styles.filters}>
        {([['all', 'Todos'], ['photo', 'Fotos'], ['video', 'Vídeos'], ['audio', 'Áudios']] as const).map(
          ([key, label]) => (
            <Pressable
              key={key}
              onPress={() => setFilter(key)}
              style={[styles.chip, filter === key && styles.chipOn]}
            >
              <Text style={[styles.chipText, filter === key && styles.chipTextOn]}>{label}</Text>
            </Pressable>
          )
        )}
      </View>
      {shown.length ? (
        <View style={styles.grid}>
          {shown.map((media) => (
            <Pressable
              key={media.id}
              style={styles.tile}
              onPress={() => actions.push({ name: 'post', postId: media.postId })}
            >
              {media.kind === 'photo' && media.src ? (
                <Image source={{ uri: media.src }} style={styles.tileImage} contentFit="cover" />
              ) : (
                <>
                  {media.kind === 'photo' && media.src ? null : (
                    <Image source={{ uri: media.src || '' }} style={styles.tileImage} contentFit="cover" />
                  )}
                  <View style={styles.tileIcon}>
                    <Ionicons name={media.kind === 'video' ? 'play' : 'musical-notes'} size={18} color="#fff" />
                  </View>
                </>
              )}
            </Pressable>
          ))}
        </View>
      ) : (
        <EmptyState icon="images-outline" title="Galeria vazia" text="As mídias publicadas aparecem aqui." />
      )}
    </Section>
  );
}

export function CommunityAnnouncements({ communityId, owner, uid }: Props) {
  const { actions } = useApp();
  const [rows, setRows] = useState<CommunityAnnouncement[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setRows(await fetchCommunityAnnouncements(communityId)); }
    catch (error: any) { actions.toast(error?.message || 'Não foi possível carregar os comunicados.'); }
  }, [communityId, actions]);
  useEffect(() => { void load(); }, [load]);

  const publish = async () => {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      await publishCommunityAnnouncement(communityId, uid, { title: title.trim(), body: body.trim() });
      setTitle(''); setBody('');
      await load();
      actions.toast('Comunicado publicado');
    } catch (error: any) {
      actions.toast(error?.message || 'Não foi possível publicar.');
    } finally { setBusy(false); }
  };

  return (
    <Section>
      {owner ? (
        <View style={styles.form}>
          <TextInput style={styles.input} placeholder="Título do comunicado" placeholderTextColor={colors.faint} value={title} onChangeText={setTitle} />
          <TextInput style={[styles.input, styles.textarea]} placeholder="Mensagem" placeholderTextColor={colors.faint} value={body} onChangeText={setBody} multiline />
          <PrimaryButton title="Publicar comunicado" icon="megaphone-outline" loading={busy} onPress={() => void publish()} />
        </View>
      ) : null}
      {rows.length ? (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <Pressable
              style={[styles.card, item.pinned && styles.cardPinned]}
              onPress={() => { void markCommunityAnnouncementRead(item.id, uid); }}
            >
              <View style={styles.rowBetween}>
                {item.pinned ? <Text style={styles.badge}>📌 Fixado</Text> : <Text style={styles.badgePrioridade}>Prioridade {item.priority}</Text>}
                <Text style={styles.time}>{timeAgo(Date.parse(item.created_at))}</Text>
              </View>
              <Text style={styles.cardTitle}>{item.title}</Text>
              {item.body ? <Text style={styles.cardBody}>{item.body}</Text> : null}
              {item.image_url ? <Image source={{ uri: item.image_url }} style={styles.cardImage} contentFit="cover" /> : null}
            </Pressable>
          )}
        />
      ) : (
        <EmptyState icon="megaphone-outline" title="Sem comunicados" text="Avisos oficiais da administração aparecem aqui." />
      )}
    </Section>
  );
}

export function CommunityEvents({ communityId, uid }: Props) {
  const { actions } = useApp();
  const [rows, setRows] = useState<CommunityEvent[]>([]);
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState('');
  const [place, setPlace] = useState('');
  const [going, setGoing] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    try { setRows(await fetchCommunityEvents(communityId)); }
    catch (error: any) { actions.toast(error?.message || 'Não foi possível carregar os eventos.'); }
  }, [communityId, actions]);
  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    if (!title.trim() || !when.trim()) return;
    const date = new Date(when);
    if (Number.isNaN(date.getTime())) { actions.toast('Data inválida.'); return; }
    try {
      await createCommunityEvent(communityId, uid, title.trim(), date.toISOString(), place.trim());
      setTitle(''); setWhen(''); setPlace('');
      await load();
      actions.toast('Evento criado');
    } catch (error: any) { actions.toast(error?.message || 'Não foi possível criar o evento.'); }
  };

  const toggle = async (eventId: string, value: boolean) => {
    try {
      await setCommunityEventRsvp(eventId, uid, value);
      setGoing((cur) => ({ ...cur, [eventId]: value }));
      actions.toast(value ? 'Presença confirmada!' : 'Presença cancelada.');
    } catch (error: any) { actions.toast(error?.message || 'Falha ao confirmar presença.'); }
  };

  return (
    <Section>
      <View style={styles.form}>
        <TextInput style={styles.input} placeholder="Título do evento" placeholderTextColor={colors.faint} value={title} onChangeText={setTitle} />
        <TextInput style={styles.input} placeholder="Data (YYYY-MM-DD HH:mm)" placeholderTextColor={colors.faint} value={when} onChangeText={setWhen} />
        <TextInput style={styles.input} placeholder="Local ou link" placeholderTextColor={colors.faint} value={place} onChangeText={setPlace} />
        <GhostButton title="Criar evento" icon="calendar-outline" onPress={() => void create()} />
      </View>
      {rows.length ? (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardBody}>{new Date(item.starts_at).toLocaleString('pt-BR')}</Text>
              {item.location ? <Text style={styles.cardBody}>📍 {item.location}</Text> : null}
              <GhostButton
                title={going[item.id] ? 'Cancelar presença' : 'Confirmar presença'}
                icon={going[item.id] ? 'close-circle-outline' : 'checkmark-circle-outline'}
                onPress={() => void toggle(item.id, !going[item.id])}
              />
            </View>
          )}
        />
      ) : (
        <EmptyState icon="calendar-outline" title="Sem eventos" text="Crie o primeiro evento da comunidade." />
      )}
    </Section>
  );
}

export function CommunityClassifieds({ communityId, uid }: Props) {
  const { actions } = useApp();
  const [rows, setRows] = useState<CommunityClassified[]>([]);
  const [filter, setFilter] = useState('todos');

  const load = useCallback(async () => {
    try { setRows(await fetchCommunityClassifieds(communityId)); }
    catch (error: any) { actions.toast(error?.message || 'Não foi possível carregar os anúncios.'); }
  }, [communityId, actions]);
  useEffect(() => { void load(); }, [load]);

  const shown = rows.filter((row) =>
    filter === 'todos' || (filter === 'active' ? (row.status || 'active') === 'active' : row.category === filter)
  );

  return (
    <Section>
      <View style={styles.filters}>
        {([['todos', 'Todos'], ['venda', 'Venda'], ['servico', 'Serviços'], ['trabalho', 'Trabalho'], ['active', 'Disponíveis']] as const).map(
          ([key, label]) => (
            <Pressable key={key} onPress={() => setFilter(key)} style={[styles.chip, filter === key && styles.chipOn]}>
              <Text style={[styles.chipText, filter === key && styles.chipTextOn]}>{label}</Text>
            </Pressable>
          )
        )}
      </View>
      {shown.length ? (
        <FlatList
          data={shown}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.badge}>{item.category}</Text>
                {item.status === 'sold' ? <Text style={styles.badgePrioridade}>Vendido</Text> : null}
              </View>
              <Text style={styles.cardTitle}>{item.title}</Text>
              {item.description ? <Text style={styles.cardBody}>{item.description}</Text> : null}
              {item.price ? <Text style={styles.price}>{item.price}</Text> : null}
              <View style={styles.row}>
                {item.author_id === uid ? (
                  <GhostButton
                    title={item.status === 'sold' ? 'Disponível' : 'Vendido'}
                    icon="checkmark-outline"
                    onPress={async () => {
                      await setCommunityClassifiedStatus(item.id, item.status === 'sold' ? 'active' : 'sold');
                      await load();
                    }}
                  />
                ) : (
                  <>
                    {item.contact ? (
                      <GhostButton title="Contato" icon="copy-outline" onPress={() => actions.toast(`Contato: ${item.contact}`)} />
                    ) : null}
                    <GhostButton
                      title="Denunciar"
                      icon="flag-outline"
                      onPress={() => Alert.prompt('Denunciar anúncio', 'Motivo da denúncia', (reason) => {
                        void reportCommunityClassified(item.id, uid, reason || '');
                        actions.toast('Denúncia enviada.');
                      })}
                    />
                  </>
                )}
              </View>
            </View>
          )}
        />
      ) : (
        <EmptyState icon="pricetag-outline" title="Sem anúncios" text="Os classificados da comunidade aparecem aqui." />
      )}
    </Section>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12, paddingHorizontal: spacing.lg, paddingTop: 12 },
  form: { gap: 8, padding: 12, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  input: { minHeight: 42, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, color: colors.text, fontSize: 14 },
  textarea: { minHeight: 80, textAlignVertical: 'top' },
  card: { gap: 6, padding: 12, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginBottom: 10 },
  cardPinned: { borderColor: colors.cyan },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  cardBody: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  cardImage: { width: '100%', height: 140, borderRadius: radius.md, marginTop: 6 },
  time: { color: colors.faint, fontSize: 11 },
  badge: { color: colors.cyan, fontSize: 11, fontWeight: '800' },
  badgePrioridade: { color: colors.pink, fontSize: 11, fontWeight: '800' },
  price: { color: colors.cyan, fontSize: 15, fontWeight: '800' },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  filters: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.surfaceAlt },
  chipOn: { backgroundColor: colors.primary },
  chipText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  chipTextOn: { color: '#fff' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tile: { width: '31%', aspectRatio: 1, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  tileImage: { width: '100%', height: '100%' },
  tileIcon: { position: 'absolute', right: 6, bottom: 6 },
});
