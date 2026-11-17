-- Canais criados pelo app mobile com kind='live' quebravam o site (KINDS não
-- conhecia esse valor). Normaliza para 'palco', o tipo de palco ao vivo usado
-- pelo site e pelo app. Idempotente.
update public.channels
set kind = 'palco'
where kind = 'live';
