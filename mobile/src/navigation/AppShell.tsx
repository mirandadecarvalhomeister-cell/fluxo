import React, { useEffect, useRef } from 'react';
import { Animated, Dimensions, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useApp, Tab } from '../context/AppContext';
import { colors } from '../lib/theme';
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

const TABS: Tab[] = ['home', 'explore', 'create', 'messages', 'profile'];
const TAB_META: { id: Tab; icon: React.ComponentProps<typeof Ionicons>['name']; label: string }[] = [
  { id: 'home', icon: 'home', label: 'Início' },
  { id: 'explore', icon: 'search', label: 'Buscar' },
  { id: 'create', icon: 'add', label: 'Criar' },
  { id: 'messages', icon: 'chatbubble', label: 'Mensagens' },
  { id: 'profile', icon: 'person', label: 'Perfil' },
];

const { width: SCREEN_W } = Dimensions.get('window');
const EDGE = 34;
const SWIPE_DISTANCE = 64;

export default function AppShell() {
  const { route, stack, profile, unreadMessages, toastMessage, actions } = useApp();
  const top = stack[stack.length - 1];
  const stackKey = top ? `${top.name}:${(top as any).postId || (top as any).userId || (top as any).channelId || ''}` : '';

  const overlayAnim = useRef(new Animated.Value(0)).current;
  const tabAnim = useRef(new Animated.Value(1)).current;
  const prevRoute = useRef(route);

  useEffect(() => {
    if (stackKey) {
      overlayAnim.setValue(0);
      Animated.spring(overlayAnim, { toValue: 1, friction: 12, tension: 120, useNativeDriver: true }).start();
    } else {
      overlayAnim.setValue(0);
    }
  }, [stackKey, overlayAnim]);

  useEffect(() => {
    if (prevRoute.current !== route) {
      prevRoute.current = route;
      tabAnim.setValue(0);
      Animated.timing(tabAnim, { toValue: 1, duration: 170, useNativeDriver: true }).start();
    }
  }, [route, tabAnim]);

  // Navegação por gesto: swipe da borda esquerda volta; da borda direita troca de aba.
  const nav = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => {
        const horizontal = Math.abs(g.dx) > 16 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5;
        return horizontal && (g.x0 <= EDGE || g.x0 >= SCREEN_W - EDGE);
      },
      onPanResponderRelease: (_, g) => {
        const fromLeft = g.x0 <= EDGE;
        const fromRight = g.x0 >= SCREEN_W - EDGE;
        if (g.dx > SWIPE_DISTANCE && fromLeft) {
          if (stack.length) actions.pop();
          else {
            const i = TABS.indexOf(route);
            if (i > 0) actions.go(TABS[i - 1]);
          }
        } else if (g.dx < -SWIPE_DISTANCE && fromRight && !stack.length) {
          const i = TABS.indexOf(route);
          if (i >= 0 && i < TABS.length - 1) actions.go(TABS[i + 1]);
        }
      },
    })
  ).current;

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
    <View style={styles.root} {...nav.panHandlers}>
      <Animated.View style={[styles.content, { opacity: tabAnim }]}>
        {route === 'home' && <HomeScreen />}
        {route === 'explore' && <ExploreScreen />}
        {route === 'create' && <CreateScreen />}
        {route === 'messages' && <MessagesScreen />}
        {route === 'profile' && <ProfileScreen />}
      </Animated.View>

      {overlay ? (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              opacity: overlayAnim,
              transform: [{ translateX: overlayAnim.interpolate({ inputRange: [0, 1], outputRange: [SCREEN_W * 0.22, 0] }) }],
            },
          ]}
        >
          {overlay}
        </Animated.View>
      ) : null}

      {showTabs ? (
        <SafeAreaView edges={['bottom']} style={styles.tabBarWrap}>
          <View style={styles.tabBar}>
            {TAB_META.map((tab) => {
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
                      <Ionicons name="add" size={25} color="#fff" />
                    </View>
                  ) : isProfile ? (
                    <View style={[styles.avatarRing, active && styles.avatarRingActive]}>
                      <AvatarView user={profile} size={24} />
                    </View>
                  ) : (
                    <View>
                      <Ionicons
                        name={active ? tab.icon : ((tab.icon + '-outline') as any)}
                        size={22}
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
    paddingTop: 4,
    paddingBottom: 2,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  tab: { alignItems: 'center', justifyContent: 'center', gap: 1, flex: 1, minHeight: 44 },
  tabLabel: { color: colors.muted, fontSize: 10, fontWeight: '600' },
  createBtn: {
    width: 42,
    height: 30,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 1,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -10,
    minWidth: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: colors.pink,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  avatarRing: { borderRadius: 14, padding: 1 },
  avatarRingActive: { borderWidth: 2, borderColor: colors.text },
});
