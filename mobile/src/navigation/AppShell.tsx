import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useApp, Tab } from '../context/AppContext';
import { colors, radius } from '../lib/theme';
import { AvatarView, Toast } from '../components/Ui';
import HomeScreen from '../screens/HomeScreen';
import ExploreScreen from '../screens/ExploreScreen';
import CreateScreen from '../screens/CreateScreen';
import MessagesScreen from '../screens/MessagesScreen';
import ProfileScreen from '../screens/ProfileScreen';
import ReelsScreen from '../screens/ReelsScreen';
import PostScreen from '../screens/PostScreen';
import CommentsScreen from '../screens/CommentsScreen';
import ChatScreen from '../screens/ChatScreen';
import UserScreen from '../screens/UserScreen';
import EditProfileScreen from '../screens/EditProfileScreen';
import ConnectionsScreen from '../screens/ConnectionsScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import ShareToChatScreen from '../screens/ShareToChatScreen';
import LiveScreen from '../screens/LiveScreen';
import QuizScreen from '../screens/QuizScreen';

const TABS: { id: Tab; icon: React.ComponentProps<typeof Ionicons>['name']; label: string }[] = [
  { id: 'home', icon: 'home', label: 'Início' },
  { id: 'explore', icon: 'search', label: 'Buscar' },
  { id: 'create', icon: 'add', label: 'Criar' },
  { id: 'messages', icon: 'chatbubble', label: 'Mensagens' },
  { id: 'profile', icon: 'person', label: 'Perfil' },
];

export default function AppShell() {
  const { route, stack, profile, unreadMessages, toastMessage, actions } = useApp();
  const top = stack[stack.length - 1];

  let overlay: React.ReactNode = null;
  if (top) {
    switch (top.name) {
      case 'reels':
        overlay = <ReelsScreen postId={top.postId} />;
        break;
      case 'post':
        overlay = <PostScreen postId={top.postId} />;
        break;
      case 'comments':
        overlay = <CommentsScreen postId={top.postId} />;
        break;
      case 'chat':
        overlay = <ChatScreen userId={top.userId} />;
        break;
      case 'user':
        overlay = <UserScreen userId={top.userId} />;
        break;
      case 'editProfile':
        overlay = <EditProfileScreen />;
        break;
      case 'connections':
        overlay = <ConnectionsScreen userId={top.userId} mode={top.mode} />;
        break;
      case 'notifications':
        overlay = <NotificationsScreen />;
        break;
      case 'settings':
        overlay = <SettingsScreen />;
        break;
      case 'shareToChat':
        overlay = <ShareToChatScreen postId={top.postId} />;
        break;
      case 'live':
        overlay = <LiveScreen channelId={top.channelId} host={top.host} />;
        break;
      case 'quiz':
        overlay = <QuizScreen challengeId={top.challengeId} inviteId={top.inviteId} />;
        break;
      default:
        overlay = null;
    }
  }

  const showTabs = !top;

  return (
    <View style={styles.root}>
      <View style={styles.content}>
        {route === 'home' && <HomeScreen />}
        {route === 'explore' && <ExploreScreen />}
        {route === 'create' && <CreateScreen />}
        {route === 'messages' && <MessagesScreen />}
        {route === 'profile' && <ProfileScreen />}
      </View>

      {overlay ? <View style={StyleSheet.absoluteFill}>{overlay}</View> : null}

      {showTabs ? (
        <SafeAreaView edges={['bottom']} style={styles.tabBarWrap}>
          <View style={styles.tabBar}>
            {TABS.map((tab) => {
              const active = route === tab.id;
              const isCreate = tab.id === 'create';
              const isProfile = tab.id === 'profile';
              return (
                <Pressable
                  key={tab.id}
                  accessibilityRole="button"
                  accessibilityLabel={tab.label}
                  onPress={() => actions.go(tab.id)}
                  style={({ pressed }) => [styles.tab, pressed && { opacity: 0.8 }]}
                >
                  {isCreate ? (
                    <View style={styles.createBtn}>
                      <Ionicons name="add" size={28} color="#fff" />
                    </View>
                  ) : isProfile ? (
                    <View style={[styles.avatarRing, active && styles.avatarRingActive]}>
                      <AvatarView user={profile} size={26} />
                    </View>
                  ) : (
                    <View>
                      <Ionicons
                        name={active ? tab.icon : ((tab.icon + '-outline') as any)}
                        size={24}
                        color={active ? colors.text : colors.muted}
                      />
                      {tab.id === 'messages' && unreadMessages > 0 ? (
                        <View style={styles.badge}>
                          <Text style={styles.badgeText}>{unreadMessages > 9 ? '9+' : unreadMessages}</Text>
                        </View>
                      ) : null}
                    </View>
                  )}
                  <Text style={[styles.tabLabel, active && { color: colors.text }]}>{tab.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </SafeAreaView>
      ) : null}

      <Toast message={toastMessage} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1 },
  tabBarWrap: { backgroundColor: colors.surface },
  tabBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 4,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  tab: { alignItems: 'center', justifyContent: 'center', gap: 2, flex: 1, minHeight: 52 },
  tabLabel: { color: colors.muted, fontSize: 11, fontWeight: '600' },
  createBtn: {
    width: 46,
    height: 34,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -10,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.pink,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  avatarRing: { borderRadius: 15, padding: 1 },
  avatarRingActive: { borderWidth: 2, borderColor: colors.text },
});
