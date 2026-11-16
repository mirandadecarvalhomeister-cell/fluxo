import { LIVEKIT_URL, isLiveKitConfigured } from './env';
import { supabase } from './supabase';

export async function fetchLiveToken(room: string, role: 'host' | 'viewer') {
  if (!isLiveKitConfigured) {
    throw new Error('LiveKit não configurado. Defina EXPO_PUBLIC_LIVEKIT_URL.');
  }
  if (!room) throw new Error('Sala inválida.');

  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error('Entre na sua conta para participar da live.');

  const response = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/livekit-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ room, role }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || 'Não foi possível entrar na live.');
  if (!body?.token) throw new Error('O servidor não devolveu o token da live.');
  return { token: String(body.token), url: String(body.url || LIVEKIT_URL) };
}
