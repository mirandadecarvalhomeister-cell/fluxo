import { AccessToken } from 'npm:livekit-server-sdk@2';
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  try {
    const authorization = request.headers.get('Authorization') || '';
    const jwt = authorization.replace(/^Bearer\s+/i, '');
    if (!jwt) return json({ error: 'Não autenticado.' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!supabaseUrl || !supabaseAnonKey) {
      return json({ error: 'Supabase não configurado no servidor.' }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });

    const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
    if (userError || !userData?.user) {
      return json({ error: 'Sessão inválida.' }, 401);
    }

    const body = await request.json().catch(() => ({}));
    const room = typeof body?.room === 'string' ? body.room.trim() : '';
    const role = body?.role === 'host' ? 'host' : 'viewer';

    if (!room || room.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(room)) {
      return json({ error: 'Sala inválida.' }, 400);
    }

    if (role === 'host') {
      const { data: channel, error: channelError } = await supabase
        .from('channels')
        .select('owner_id')
        .eq('id', room)
        .maybeSingle();

      if (channelError) return json({ error: channelError.message }, 500);
      if (!channel || channel.owner_id !== userData.user.id) {
        return json({ error: 'Você não é o dono deste palco.' }, 403);
      }
    }

    const apiKey = Deno.env.get('LIVEKIT_API_KEY');
    const apiSecret = Deno.env.get('LIVEKIT_API_SECRET');
    if (!apiKey || !apiSecret) {
      return json({ error: 'LiveKit não configurado no servidor.' }, 500);
    }

    const accessToken = new AccessToken(apiKey, apiSecret, {
      identity: userData.user.id,
      name: userData.user.user_metadata?.name || userData.user.email || 'Convidado',
      ttl: '2h',
    });

    accessToken.addGrant({
      roomJoin: true,
      room,
      canPublish: role === 'host',
      canSubscribe: true,
    });

    return json({
      token: await accessToken.toJwt(),
      url: Deno.env.get('LIVEKIT_URL') || null,
    });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Erro ao gerar token.' },
      500
    );
  }
});
