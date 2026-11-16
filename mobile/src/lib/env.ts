export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const LIVEKIT_URL = process.env.EXPO_PUBLIC_LIVEKIT_URL ?? '';

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export const isLiveKitConfigured = Boolean(LIVEKIT_URL);

// Domínio público do Fluxo. Os links compartilhados abrem o site e também
// podem abrir o app via App Links quando o domínio estiver verificado.
export const PUBLIC_WEB_URL =
  process.env.EXPO_PUBLIC_PUBLIC_WEB_URL || 'https://vibefluxo.com';

export const APP_VERSION = '1.0.0';
