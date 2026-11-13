import { Client } from '@colyseus/sdk';
import { ArenaState } from './schema';

// Endereços do servidor da Arena. Em produção, configure VITE_ARENA_URL (ws://
// ou wss://) e VITE_ARENA_HTTP_URL (http:// ou https://). Em desenvolvimento,
// assume o servidor local na porta 2567 do mesmo host.
function envUrl(key) {
  try {
    return String(import.meta.env[key] || '').trim();
  } catch {
    return '';
  }
}

function defaultHost() {
  if (typeof window === 'undefined') return 'localhost';
  return window.location.hostname || 'localhost';
}

export const ARENA_WS_URL =
  envUrl('VITE_ARENA_URL') ||
  (typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1')
    ? `ws://${defaultHost()}:2567`
    : '');

export const ARENA_HTTP_URL = (
  envUrl('VITE_ARENA_HTTP_URL') ||
  (ARENA_WS_URL
    ? ARENA_WS_URL.replace(/^ws/, 'http').replace(/\/$/, '')
    : '')
).replace(/\/$/, '');

export const arenaConfigured = Boolean(ARENA_WS_URL);

let client = null;
export function getClient() {
  if (!arenaConfigured) return null;
  if (!client) client = new Client(ARENA_WS_URL);
  return client;
}

async function httpJson(path) {
  if (!ARENA_HTTP_URL) throw new Error('Servidor da Arena não configurado.');
  const response = await fetch(`${ARENA_HTTP_URL}${path}`, {
    headers: { Accept: 'application/json' },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.error || 'Servidor da Arena indisponível.');
  }
  return body;
}

export async function fetchRooms() {
  const body = await httpJson('/arena/rooms');
  return Array.isArray(body?.rooms) ? body.rooms : [];
}

export async function resolveRoomCode(code) {
  const clean = String(code || '').trim().toUpperCase();
  if (!clean) throw new Error('Informe o código da sala.');
  const body = await httpJson(`/arena/resolve?code=${encodeURIComponent(clean)}`);
  return body?.room || null;
}

export function joinOptions(extra = {}) {
  return { ...extra };
}

export { ArenaState };
