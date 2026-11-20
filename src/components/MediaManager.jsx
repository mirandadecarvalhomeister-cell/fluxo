import { useRef, useState } from 'react';
import { mediaDisplayStyle } from '../lib/mediaEdit';
import { EditOverlay } from './MediaEditor';
import { Icon } from './Icon';

/**
 * Gerenciador visual das mídias do rascunho: seleção por clique/arraste,
 * reordenação, capa, ampliação, edição e remoção.
 */
export default function MediaManager({
  media = [],
  onFiles,
  onEdit,
  onRemove,
  onReorder,
  onCover,
  max = 10,
}) {
  const [lightbox, setLightbox] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const draggedRef = useRef(null);

  const accept = (files) => {
    const list = Array.from(files || []).filter(
      (file) => file.type.startsWith('image/') || file.type.startsWith('video/')
    );
    if (list.length) onFiles?.(list);
  };

  return (
    <div className="media-manager">
      <div
        className={`media-drop${dragOver ? ' over' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          accept(event.dataTransfer?.files);
        }}
      >
        <Icon name="image" />
        <span>Arraste fotos e vídeos para cá</span>
        <small>{media.length}/{max} mídias · clique para escolher arquivos</small>
        <label className="btn tonal sm">
          Adicionar mídias
          <input
            type="file"
            accept="image/*,video/*"
            multiple
            hidden
            onChange={(event) => {
              accept(event.target.files);
              event.target.value = '';
            }}
          />
        </label>
      </div>

      {media.length ? (
        <div className="cprev-list" aria-label="Mídias selecionadas">
          {media.map((item, index) => (
            <div
              className={`cprev-item${index === 0 ? ' cover' : ''}`}
              key={`${item.src}-${index}`}
              draggable
              onDragStart={() => { draggedRef.current = index; }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                const from = draggedRef.current;
                draggedRef.current = null;
                if (from !== null && from !== undefined && from !== index) onReorder?.(from, index);
              }}
            >
              <button
                type="button"
                className="cprev-open"
                onClick={() => setLightbox(index)}
                aria-label={`Ampliar mídia ${index + 1}`}
              >
                {item.edit ? (
                  <span className="cprev-frame">
                    {item.kind === 'photo' ? (
                      <img src={item.src} alt="" style={mediaDisplayStyle(item.edit)} />
                    ) : (
                      <video src={item.src} muted playsInline preload="metadata" style={mediaDisplayStyle(item.edit)} />
                    )}
                    <EditOverlay edit={item.edit} />
                  </span>
                ) : item.kind === 'photo' ? (
                  <img src={item.src} alt={`Mídia ${index + 1}`} />
                ) : (
                  <video src={item.src} muted playsInline preload="metadata" />
                )}
              </button>
              <span className="cprev-tag">
                {item.kind === 'photo' ? <Icon name="image" /> : <Icon name="video" />}
              </span>
              {index === 0 ? <span className="cprev-cover">Capa</span> : null}
              <button
                type="button"
                className="cprev-edit"
                onClick={() => onEdit?.(index)}
                aria-label="Editar mídia"
                title="Editar mídia"
              >
                <Icon name="edit" />
              </button>
              {index !== 0 ? (
                <button
                  type="button"
                  className="cprev-cover-btn"
                  onClick={() => onCover?.(index)}
                  aria-label="Definir como capa"
                  title="Definir como capa"
                >
                  <Icon name="check" />
                </button>
              ) : null}
              <button
                type="button"
                className="x"
                onClick={() => onRemove?.(index)}
                aria-label="Remover mídia"
              >
                <Icon name="x" />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {lightbox !== null && media[lightbox] ? (
        <div className="media-lightbox" role="dialog" aria-modal="true" onClick={() => setLightbox(null)}>
          <button type="button" className="icon-btn" onClick={() => setLightbox(null)} aria-label="Fechar">
            <Icon name="x" />
          </button>
          {media[lightbox].kind === 'video' ? (
            <video src={media[lightbox].src} controls autoPlay onClick={(event) => event.stopPropagation()} />
          ) : (
            <img src={media[lightbox].src} alt="Mídia ampliada" onClick={(event) => event.stopPropagation()} />
          )}
          {media.length > 1 ? (
            <div className="media-lightbox-nav" onClick={(event) => event.stopPropagation()}>
              <button type="button" onClick={() => setLightbox((i) => (i - 1 + media.length) % media.length)} aria-label="Anterior">
                <Icon name="back" />
              </button>
              <span>{lightbox + 1} / {media.length}</span>
              <button type="button" onClick={() => setLightbox((i) => (i + 1) % media.length)} aria-label="Próxima">
                <Icon name="back" className="flip" />
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
