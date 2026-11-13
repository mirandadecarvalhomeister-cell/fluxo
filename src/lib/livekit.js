import { supabase, supabaseAnonKey, supabaseUrl } from './supabase';

export const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL || '';
export const isLiveKitEnabled = Boolean(LIVEKIT_URL && supabase);

export async function fetchLiveToken(room, role = 'viewer') {
  if (!isLiveKitEnabled) {
    throw new Error('LiveKit não configurado. Defina VITE_LIVEKIT_URL.');
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;

  const accessToken = data?.session?.access_token;
  if (!accessToken) {
    throw new Error('Entre na sua conta para participar da live.');
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/livekit-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ room, role }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.error || 'Não foi possível entrar na live.');
  }
  if (!body?.token) {
    throw new Error('Token da live não recebido.');
  }

  return { token: body.token, url: body.url || LIVEKIT_URL };
}

// Cria/reaproveita o Ingress RTMP do palco para transmissão pelo OBS. Só o dono
// do palco pode chamar; a URL e a chave são geradas no servidor pelo LiveKit.
export async function fetchIngress(room, reset = false) {
  if (!isLiveKitEnabled) {
    throw new Error('LiveKit não configurado. Defina VITE_LIVEKIT_URL.');
  }
  if (!room) throw new Error('Palco inválido.');

  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;

  const accessToken = data?.session?.access_token;
  if (!accessToken) {
    throw new Error('Entre na sua conta para configurar o OBS.');
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/livekit-ingress`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ room, reset }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.error || 'Não foi possível preparar o Ingress RTMP.');
  }
  if (!body?.url || !body?.key) {
    throw new Error('O servidor não retornou a URL do Ingress.');
  }

  return { url: body.url, key: body.key, ingressId: body.ingressId || '' };
}
