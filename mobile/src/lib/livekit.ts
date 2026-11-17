import { supabase } from './supabase';
import { LIVEKIT_URL, SUPABASE_ANON_KEY, SUPABASE_URL, isLiveKitConfigured } from './env';

/**
 * Pede um token de sala ao mesmo Edge Function usado pelo site
 * (supabase/functions/livekit-token). role = 'host' publica câmera/microfone;
 * role = 'viewer' apenas assina as faixas remotas.
 */
export async function fetchLiveToken(room: string, role: 'host' | 'viewer' = 'viewer') {
  if (!isLiveKitConfigured) throw new Error('LiveKit não configurado no app.');
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const accessToken = data?.session?.access_token;
  if (!accessToken) throw new Error('Entre na sua conta para entrar na live.');

  const response = await fetch(`${SUPABASE_URL}/functions/v1/livekit-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ room, role }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || 'Não foi possível entrar na live.');
  if (!body?.token) throw new Error('Token da live não recebido.');
  return { token: String(body.token), url: String(body.url || LIVEKIT_URL) };
}
