import { useEffect, useRef, useState } from 'react';
import { STICKER_PACKS } from '../lib/stickers';
import { useApp } from '../store/AppContext';
import { Icon } from './Icon';

// Seletor de figurinhas com pacotes prontos + pacotes personalizados estilo
// WhatsApp. As figurinhas personalizadas ficam no bucket público `media`.
export default function StickerPicker({ onPick, onClose, embedded = false }) {
  const { data, actions } = useApp();
  const custom = data.customStickerPacks || [];
  const packs = [...STICKER_PACKS, ...custom];
  const [active, setActive] = useState(packs[0]?.id);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const fileRef = useRef(null);

  const pack = packs.find((item) => item.id === active) || packs[0];
  const isCustom = !!pack?.custom;

  useEffect(() => {
    if (!packs.some((item) => item.id === active)) setActive(packs[0]?.id);
  }, [packs, active]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submitPack = async (event) => {
    event.preventDefault();
    const created = await actions.createStickerPack(name);
    if (created) {
      setActive(created.id);
      setName('');
      setCreating(false);
    }
  };

  const pickFile = (event) => {
    const file = event.target.files?.[0];
    if (file) actions.addStickerToPack(pack.id, file);
    event.target.value = '';
  };

  return (
    <div
      className={`sticker-picker${embedded ? ' embedded' : ''}`}
      role="dialog"
      aria-label="Escolher figurinha"
    >
      <div className="sticker-cats" role="tablist">
        {packs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={item.id === pack?.id}
            className={item.id === pack?.id ? 'on' : ''}
            title={item.name || item.label}
            aria-label={item.name || item.label}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setActive(item.id);
              setCreating(false);
            }}
          >
            <span>{item.custom && item.stickers?.[0]?.src ? (
              <img className="sticker-tab-img" src={item.stickers[0].src} alt="" />
            ) : (
              item.icon
            )}</span>
            <b>{item.name || item.label}</b>
          </button>
        ))}
        <button
          type="button"
          role="tab"
          aria-selected={creating}
          className={`sticker-new${creating ? ' on' : ''}`}
          title="Criar pacote de figurinhas"
          aria-label="Criar pacote de figurinhas"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setCreating((value) => !value)}
        >
          <Icon name="plus" />
        </button>
      </div>

      {creating ? (
        <form className="sticker-create" onSubmit={submitPack}>
          <input
            className="in"
            value={name}
            maxLength={30}
            autoFocus
            placeholder="Nome do pacote"
            onChange={(event) => setName(event.target.value)}
          />
          <button className="btn primary sm" type="submit">
            Criar
          </button>
        </form>
      ) : null}

      <div className="sticker-grid">
        {pack?.stickers?.length ? (
          pack.stickers.map((sticker, index) =>
            isCustom ? (
              <div className="sticker-custom" key={sticker.id || index}>
                <button
                  type="button"
                  className="sticker-chip custom"
                  title="Enviar figurinha"
                  aria-label="Enviar figurinha"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onPick?.({ src: sticker.src }, pack.id)}
                >
                  <img src={sticker.src} alt="Figurinha" loading="lazy" />
                </button>
                <button
                  type="button"
                  className="sticker-del"
                  title="Remover figurinha"
                  aria-label="Remover figurinha"
                  onClick={() => actions.removeStickerFromPack(pack.id, sticker.id)}
                >
                  <Icon name="x" />
                </button>
              </div>
            ) : (
              <button
                key={`${pack.id}-${index}`}
                type="button"
                className={`sticker-chip tone-${pack.id}`}
                title={sticker}
                aria-label={`Figurinha ${sticker} de ${pack.label}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onPick?.({ emoji: sticker }, pack.id)}
              >
                <span>{sticker}</span>
              </button>
            )
          )
        ) : (
          <p className="muted sm sticker-empty">
            {isCustom
              ? 'Adicione a primeira figurinha deste pacote.'
              : 'Nenhuma figurinha neste pacote.'}
          </p>
        )}
      </div>

      <div className="emoji-foot">
        {isCustom ? (
          <>
            <button
              type="button"
              className="link-btn"
              onClick={() => fileRef.current?.click()}
            >
              <Icon name="image" /> Adicionar figurinha
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={pickFile}
            />
            <span className="grow" />
            <button
              type="button"
              className="link-btn danger"
              onClick={() => actions.deleteStickerPack(pack.id)}
            >
              <Icon name="trash" /> Excluir pacote
            </button>
          </>
        ) : (
          <>
            <span>{pack?.label}</span>
            {onClose ? (
              <button type="button" className="link-btn" onClick={onClose}>
                Fechar
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
