import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import useTheme from './useTheme';

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

const sevColor = s =>
  s === 0  ? "bg-gray-600 text-gray-300" :
  s >= 4   ? "bg-red-600 text-white"     :
  s >= 3   ? "bg-orange-500 text-white"  : "bg-yellow-500 text-white";
const sevLabel = s => s === 0 ? "Ошибка" : String(s);

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString("ru-RU", {
    day:"2-digit", month:"2-digit", year:"numeric",
    hour:"2-digit", minute:"2-digit", second:"2-digit"
  });
}
function fmtShort(d) {
  if (!d) return "";
  return new Date(d).toLocaleString("ru-RU", {
    day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit"
  });
}

export default function IncidentPage() {
  const { id }   = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const navCtx   = location.state || null;
  const [theme, setTheme] = useTheme();
  const D = theme === 'dark';

  // ── zoom / pan ──────────────────────────────────────────────────────────────
  const imageContainerRef = useRef(null);
  const [scale,     setScale]     = useState(1);
  const [position,  setPosition]  = useState({x:0, y:0});
  const [isDragging,setIsDragging]= useState(false);
  const [dragStart, setDragStart] = useState({x:0, y:0});

  const handleWheel = useCallback(e => {
    if (!imageContainerRef.current) return;
    e.preventDefault();
    const delta    = e.deltaY > 0 ? -0.15 : 0.15;
    const newScale = Math.min(Math.max(scale + delta, 0.5), 5);
    const rect     = imageContainerRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const sf = newScale / scale;
    setScale(newScale);
    setPosition({x: mx - (mx - position.x) * sf, y: my - (my - position.y) * sf});
  }, [scale, position]);

  const handleMouseDown = e => {
    if (scale > 1) {
      setIsDragging(true);
      setDragStart({x: e.clientX - position.x, y: e.clientY - position.y});
    }
  };
  const handleMouseMove = e => {
    if (isDragging && scale > 1)
      setPosition({x: e.clientX - dragStart.x, y: e.clientY - dragStart.y});
  };
  const handleMouseUp = () => setIsDragging(false);

  const zoomIn    = () => setScale(p => Math.min(p + 0.25, 5));
  const zoomOut   = () => setScale(p => Math.max(p - 0.25, 0.5));
  const resetZoom = () => { setScale(1); setPosition({x:0, y:0}); };

  // ── incident data ───────────────────────────────────────────────────────────
  const [incident,  setIncident]  = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState("");
  const [imgError,  setImgError]  = useState(false);

  // ── panel ───────────────────────────────────────────────────────────────────
  const [panelOpen,       setPanelOpen]       = useState(false);
  const [showMistakeForm, setShowMistakeForm] = useState(false);
  const [mistakeText,     setMistakeText]     = useState("");
  const [submitting,      setSubmitting]      = useState(false);
  const [showMistakes,    setShowMistakes]    = useState(false);

  const token = localStorage.getItem("access_token");

  const [prevId, setPrevId] = useState(null);
  const [nextId, setNextId] = useState(null);

  useEffect(() => {
    if (!navCtx) { setPrevId(null); setNextId(null); return; }
    const p = new URLSearchParams();
    if (navCtx.source === 'camera') {
      p.set('cameras', navCtx.camera);
      if (navCtx.timeFrom) p.set('time_from', navCtx.timeFrom);
    } else if (navCtx.source === 'photos') {
      if (navCtx.cameras?.length)  p.set('cameras',      navCtx.cameras.join(','));
      if (navCtx.types?.length)    p.set('types',        navCtx.types.join(','));
      if (navCtx.timeFrom)         p.set('time_from',    navCtx.timeFrom);
      if (navCtx.hasPhoto)         p.set('has_photo',    'true');
      if (navCtx.hasMistakes)      p.set('has_mistakes', 'true');
    }
    fetch(`${API}/incidents/${id}/adjacent?${p}`)
      .then(r => r.json())
      .then(d => { setPrevId(d.prev_id ?? null); setNextId(d.next_id ?? null); })
      .catch(() => { setPrevId(null); setNextId(null); });
  }, [id, navCtx]);

  const goTo = targetId =>
    navigate(`/incident/${targetId}`, { state: navCtx, replace: true });

  useEffect(() => {
    setLoading(true); setImgError(false);
    setShowMistakeForm(false); setMistakeText(""); setShowMistakes(false);
    setScale(1); setPosition({x:0, y:0});
    axios.get(`${API}/incidents/${id}`)
      .then(r => { setIncident(r.data); setLoading(false); })
      .catch(() => { setError("Инцидент не найден"); setLoading(false); });
  }, [id]);

  const handleSubmitMistake = async () => {
    if (!mistakeText.trim()) return;
    setSubmitting(true);
    try {
      await axios.post(`${API}/incidents/${id}/report_error`,
        { text: mistakeText.trim() },
        token ? { headers: { Authorization: `Bearer ${token}` } } : {}
      );
      setIncident(prev => ({
        ...prev,
        mistake: [...(prev.mistake || []), { text: mistakeText.trim(), date: new Date().toISOString() }]
      }));
      setMistakeText(""); setShowMistakeForm(false); setShowMistakes(true);
    } catch { alert("Ошибка при отправке"); }
    setSubmitting(false);
  };

  // ── loading / error screens ─────────────────────────────────────────────────
  if (loading) return (
    <div className={`fixed inset-0 flex items-center justify-center ${D?'bg-black':'bg-gray-100'}`}>
      <div className={`opacity-50 text-center ${D?'text-white':'text-gray-800'}`}>
        <div className="text-4xl mb-3">⏳</div><p>Загрузка...</p>
      </div>
    </div>
  );

  if (error || !incident) return (
    <div className={`fixed inset-0 flex items-center justify-center ${D?'bg-black':'bg-gray-100'}`}>
      <div className={`opacity-50 text-center ${D?'text-white':'text-gray-800'}`}>
        <div className="text-4xl mb-3">🔍</div>
        <p>{error || "Не найден"}</p>
        <button onClick={() => navigate(-1)}
          className={`mt-4 px-4 py-2 rounded ${D?'bg-gray-700 hover:bg-gray-600 text-white':'bg-gray-200 hover:bg-gray-300 text-gray-800'}`}>Назад</button>
      </div>
    </div>
  );

  const mistakeCount = (incident.mistake || []).length;

  return (
    <div className={`fixed inset-0 overflow-hidden ${D?'bg-black':'bg-gray-200'}`}>

      {/* ── Фото на весь экран ── */}
      <div
        ref={imageContainerRef}
        className="absolute inset-0"
        style={{top: 48}}
        onWheel={handleWheel}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          className="w-full h-full overflow-hidden bg-black"
          onMouseDown={handleMouseDown}
          style={{cursor: scale > 1 ? (isDragging ? "grabbing" : "grab") : "default"}}
        >
          {incident.screenshot_url && !imgError ? (
            <div style={{
              transform: `scale(${scale}) translate(${position.x/scale}px,${position.y/scale}px)`,
              transformOrigin: "0 0",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: isDragging ? "none" : "transform 0.1s ease",
            }}>
              <img
                src={`${API}${incident.screenshot_url}`}
                alt="Скриншот"
                draggable={false}
                onError={() => setImgError(true)}
                style={{maxWidth:"100%", maxHeight:"100%", objectFit:"contain", userSelect:"none"}}
              />
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <div className="text-white opacity-30 text-center">
                <div className="text-6xl mb-3">📷</div>
                <p className="text-sm">{imgError ? "Фото недоступно" : "Фото не сохранено"}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Шапка ── */}
      <div className="absolute top-0 left-0 right-0 z-20 h-12 flex items-center gap-2 px-3
                      bg-gradient-to-b from-black/70 to-transparent">
        <button onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center text-lg backdrop-blur-sm shrink-0">
          ←
        </button>

        <span className="text-white font-bold text-sm bg-black/60 px-3 py-1 rounded-full backdrop-blur-sm">
          #{incident.id} · {incident.notification_text}
        </span>

        {/* Zoom controls */}
        <div className="flex gap-1 ml-1">
          {[{l:"+", fn:zoomIn},{l:"⟲", fn:resetZoom},{l:"−", fn:zoomOut}].map(({l,fn})=>(
            <button key={l} onClick={fn}
              className="w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center text-sm backdrop-blur-sm">
              {l}
            </button>
          ))}
          {scale !== 1 && (
            <span className="text-white text-xs bg-black/60 px-2 rounded-full flex items-center backdrop-blur-sm">
              {Math.round(scale * 100)}%
            </span>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button onClick={()=>setTheme(D?'light':'dark')}
            className="w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center backdrop-blur-sm text-sm">
            {D?'☀️':'🌙'}
          </button>
          {/* Toggle panel */}
          <button
            onClick={() => setPanelOpen(p => !p)}
            className={`px-3 py-1.5 rounded-full text-sm font-semibold backdrop-blur-sm transition-colors ${
              panelOpen ? "bg-indigo-600 text-white" : "bg-black/60 text-white hover:bg-black/80"
            }`}>
            Детали {panelOpen ? "▲" : "▼"}
            {mistakeCount > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 bg-orange-600 rounded-full text-xs">{mistakeCount}</span>
            )}
          </button>
        </div>
      </div>

      {/* ── Навигация (внизу по центру) ── */}
      {(prevId || nextId) && (
        <div className="absolute bottom-4 left-0 right-0 z-20 flex justify-center gap-3 pointer-events-none">
          {prevId && (
            <button onClick={() => goTo(prevId)}
              className="pointer-events-auto px-5 py-2 rounded-full bg-black/60 hover:bg-black/80 text-white text-sm backdrop-blur-sm transition-colors">
              ← Пред.
            </button>
          )}
          {nextId && (
            <button onClick={() => goTo(nextId)}
              className="pointer-events-auto px-5 py-2 rounded-full bg-black/60 hover:bg-black/80 text-white text-sm backdrop-blur-sm transition-colors">
              След. →
            </button>
          )}
        </div>
      )}

      {/* ── Плавающая панель деталей ── */}
      {panelOpen && (
        <div className={`absolute right-3 top-14 z-30 w-76 max-h-[calc(100vh-4.5rem)] overflow-y-auto
                        border rounded-xl shadow-2xl backdrop-blur-sm flex flex-col
                        ${D?'bg-gray-900/95 border-gray-700 text-white':'bg-white/95 border-gray-200 text-gray-900'}`}
             style={{width: 304}}>

          {/* Информация */}
          <div className={`p-4 border-b ${D?'border-gray-700':'border-gray-200'}`}>
            <h2 className={`font-bold text-xs uppercase tracking-wide mb-3 ${D?'text-gray-400':'text-gray-500'}`}>Детали</h2>
            <div className="space-y-3 text-sm">
              <div>
                <div className={`text-xs mb-0.5 ${D?'text-gray-400':'text-gray-500'}`}>Тип нарушения</div>
                <div className="font-semibold">{incident.notification_text}</div>
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-0.5">Камера</div>
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-sm">{incident.camera}</span>
                  <button onClick={() => navigate(`/camera/${encodeURIComponent(incident.camera)}`)}
                    className="text-xs text-indigo-400 hover:text-indigo-300 shrink-0">Открыть →</button>
                </div>
              </div>
              <div>
                <div className={`text-xs mb-0.5 ${D?'text-gray-400':'text-gray-500'}`}>Дата и время</div>
                <div>{fmtDate(incident.date)}</div>
              </div>
              <div className="flex gap-6">
                <div>
                  <div className={`text-xs mb-0.5 ${D?'text-gray-400':'text-gray-500'}`}>Тяжесть</div>
                  <span className={`px-2 py-0.5 rounded text-xs ${sevColor(incident.severity)}`}>
                    {sevLabel(incident.severity)}
                  </span>
                </div>
                <div>
                  <div className={`text-xs mb-0.5 ${D?'text-gray-400':'text-gray-500'}`}>ID</div>
                  <span className={D?'text-gray-300':'text-gray-600'}>#{incident.id}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Скачать */}
          {incident.screenshot_url && !imgError && (
            <div className={`px-4 py-3 border-b ${D?'border-gray-700':'border-gray-200'}`}>
              <a href={`${API}${incident.screenshot_url}`} download
                className={`block w-full py-2 rounded-lg text-sm text-center transition-colors ${D?'bg-gray-700 hover:bg-gray-600 text-white':'bg-gray-100 hover:bg-gray-200 text-gray-900'}`}>
                ⬇️ Скачать фото
              </a>
            </div>
          )}

          {/* Комментарии об ошибке */}
          <div className={`px-4 py-3 border-b ${D?'border-gray-700':'border-gray-200'}`}>
            <div className="flex items-center justify-between mb-2">
              <h2 className={`font-bold text-xs uppercase tracking-wide ${D?'text-gray-400':'text-gray-500'}`}>Сообщить об ошибке</h2>
              {mistakeCount > 0 && (
                <button onClick={() => setShowMistakes(p => !p)}
                  className="text-xs text-orange-400 hover:text-orange-300">
                  {mistakeCount} {showMistakes ? "▲" : "▼"}
                </button>
              )}
            </div>

            {showMistakes && (
              <div className="mb-2 space-y-1.5 max-h-36 overflow-y-auto">
                {(incident.mistake || []).map((m, i) => (
                  <div key={i} className={`rounded-lg p-2 text-xs ${D?'bg-gray-800 text-white':'bg-gray-100 text-gray-900'}`}>
                    <p className={D?'text-gray-100':'text-gray-800'}>{m.text}</p>
                    <p className={`mt-0.5 ${D?'text-gray-500':'text-gray-400'}`}>{fmtShort(m.date)}</p>
                  </div>
                ))}
              </div>
            )}

            {!showMistakeForm ? (
              <button onClick={() => setShowMistakeForm(true)}
                className={`w-full py-2 rounded-lg text-sm transition-colors border ${D?'bg-gray-700 hover:bg-red-900 border-gray-600 hover:border-red-700 text-white':'bg-gray-100 hover:bg-red-50 border-gray-300 hover:border-red-300 text-gray-800'}`}>
                ⚠️ Ошибка детекции
              </button>
            ) : (
              <div className="space-y-2">
                <textarea
                  value={mistakeText}
                  onChange={e => setMistakeText(e.target.value)}
                  placeholder="Опишите ошибку..."
                  rows={3}
                  className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none ${D?'bg-gray-700 border-gray-600 text-white':'bg-white border-gray-300 text-gray-900'}`}
                />
                <div className="flex gap-2">
                  <button onClick={handleSubmitMistake} disabled={submitting}
                    className="flex-1 py-2 bg-red-700 hover:bg-red-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50">
                    {submitting ? "Отправка..." : "Отправить"}
                  </button>
                  <button onClick={() => { setShowMistakeForm(false); setMistakeText(""); }}
                    className={`flex-1 py-2 rounded-lg text-sm ${D?'bg-gray-700 hover:bg-gray-600 text-white':'bg-gray-200 hover:bg-gray-300 text-gray-800'}`}>
                    Отмена
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Навигация */}
          {(prevId || nextId) && (
            <div className="px-4 py-3 flex gap-2">
              {prevId && (
                <button onClick={() => goTo(prevId)}
                  className={`flex-1 py-2 rounded-lg text-sm transition-colors ${D?'bg-gray-700 hover:bg-gray-600 text-white':'bg-gray-200 hover:bg-gray-300 text-gray-800'}`}>
                  ← Пред.
                </button>
              )}
              {nextId && (
                <button onClick={() => goTo(nextId)}
                  className={`flex-1 py-2 rounded-lg text-sm transition-colors ${D?'bg-gray-700 hover:bg-gray-600 text-white':'bg-gray-200 hover:bg-gray-300 text-gray-800'}`}>
                  След. →
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
