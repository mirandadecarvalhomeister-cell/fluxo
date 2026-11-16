export type DeepLink =
  | { name: 'post'; id: string }
  | { name: 'profile'; id: string }
  | { name: 'live'; id: string }
  | { name: 'messages'; id?: string }
  | { name: 'quiz'; challengeId?: string; inviteId?: string }
  | { name: 'reset' }
  | null;

const decode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

// Aceita fluxo://post/123, fluxo://perfil/123, https://vibefluxo.com/#feed/post/123,
// https://vibefluxo.com/#conexoes/quiz?desafio=abc etc.
export function parseDeepLink(raw: string | null | undefined): DeepLink {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  const hash = url.hash.replace(/^#/, '');
  const [hashPath, hashQuery] = hash.split('?');
  const hashParts = hashPath.split('/').filter(Boolean).map((part) => part.toLowerCase());
  const hashParams = new URLSearchParams(hashQuery || '');

  if (hashParts[0] === 'conexoes' && hashParts[1] === 'quiz') {
    return {
      name: 'quiz',
      challengeId: hashParams.get('desafio') || hashParams.get('challenge') || undefined,
      inviteId: hashParams.get('convite') || hashParams.get('invite') || undefined,
    };
  }
  if (hashParts[0] === 'feed' && hashParts[1] === 'post' && hashParts[2]) {
    return { name: 'post', id: decode(hashParts[2]) };
  }
  if (hashParts[0] === 'perfil' && hashParts[1]) {
    return { name: 'profile', id: decode(hashParts[1]) };
  }
  if (hashParts[0] === 'mensagens') {
    return { name: 'messages', id: hashParts[1] ? decode(hashParts[1]) : undefined };
  }

  const parts = [url.hostname, ...url.pathname.split('/')].filter(Boolean).map((part) => part.toLowerCase());
  const head = parts[0] || '';
  const id = url.searchParams.get('id') || parts[1] || '';

  if (head === 'redefinir-senha' || head === 'reset-password') return { name: 'reset' };
  if (['post', 'p', 'publicacao'].includes(head) && id) return { name: 'post', id: decode(id) };
  if (['perfil', 'profile', 'u', 'user'].includes(head) && id) return { name: 'profile', id: decode(id) };
  if (['live', 'lives'].includes(head) && id) return { name: 'live', id: decode(id) };
  if (['mensagens', 'messages', 'chat'].includes(head)) return { name: 'messages', id: id ? decode(id) : undefined };
  if (['quiz', 'quizboom'].includes(head)) {
    return {
      name: 'quiz',
      challengeId: url.searchParams.get('desafio') || url.searchParams.get('challenge') || undefined,
      inviteId: url.searchParams.get('convite') || url.searchParams.get('invite') || undefined,
    };
  }
  return null;
}
