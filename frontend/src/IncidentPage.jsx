import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

const sevColor = s =>
  s === 0  ? "bg-gray-600 text-gray-300" :
  s >= 4   ? "bg-red-600 text-white"     :
  s >= 3   ? "bg-orange-500 text-white"  : "bg-yellow-500 text-white";
const sevLabel = s =>
  s === 0 ? "Ошибка" : String(s);

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
    day:"2-digit", month:"2-digit",
    hour:"2-digit", minute:"2-digit"
  });
}

export default function IncidentPage() {
  const { id }   = useParams();
  const navigate = useNavigate();

  const [incident,  setIncident]  = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState("");
  const [imgError,  setImgError]  = useState(false);
  const [zoom,      setZoom]      = useState(1);

  // Комментарии об ошибке
  const [showMistakeForm, setShowMistakeForm] = useState(false);
  const [mistakeText,     setMistakeText]     = useState("");
  const [submitting,      setSubmitting]      = useState(false);
  const [showMistakes,    setShowMistakes]    = useState(false);

  // Telegram
  const [userProfile,    setUserProfile]    = useState(null);
  const [showTgForm,     setShowTgForm]     = useState(false);
  const [tgInput,        setTgInput]        = useState("");
  const [tgSaving,       setTgSaving]       = useState(false);

  const token = localStorage.getItem("access_token");
  const isAuth = !!token;

  // Загружаем инцидент
  useEffect(() => {
    setLoading(true); setImgError(false); setShowMistakeForm(false);
    setMistakeText(""); setShowMistakes(false); setZoom(1);
    axios.get(`${API}/incidents/${id}`)
      .then(r => { setIncident(r.data); setLoading(false); })
      .catch(() => { setError("Инцидент не найден"); setLoading(false); });
  }, [id]);

  // Загружаем профиль если авторизован
  useEffect(() => {
    if (!isAuth) return;
    axios.get(`${API}/user/profile`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setUserProfile(r.data))
      .catch(() => {});
  }, [isAuth]);

  const handleSubmitMistake = async () => {
    if (!mistakeText.trim()) return;
    setSubmitting(true);
    try {
      const res = await axios.post(`${API}/incidents/${id}/report_error`,
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

  const handleSaveTelegram = async () => {
    if (!tgInput.trim()) return;
    setTgSaving(true);
    try {
      await axios.post(`${API}/user/telegram`,
        { telegram: tgInput.trim().replace(/^@/, "") },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setUserProfile(prev => ({ ...prev, telegram: tgInput.trim().replace(/^@/, "") }));
      setShowTgForm(false);
    } catch { alert("Ошибка сохранения"); }
    setTgSaving(false);
  };

  if (loading) return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
      <div className="text-center opacity-50">
        <div className="text-4xl mb-3">⏳</div><p>Загрузка...</p>
      </div>
    </div>
  );

  if (error || !incident) return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
      <div className="text-center opacity-50">
        <div className="text-4xl mb-3">🔍</div>
        <p>{error || "Не найден"}</p>
        <button onClick={()=>navigate(-1)} className="mt-4 px-4 py-2 bg-gray-700 rounded hover:bg-gray-600">Назад</button>
      </div>
    </div>
  );

  const mistakeCount = (incident.mistake || []).length;

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">

      {/* Шапка */}
      <div className="bg-gray-800 border-b border-gray-700 px-4 py-2 flex items-center gap-3">
        <button onClick={()=>navigate(-1)}
          className="w-9 h-9 rounded-full bg-gray-700 hover:bg-gray-600 flex items-center justify-center text-lg shrink-0">←</button>
        <h1 className="text-base font-bold flex-1 truncate">Инцидент #{incident.id}</h1>
        {mistakeCount > 0 && (
          <span className="px-2 py-0.5 bg-orange-900 text-orange-300 rounded text-xs shrink-0">
            {mistakeCount} {mistakeCount===1?"жалоба":"жалоб"}
          </span>
        )}
      </div>

      {/* Основной контент */}
      <div className="flex-1 flex flex-col md:flex-row gap-4 p-4 max-w-6xl mx-auto w-full">

        {/* ── Фото ── */}
        <div className="flex-1 flex flex-col gap-3 min-w-0">
          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden relative"
               style={{ minHeight: 200 }}>
            {incident.screenshot_url && !imgError ? (
              <>
                <div className="overflow-hidden bg-black flex items-center justify-center"
                     style={{ maxHeight:"70vh" }}>
                  <img
                    src={`${API}${incident.screenshot_url}`}
                    alt="Скриншот"
                    onError={()=>setImgError(true)}
                    style={{
                      transform:`scale(${zoom})`, transformOrigin:"center center",
                      transition:"transform 0.2s ease",
                      width:"100%", objectFit:"contain", maxHeight:"70vh"
                    }}
                  />
                </div>
                {/* Зум */}
                <div className="absolute bottom-3 right-3 flex gap-1">
                  {[{l:"+",fn:()=>setZoom(p=>Math.min(p+0.25,4))},
                    {l:"⟲",fn:()=>setZoom(1)},
                    {l:"−",fn:()=>setZoom(p=>Math.max(p-0.25,0.5))}].map(({l,fn})=>(
                    <button key={l} onClick={fn}
                      className="w-8 h-8 rounded-full bg-black bg-opacity-70 hover:bg-opacity-90 flex items-center justify-center text-white transition-colors">
                      {l}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-48 opacity-30">
                <div className="text-center">
                  <div className="text-5xl mb-2">📷</div>
                  <p className="text-sm">{imgError ? "Фото недоступно" : "Фото не сохранено"}</p>
                </div>
              </div>
            )}
          </div>

          {incident.screenshot_url && !imgError && (
            <a href={`${API}${incident.screenshot_url}`} download
              className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm text-center transition-colors">
              ⬇️ Скачать фото
            </a>
          )}

          {/* ── Список комментариев об ошибке ── */}
          {mistakeCount > 0 && (
            <div className="bg-gray-800 rounded-xl border border-gray-700 p-3">
              <button onClick={()=>setShowMistakes(p=>!p)}
                className="flex items-center justify-between w-full text-sm font-semibold">
                <span>⚠️ Комментарии об ошибке ({mistakeCount})</span>
                <span className="text-gray-400">{showMistakes?"▲":"▼"}</span>
              </button>
              {showMistakes && (
                <div className="mt-2 space-y-2 max-h-48 overflow-y-auto">
                  {(incident.mistake||[]).map((m, i) => (
                    <div key={i} className="bg-gray-700 rounded-lg p-2.5 text-sm">
                      <p className="text-gray-100">{m.text}</p>
                      <p className="text-xs text-gray-400 mt-1">{fmtShort(m.date)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Детали + действия ── */}
        <div className="w-full md:w-80 flex flex-col gap-3 shrink-0">

          {/* Информация */}
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-4">
            <h2 className="font-bold text-sm mb-3">Детали</h2>
            <div className="space-y-2.5 text-sm">
              <div>
                <div className="text-xs text-gray-400 mb-0.5">Тип нарушения</div>
                <div className="font-semibold">{incident.notification_text}</div>
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-0.5">Камера</div>
                <div className="flex items-center gap-2">
                  <span>{incident.camera}</span>
                  <button onClick={()=>navigate(`/camera/${encodeURIComponent(incident.camera)}`)}
                    className="text-xs text-indigo-400 hover:text-indigo-300">Открыть →</button>
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-0.5">Дата и время</div>
                <div>{fmtDate(incident.date)}</div>
              </div>
              <div className="flex items-center gap-2">
                <div>
                  <div className="text-xs text-gray-400 mb-0.5">Тяжесть</div>
                  <span className={`px-2 py-0.5 rounded text-xs ${sevColor(incident.severity)}`}>
                    {sevLabel(incident.severity)}
                  </span>
                </div>
                <div className="ml-4">
                  <div className="text-xs text-gray-400 mb-0.5">ID</div>
                  <span className="text-gray-300 text-sm">#{incident.id}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Сообщить об ошибке */}
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-bold text-sm">Сообщить об ошибке</h2>
              {mistakeCount > 0 && (
                <button onClick={()=>setShowMistakes(p=>!p)}
                  className="text-xs text-orange-400 hover:text-orange-300">
                  ({mistakeCount}) просмотреть
                </button>
              )}
            </div>

            {!showMistakeForm ? (
              <button onClick={()=>setShowMistakeForm(true)}
                className="w-full py-2 bg-gray-700 hover:bg-red-900 border border-gray-600 hover:border-red-700 text-white rounded-lg text-sm transition-colors">
                ⚠️ Ошибка детекции
              </button>
            ) : (
              <div className="space-y-2">
                <textarea
                  value={mistakeText}
                  onChange={e=>setMistakeText(e.target.value)}
                  placeholder="Опишите ошибку (необязательно)..."
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg bg-gray-700 border border-gray-600 text-white text-sm
                             focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
                <div className="flex gap-2">
                  <button onClick={handleSubmitMistake} disabled={submitting}
                    className="flex-1 py-2 bg-red-700 hover:bg-red-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors">
                    {submitting ? "Отправка..." : "Отправить"}
                  </button>
                  <button onClick={()=>{setShowMistakeForm(false);setMistakeText("");}}
                    className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors">
                    Отмена
                  </button>
                </div>
              </div>
            )}
          </div>

          
          {/* Навигация */}
          <div className="flex gap-2">
            <button onClick={()=>navigate(`/incident/${Number(id)-1}`)} disabled={Number(id)<=1}
              className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm disabled:opacity-30 transition-colors">
              ← Пред.
            </button>
            <button onClick={()=>navigate(`/incident/${Number(id)+1}`)}
              className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors">
              След. →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}