// Integração mínima com o Supabase usando a API REST. O servidor da Arena
// nunca aceita identidade declarada pelo navegador: o token do Supabase é
// conferido em /auth/v1/user antes de qualquer entrada na sala.
const SUPABASE_URL = (
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  ''
).replace(/\/$/, '');
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const hasSupabaseAuth = Boolean(SUPABASE_URL && ANON_KEY);
export const hasSupabasePersistence = Boolean(SUPABASE_URL && SERVICE_KEY);

function headers(key, extra = {}) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function request(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    return await fetch(`${SUPABASE_URL}${path}`, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function verifyAccessToken(token) {
  if (!hasSupabaseAuth) return null;
  if (!token) throw new Error('Faça login no Fluxo para jogar.');
  const response = await request('/auth/v1/user', {
    headers: headers(ANON_KEY, { Authorization: `Bearer ${token}` }),
  });
  if (!response.ok) throw new Error('Sessão expirada. Entre novamente no Fluxo.');
  const user = await response.json();
  if (!user?.id) throw new Error('Sessão inválida.');
  return user;
}

export async function loadProfile(userId, token = '') {
  if (!SUPABASE_URL) return null;
  const key = SERVICE_KEY || ANON_KEY;
  if (!key) return null;
  try {
    const response = await request(
      `/rest/v1/profiles?user_id=eq.${encodeURIComponent(userId)}&select=name,handle,avatar_url&limit=1`,
      {
        headers: headers(
          key,
          token ? { Authorization: `Bearer ${token}` } : {}
        ),
      }
    );
    if (!response.ok) return null;
    const rows = await response.json();
    return Array.isArray(rows) ? rows[0] || null : null;
  } catch (error) {
    console.warn('[arena] perfil indisponível:', error?.message || error);
    return null;
  }
}

async function insert(table, rows, conflict = '') {
  if (!hasSupabasePersistence) return false;
  const suffix = conflict ? `?on_conflict=${conflict}` : '';
  const response = await request(`/rest/v1/${table}${suffix}`, {
    method: 'POST',
    headers: headers(SERVICE_KEY, {
      Prefer: 'resolution=ignore-duplicates,return=minimal',
    }),
    body: JSON.stringify(rows),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    console.warn(`[arena] falha ao salvar ${table}:`, response.status, text);
    return false;
  }
  return true;
}

/**
 * Persiste uma partida encerrada. O id da partida é gerado pelo servidor e a
 * chave única em game_matches impede resultados duplicados em caso de
 * reconexão ou repetição de requisições.
 */
export async function persistMatch(match) {
  if (!hasSupabasePersistence) return false;
  const saved = await insert(
    'game_matches',
    [
      {
        id: match.id,
        game: 'arena-do-caos',
        mode: 'last-survivor',
        room_code: match.roomCode,
        visibility: match.visibility,
        player_count: match.playerCount,
        winner_id: match.winnerId || null,
        winner_name: match.winnerName || null,
        started_at: new Date(match.startedAt).toISOString(),
        ended_at: new Date(match.endedAt).toISOString(),
        duration_ms: match.durationMs,
      },
    ],
    'id'
  );
  if (!saved) return false;

  const players = match.players.map((player) => {
    const realUserId =
      player.id && !String(player.id).startsWith('local:') ? player.id : null;
    const winnerUserId =
      match.winnerId && !String(match.winnerId).startsWith('local:')
        ? match.winnerId
        : null;
    return {
      match_id: match.id,
      user_id: realUserId,
      name: player.name,
      handle: player.handle || '',
      placement: player.rank || null,
      kills: player.kills || 0,
      damage: player.damage || 0,
      survived_ms: player.survivedMs || 0,
      is_winner: Boolean(realUserId && winnerUserId && realUserId === winnerUserId),
      played_at: new Date(match.endedAt).toISOString(),
    };
  });
  if (players.length) {
    await insert('game_match_players', players, 'match_id,user_id');
  }
  return true;
}
