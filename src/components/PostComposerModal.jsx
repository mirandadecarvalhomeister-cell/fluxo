import { useApp } from '../store/AppContext';
import { Avatar } from './Avatar';
import { Verified } from './Brand';
import { Composer } from './Feed';

/**
 * Card de criação de publicação. Nesta etapa contém apenas a estrutura inicial:
 * título, identificação do autor e área reservada para o futuro editor.
 * O comportamento de abrir/fechar é reaproveitado do ModalHost.
 */
export default function PostComposerModal() {
  const { data } = useApp();
  const me = data.me;

  return (
    <div className="composer-modal">
      <header className="composer-modal-head">
        <Avatar user={me} size={44} />
        <div className="composer-modal-id">
          <b>
            {me.name} <Verified user={me} />
          </b>
          <span>@{me.handle || 'você'} · visível para todos</span>
        </div>
      </header>

      <div className="composer-modal-body">
        <h2>Criar publicação</h2>
        <Composer inModal />
      </div>
    </div>
  );
}
