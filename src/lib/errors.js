/** Catálogo de mensagens compreensíveis para falhas comuns. */
const MESSAGES = [
  [/failed to fetch|networkerror|network request failed|offline/i, 'Sem conexão. Verifique sua internet e tente novamente.'],
  [/jwt|expired|401|unauthorized|token/i, 'Sua sessão expirou. Entre novamente para continuar.'],
  [/permission|denied|not allowed|403/i, 'Você não tem permissão para fazer isso.'],
  [/payload too large|413|file too big|muito grande/i, 'Arquivo muito grande. Escolha um arquivo menor.'],
  [/storage quota|insufficient|espaco/i, 'Sem espaço suficiente no servidor. Tente novamente mais tarde.'],
  [/duplicate|unique violation|23505|já existe/i, 'Isso já foi registrado. Atualize a página para ver as mudanças.'],
  [/rate limit|429|muitas tentativas/i, 'Muitas tentativas em pouco tempo. Aguarde um instante.'],
];

export function friendlyError(error, fallback = 'Algo saiu do fluxo. Tente novamente.') {
  const raw =
    typeof error === 'string'
      ? error
      : error?.message || error?.error?.message || error?.error_description || '';
  if (!raw) return fallback;
  const match = MESSAGES.find(([pattern]) => pattern.test(raw));
  return match ? match[1] : fallback;
}
