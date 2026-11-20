import { useApp } from '../store/AppContext';
import { Avatar } from './Avatar';
import { Verified } from './Brand';
import { Composer } from './Feed';
import PostPreview from './PostPreview';

/**
 * Card de criação de publicação. Nesta etapa contém apenas a estrutura inicial:
 * título, identificação do autor e área reservada para o futuro editor.
 * O comportamento de abrir/fechar é reaproveitado do ModalHost.
 */
export default function PostComposerModal() {
  const { data, ui } = useApp();
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

      <h2 className="composer-modal-title">Criar publicação</h2>
      <div className="composer-modal-layout">
        <div className="composer-modal-body">
          <Composer inModal />
        </div>
        <PostPreview draft={ui.draft} />
      </div>
    </div>
  );
}
