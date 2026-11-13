// Cria (ou reaproveita) um Ingress RTMP do LiveKit para o palco do dono.
// O navegador nunca recebe a API key/secret do LiveKit: elas ficam apenas nos
// secrets da Edge Function. A identidade é conferida pelo token do Supabase e a
// posse do palco é validada em public.channels antes de qualquer chamada.
import { IngressClient, IngressInput } from 'npm:livekit-server-sdk@2';
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

// O IngressClient espera https://<projeto>.livekit.cloud; o secret costuma
// vir como wss://. Normaliza sem alterar o host.
function livekitHost() {
  return String(Deno.env.get('LIVEKIT_URL') || '')
    .trim()
    .replace(/^ws/, 'http')
    .replace(/\/$/, '');
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  try {
    const authorization = request.headers.get('Authorization') || '';
    const jwt = authorization.replace(/^Bearer\s+/i, '');
    if (!jwt) return json({ error: 'Não autenticado.' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
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
    const reset = Boolean(body?.reset);

    if (!room || room.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(room)) {
      return json({ error: 'Sala inválida.' }, 400);
    }

    const { data: channel, error: channelError } = await supabase
      .from('channels')
      .select('owner_id')
      .eq('id', room)
      .maybeSingle();
    if (channelError) return json({ error: channelError.message }, 500);
    if (!channel || channel.owner_id !== userData.user.id) {
      return json({ error: 'Você não é o dono deste palco.' }, 403);
    }

    const apiKey = Deno.env.get('LIVEKIT_API_KEY');
    const apiSecret = Deno.env.get('LIVEKIT_API_SECRET');
    const host = livekitHost();
    if (!apiKey || !apiSecret || !host) {
      return json({ error: 'LiveKit não configurado no servidor.' }, 500);
    }

    // Leitura/gravação da tabela privada do ingress com service_role.
    const admin = createClient(supabaseUrl, serviceKey || supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const ingressClient = new IngressClient(host, apiKey, apiSecret);

    let existing = null;
    if (serviceKey) {
      const { data } = await admin
        .from('channel_ingress')
        .select('ingress_id,url,stream_key')
        .eq('channel_id', room)
        .maybeSingle();
      existing = data || null;
    }

    if (existing && !reset) {
      return json({
        url: existing.url,
        key: existing.stream_key,
        ingressId: existing.ingress_id,
        created: false,
      });
    }

    // Ao recriar, remove o ingress antigo para não acumular no LiveKit.
    if (existing?.ingress_id) {
      await ingressClient.deleteIngress(existing.ingress_id).catch(() => {});
    }

    const ingress = await ingressClient.createIngress(IngressInput.RTMP_INPUT, {
      name: `fluxo-${room}`,
      roomName: room,
      participantIdentity: `obs-${userData.user.id}`,
      participantName: 'OBS',
    });

    const url = ingress.url || '';
    const key = ingress.streamKey || '';
    if (!url || !key) {
      return json({ error: 'O LiveKit não retornou a URL do Ingress.' }, 502);
    }

    if (serviceKey) {
      await admin.from('channel_ingress').upsert(
        {
          channel_id: room,
          owner_id: userData.user.id,
          ingress_id: ingress.ingressId,
          url,
          stream_key: key,
          created_at: new Date().toISOString(),
        },
        { onConflict: 'channel_id' }
      );
    }

    return json({ url, key, ingressId: ingress.ingressId, created: true });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Erro ao preparar o Ingress RTMP.' },
      500
    );
  }
});
