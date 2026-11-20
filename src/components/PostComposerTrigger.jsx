import { useApp } from '../store/AppContext';
import { Avatar } from './Avatar';
import { Icon } from './Icon';

/**
 * Caixa compacta e clicável exibida no feed. Toda a área funciona como botão
 * de abertura do card de criação (PostComposerModal).
 */
export default function PostComposerTrigger() {
  const { data, ui, actions } = useApp();
  const text = String(ui.draft?.text || '').trim();
  const placeholder = text || `O que está rolando no seu fluxo, ${data.me.name.split(' ')[0]}? Use @ para mencionar alguém.`;

  return (
    <button
      type="button"
      className="card composer-trigger"
      onClick={() => actions.openComposer()}
      aria-label="Abrir card de criação de publicação"
      data-autofocus
    >
      <Avatar user={data.me} size={44} />
      <span className="composer-trigger-field">{placeholder}</span>
      <span className="composer-trigger-plus" aria-hidden="true">
        <Icon name="plus" />
      </span>
    </button>
  );
}
