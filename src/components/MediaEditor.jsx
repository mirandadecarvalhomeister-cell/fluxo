import { useEffect, useRef, useState } from 'react';
import { uid } from '../lib/utils';
import {
  emptyEdit,
  exportEditedImage,
  hasEdits,
  mediaDisplayStyle,
  wrapperAspect,
} from '../lib/mediaEdit';
import { Icon } from './Icon';

const COLORS = ['#FFFFFF', '#0B0718', '#FF4D6D', '#FFC247', '#5B35E8', '#46D194', '#22D3EE'];

const PRESETS = [
  { name: 'Normal', f: {} },
  { name: 'Vívido', f: { s: 150, c: 112 } },
  { name: 'Quente', f: { se: 35, s: 118, b: 104 } },
  { name: 'Suave', f: { b: 106, s: 88, se: 12 } },
  { name: 'Sépia', f: { se: 78 } },
  { name: 'Noir', f: { g: 100, c: 118 } },
  { name: 'Vintage', f: { se: 22, s: 82, b: 106 } },
  { name: 'Frio', f: { g: 14, b: 104, s: 96 } },
];

const TOOLS = [
  ['ajustes', 'Ajustes', 'sun'],
  ['texto', 'Texto', 'edit'],
  ['desenho', 'Desenho', 'brush'],
  ['girar', 'Girar', 'expand'],
];

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// Camada de sobreposição (textos e traços) exibida sobre mídias editadas.
// Usada no feed, nos stories e nas prévias. As coordenadas ficam em fração
// (0-1) da caixa final; o viewBox usa o aspecto pós-rotação para manter os
// traços com espessura uniforme.
export function EditOverlay({ edit }) {
  if (!edit) return null;
  const texts = edit.texts || [];
  const strokes = edit.strokes || [];
  if (!texts.length && !strokes.length) return null;
  const box = wrapperAspect(edit);
  return (
    <span className="med-layer" aria-hidden="true">
      <svg
        className="med-strokes"
        viewBox={`0 0 1 ${box}`}
        preserveAspectRatio="none"
      >
        {strokes.map((stroke) =>
          stroke?.pts?.length ? (
            <path
              key={stroke.id}
              d={stroke.pts
                .map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(4)} ${(y * box).toFixed(4)}`)
                .join(' ')}
              stroke={stroke.color}
              strokeWidth={stroke.w}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null
        )}
      </svg>
      {texts.map((t) =>
        t?.text ? (
          <span
            key={t.id}
            className="med-txt"
            style={{
              left: `${t.x * 100}%`,
              top: `${t.y * 100}%`,
              color: t.color,
              fontSize: `${(t.size || 0.09) * 100}cqw`,
            }}
          >
            {t.text}
          </span>
        ) : null
      )}
    </span>
  );
}

// Caixa que envolve a mídia editada para exibição: mantém o aspecto correto
// (inclusive após rotação) e alinha a camada de sobreposição. O filtro e o
// giro são aplicados no próprio elemento de mídia via mediaDisplayStyle().
export function EditWrap({ edit, children }) {
  if (!edit || !hasEdits(edit)) return children;
  return (
    <span
      className="med-wrap"
      style={{ aspectRatio: String(wrapperAspect(edit)) }}
    >
      {children}
      <EditOverlay edit={edit} />
    </span>
  );
}

export default function MediaEditor({
  kind = 'photo',
  src,
  fileName = 'foto',
  initialEdit = null,
  onDone,
  onCancel,
}) {
  const [edit, setEdit] = useState(() => initialEdit || emptyEdit(1));
  const [tool, setTool] = useState('ajustes');
  const [ar, setAr] = useState(edit.ar || 1);
  const [activeText, setActiveText] = useState(null);
  const [brush, setBrush] = useState({ color: '#FFFFFF', w: 0.018 });
  const [curStroke, setCurStroke] = useState(null);
  const [busy, setBusy] = useState(false);
  const [stageBox, setStageBox] = useState(null);
  const frameRef = useRef(null);
  const stageRef = useRef(null);
  const drawing = useRef(false);

  useEffect(() => {
    setEdit((cur) => ({ ...cur, ar }));
  }, [ar]);

  // Mede o palco disponível para dimensionar o quadro exatamente (inclusive
  // ao girar), sem cortar a mídia nem estourar a tela.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect?.width && rect?.height) {
        setStageBox({ w: rect.width, h: rect.height });
      }
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    function onKey(event) {
      if (event.key === 'Escape' && !busy) onCancel?.();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  function pctFromEvent(event) {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return [0.5, 0.5];
    return [
      clamp01((event.clientX - rect.left) / rect.width),
      clamp01((event.clientY - rect.top) / rect.height),
    ];
  }

  function setFilter(key, value) {
    setEdit((cur) => ({
      ...cur,
      filter: { ...cur.filter, [key]: value },
    }));
  }

  function applyPreset(preset) {
    setEdit((cur) => ({
      ...cur,
      filter: { b: 100, c: 100, s: 100, se: 0, g: 0, bl: cur.filter.bl || 0, ...preset },
    }));
  }

  function addText() {
    const id = uid();
    const item = {
      id,
      text: 'Seu texto',
      x: 0.5,
      y: 0.42,
      color: '#FFFFFF',
      size: 0.09,
    };
    setEdit((cur) => ({ ...cur, texts: [...cur.texts, item] }));
    setActiveText(id);
    setTool('texto');
  }

  function patchActiveText(patch) {
    setEdit((cur) => ({
      ...cur,
      texts: cur.texts.map((t) => (t.id === activeText ? { ...t, ...patch } : t)),
    }));
  }

  function removeActiveText() {
    setEdit((cur) => ({ ...cur, texts: cur.texts.filter((t) => t.id !== activeText) }));
    setActiveText(null);
  }

  function undo() {
    if (tool === 'desenho' && edit.strokes.length) {
      setEdit((cur) => ({ ...cur, strokes: cur.strokes.slice(0, -1) }));
    } else if (activeText) {
      removeActiveText();
    } else if (edit.texts.length) {
      const last = edit.texts[edit.texts.length - 1];
      setEdit((cur) => ({ ...cur, texts: cur.texts.filter((t) => t.id !== last.id) }));
    }
  }

  function onStrokeStart(event) {
    if (tool !== 'desenho') return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    const p = pctFromEvent(event);
    setCurStroke({ id: uid(), color: brush.color, w: brush.w, pts: [p] });
  }

  function onStrokeMove(event) {
    if (!drawing.current) return;
    const p = pctFromEvent(event);
    setCurStroke((cur) => {
      if (!cur) return cur;
      const last = cur.pts[cur.pts.length - 1];
      const dx = p[0] - last[0];
      const dy = p[1] - last[1];
      if (dx * dx + dy * dy < 0.0004) return cur;
      return { ...cur, pts: [...cur.pts, p] };
    });
  }

  function onStrokeEnd() {
    if (!drawing.current) return;
    drawing.current = false;
    setCurStroke((cur) => {
      if (cur?.pts?.length) {
        setEdit((state) => ({ ...state, strokes: [...state.strokes, cur] }));
      }
      return null;
    });
  }

  function onTextDragStart(event, id) {
    if (tool !== 'texto') return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setActiveText(id);
  }

  function onTextDragMove(event) {
    if (tool !== 'texto' || !activeText) return;
    const [x, y] = pctFromEvent(event);
    setEdit((cur) => ({
      ...cur,
      texts: cur.texts.map((t) => (t.id === activeText ? { ...t, x, y } : t)),
    }));
  }

  function rotateBy(deg) {
    setEdit((cur) => ({ ...cur, rotate: ((cur.rotate + deg) % 360 + 360) % 360 }));
  }

  async function finish() {
    if (busy) return;
    const finalEdit = { ...edit, ar };
    if (!hasEdits(finalEdit)) {
      onDone?.({ file: null, edit: null });
      return;
    }
    if (kind === 'photo') {
      setBusy(true);
      try {
        const file = await exportEditedImage({ src, edit: finalEdit, fileName });
        onDone?.({ file, edit: null });
      } catch (error) {
        // Não dá para queimar a edição (fonte externa sem CORS, canvas
        // contaminado): mantemos o objeto e aplicamos na exibição.
        onDone?.({ file: null, edit: finalEdit });
      } finally {
        setBusy(false);
      }
      return;
    }
    onDone?.({ file: null, edit: finalEdit });
  }

  const mediaStyle = mediaDisplayStyle(edit);
  const active = edit.texts.find((t) => t.id === activeText);
  const frameAspect = wrapperAspect(edit);
  const isPhoto = kind === 'photo';
  const frameWidth = stageBox
    ? Math.max(140, Math.min(stageBox.w, stageBox.h / frameAspect))
    : null;
  // Ao girar 90/270, a caixa da mídia troca de eixo para preencher o quadro
  // exatamente (sem faixas) antes da rotação visual.
  const swapped = edit.rotate === 90 || edit.rotate === 270;
  const editorMediaStyle = {
    ...mediaStyle,
    ...(swapped && frameWidth
      ? { width: `${frameWidth * frameAspect}px`, height: `${frameWidth}px` }
      : {}),
  };

  return (
    <div className="med-screen" role="dialog" aria-modal="true" aria-label="Editar mídia">
      <div className="scrim" onClick={onCancel} />
      <div className="med-editor">
        <header className="med-head">
          <b>Editar {isPhoto ? 'foto' : 'vídeo'}</b>
          <div className="row" style={{ gap: 8 }}>
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => setEdit(emptyEdit(ar))}
              disabled={busy}
            >
              <Icon name="broom" /> Limpar
            </button>
            <button
              type="button"
              className="btn ghost sm"
              onClick={onCancel}
              disabled={busy}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn primary sm"
              onClick={finish}
              disabled={busy}
            >
              <Icon name="check" /> {busy ? 'Salvando...' : 'Concluir'}
            </button>
          </div>
        </header>

        <div className="med-stage" ref={stageRef}>
          <span
            className="med-frame"
            ref={frameRef}
            style={
              frameWidth
                ? { width: `${frameWidth}px`, height: `${frameWidth * frameAspect}px` }
                : { aspectRatio: String(frameAspect) }
            }
          >
            {isPhoto ? (
              <img
                className="med-media"
                src={src}
                alt=""
                style={editorMediaStyle}
                onLoad={(event) => {
                  const el = event.currentTarget;
                  if (el.naturalHeight && el.naturalWidth) {
                    setAr(el.naturalHeight / el.naturalWidth);
                  }
                }}
                draggable={false}
              />
            ) : (
              <video
                className="med-media"
                src={src}
                style={editorMediaStyle}
                muted
                loop
                autoPlay
                playsInline
                onLoadedMetadata={(event) => {
                  const el = event.currentTarget;
                  if (el.videoHeight && el.videoWidth) {
                    setAr(el.videoHeight / el.videoWidth);
                  }
                }}
              />
            )}
            <EditOverlay
              edit={
                curStroke
                  ? {
                      ...edit,
                      texts: [],
                      strokes: [...edit.strokes, curStroke],
                    }
                  : { ...edit, texts: [] }
              }
            />
            {edit.texts.map((t) => (
              <span
                key={t.id}
                className={`med-txt grab${t.id === activeText ? ' sel' : ''}${
                  tool === 'texto' ? '' : ' off'
                }`}
                style={{
                  left: `${t.x * 100}%`,
                  top: `${t.y * 100}%`,
                  color: t.color,
                  fontSize: `${(t.size || 0.09) * 100}cqw`,
                }}
                onPointerDown={(event) => onTextDragStart(event, t.id)}
                onPointerMove={onTextDragMove}
                onClick={() => tool === 'texto' && setActiveText(t.id)}
              >
                {t.text}
              </span>
            ))}
            {tool === 'desenho' ? (
              <span
                className="med-surface"
                onPointerDown={onStrokeStart}
                onPointerMove={onStrokeMove}
                onPointerUp={onStrokeEnd}
                onPointerCancel={onStrokeEnd}
              />
            ) : null}
          </span>
        </div>

        <nav className="med-tools" role="tablist" aria-label="Ferramentas de edição">
          {TOOLS.filter(([key]) => key !== 'girar' || isPhoto).map(([key, label, icon]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tool === key}
              className={tool === key ? 'on' : ''}
              onClick={() => setTool(key)}
            >
              <Icon name={icon} /> {label}
            </button>
          ))}
          <span className="sp" />
          {(tool === 'desenho' && edit.strokes.length) ||
          (tool === 'texto' && edit.texts.length) ? (
            <button type="button" className="med-undo" onClick={undo}>
              <Icon name="back" /> Desfazer
            </button>
          ) : null}
        </nav>

        {tool === 'ajustes' ? (
          <div className="med-panel">
            <div className="med-presets">
              {PRESETS.map((preset) => (
                <button
                  type="button"
                  className="pill"
                  key={preset.name}
                  onClick={() => applyPreset(preset.f)}
                >
                  {preset.name}
                </button>
              ))}
            </div>
            {[
              ['b', 'Brilho', 0, 200, '%'],
              ['c', 'Contraste', 0, 200, '%'],
              ['s', 'Saturação', 0, 200, '%'],
              ['se', 'Sépia', 0, 100, '%'],
              ['g', 'Preto e branco', 0, 100, '%'],
              ['bl', 'Desfoque', 0, 12, 'px'],
            ].map(([key, label, min, max, unit]) => (
              <label className="med-slider" key={key}>
                <span>
                  {label}{' '}
                  <b className="muted">
                    {edit.filter[key]}
                    {unit}
                  </b>
                </span>
                <input
                  type="range"
                  min={min}
                  max={max}
                  value={edit.filter[key]}
                  onChange={(event) => setFilter(key, Number(event.target.value))}
                />
              </label>
            ))}
          </div>
        ) : null}

        {tool === 'texto' ? (
          <div className="med-panel">
            {!edit.texts.length ? (
              <button type="button" className="btn tonal" onClick={addText}>
                <Icon name="plus" /> Adicionar texto
              </button>
            ) : null}
            {active ? (
              <>
                <textarea
                  className="input"
                  rows={2}
                  maxLength={120}
                  value={active.text}
                  onChange={(event) => patchActiveText({ text: event.target.value })}
                  placeholder="Escreva algo..."
                />
                <div className="med-colors">
                  {COLORS.map((color) => (
                    <button
                      type="button"
                      key={color}
                      className={`swatch${active.color === color ? ' on' : ''}`}
                      style={{ background: color }}
                      onClick={() => patchActiveText({ color })}
                      aria-label={`Cor ${color}`}
                    />
                  ))}
                </div>
                <label className="med-slider">
                  <span>
                    Tamanho <b className="muted">{Math.round((active.size || 0.09) * 100)}</b>
                  </span>
                  <input
                    type="range"
                    min={4}
                    max={22}
                    step={0.5}
                    value={Math.round((active.size || 0.09) * 100)}
                    onChange={(event) =>
                      patchActiveText({ size: Number(event.target.value) / 100 })
                    }
                  />
                </label>
                <div className="row" style={{ gap: 8 }}>
                  <button
                    type="button"
                    className="btn tonal sm"
                    onClick={() => {
                      removeActiveText();
                      setTool('ajustes');
                    }}
                  >
                    <Icon name="trash" /> Remover texto
                  </button>
                  <span className="muted sm">Arraste o texto na imagem para posicionar.</span>
                </div>
              </>
            ) : edit.texts.length ? (
              <p className="muted sm">
                Toque em um texto na imagem para editar, ou{' '}
                <button type="button" className="linkish" onClick={addText}>
                  adicionar outro
                </button>
                .
              </p>
            ) : null}
          </div>
        ) : null}

        {tool === 'desenho' ? (
          <div className="med-panel">
            <div className="med-colors">
              {COLORS.map((color) => (
                <button
                  type="button"
                  key={color}
                  className={`swatch${brush.color === color ? ' on' : ''}`}
                  style={{ background: color }}
                  onClick={() => setBrush((cur) => ({ ...cur, color }))}
                  aria-label={`Cor ${color}`}
                />
              ))}
            </div>
            <label className="med-slider">
              <span>
                Espessura <b className="muted">{Math.round(brush.w * 1000) / 10}</b>
              </span>
              <input
                type="range"
                min={4}
                max={60}
                value={Math.round(brush.w * 1000)}
                onChange={(event) =>
                  setBrush((cur) => ({ ...cur, w: Number(event.target.value) / 1000 }))
                }
              />
            </label>
            <p className="muted sm">Desenhe com o dedo ou o mouse sobre a mídia.</p>
          </div>
        ) : null}

        {tool === 'girar' && isPhoto ? (
          <div className="med-panel">
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => rotateBy(-90)}
              >
                <Icon name="back" /> Girar à esquerda
              </button>
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => rotateBy(90)}
              >
                <Icon name="back" className="flipx" /> Girar à direita
              </button>
              <button
                type="button"
                className={`btn ghost sm${edit.flip ? ' tonal' : ''}`}
                onClick={() => setEdit((cur) => ({ ...cur, flip: !cur.flip }))}
              >
                <Icon name="expand" /> Espelhar
              </button>
            </div>
            <p className="muted sm">
              A rotação é aplicada na foto salva. Para vídeos, use ajustes, texto e desenho.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
