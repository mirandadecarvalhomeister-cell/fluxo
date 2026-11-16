import { Share } from 'react-native';
import { PUBLIC_WEB_URL } from './env';

type ShareInput = {
  title?: string;
  text?: string;
  url?: string;
  dialogTitle?: string;
};

export async function shareLink({ title = 'Fluxo', text = '', url, dialogTitle = 'Compartilhar' }: ShareInput) {
  const full = [text, url].filter(Boolean).join('\n\n');
  try {
    const result = await Share.share(
      { title, message: full, ...(url ? { url } : {}) },
      { dialogTitle, subject: title }
    );
    return result.action === Share.sharedAction ? 'shared' : 'cancelled';
  } catch {
    return 'error';
  }
}

export function postLink(postId: string) {
  return `${PUBLIC_WEB_URL}/#feed/post/${encodeURIComponent(postId)}`;
}

export async function sharePostLink(postId: string, text: string) {
  return shareLink({
    title: 'Fluxo',
    text: text ? `${text}\n\nVeja no Fluxo:` : 'Veja esta publicação no Fluxo:',
    url: postLink(postId),
    dialogTitle: 'Compartilhar publicação',
  });
}

export function profileLink(userId: string) {
  return `${PUBLIC_WEB_URL}/#perfil/${encodeURIComponent(userId)}`;
}

export function quizInviteLink(userId: string) {
  return `${PUBLIC_WEB_URL}/#conexoes/quiz?convite=${encodeURIComponent(userId || '')}`;
}

export function quizChallengeLink(id: string) {
  return `${PUBLIC_WEB_URL}/#conexoes/quiz?desafio=${encodeURIComponent(id || '')}`;
}
