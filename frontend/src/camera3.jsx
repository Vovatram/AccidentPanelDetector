import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import useTheme from './useTheme';

const INCIDENT_TYPES = [
  'Стоянка в неположенном месте','ДТП','Превышение скорости',
  'Пешеход на проезжей части вне перехода','Затор','Движение по встречке','Сбитие пешехода'
];
const BACKEND_TO_DISPLAY = {
  traffic_jam:  'Затор',
  illegal_stop: 'Стоянка в неположенном месте',
  pedestrian:   'Пешеход на проезжей части вне перехода',
  accident:     'ДТП',
  wrong_way:    'Движение по встречке',
  speeding:     'Превышение скорости',
};
const DISPLAY_TO_BACKEND = Object.fromEntries(
  Object.entries(BACKEND_TO_DISPLAY).map(([k,v])=>[v,k])
);
const DETECTABLE = Object.values(BACKEND_TO_DISPLAY);

const TIME_RANGE_OPTIONS = [
  {label:'15 мин',value:900},
  {label:'1 час',value:3600},
  {label:'6 часов',value:21600},
  {label:'24 часа',value:86400},
];

const WS_RECONNECT_DELAY = 5000; // мс до попытки переподключения

// ─────────────────────────────────────────────────────────────────────────────
function TypeSelector({title, selected, onToggle, onSave, saveLabel, onClose}) {
  return (
    <div className="mt-2 p-3 bg-gray-700 rounded-lg border border-gray-600">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-semibold">{title}</span>
        <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
      </div>
      <div className="space-y-1 max-h-52 overflow-y-auto">
        {INCIDENT_TYPES.map(type=>(
          <label key={type} className="flex items-center gap-2 cursor-pointer text-sm hover:bg-gray-600 px-2 py-1 rounded">
            <input type="checkbox" checked={selected.includes(type)}
              onChange={()=>onToggle(type)} className="accent-indigo-400"/>
            <span>{type}</span>
          </label>
        ))}
      </div>
      {onSave&&(
        <button onClick={onSave}
          className="mt-2 w-full py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm font-semibold">
          {saveLabel||'Сохранить'}
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
function AuthModal({onClose, onSuccess, theme}) {
  const [tab, setTab]       = useState('login');
  const [email, setEmail]   = useState('');
  const [password, setPassword] = useState('');
  const [uname, setUname]   = useState('');
  const [confirm, setConfirm] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setError(''); setLoading(true);
    try {
      const res = await axios.post(`${import.meta.env.VITE_API_URL}/login`, {email, password});
      if (res.data.error) { setError(res.data.error); return; }
      localStorage.setItem('access_token', res.data.access_token);
      onSuccess(email);
    } catch { setError('Ошибка подключения'); }
    finally { setLoading(false); }
  };

  const handleRegister = async () => {
    if (password !== confirm) { setError('Пароли не совпадают'); return; }
    setError(''); setLoading(true);
    try {
      await axios.post(`${import.meta.env.VITE_API_URL}/register`, {name:uname, email, password});
      setTab('verify'); setError('Код отправлен на ' + email);
    } catch { setError('Ошибка регистрации'); }
    finally { setLoading(false); }
  };

  const handleVerify = async () => {
    setError(''); setLoading(true);
    try {
      const res = await axios.post(`${import.meta.env.VITE_API_URL}/verify-email`, {email, code: verifyCode});
      if (!res.data.ok) { setError(res.data.error || 'Неверный код'); return; }
      setTab('login'); setError('Почта подтверждена — войдите');
    } catch { setError('Ошибка подтверждения'); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50"
         onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="bg-gray-800 text-white rounded-xl shadow-2xl w-full max-w-sm p-6 border border-gray-600">
        {tab !== 'verify' && (
          <div className="flex gap-2 mb-5">
            {['login','register'].map(t=>(
              <button key={t} onClick={()=>{setTab(t);setError('');}}
                className={`flex-1 py-1.5 rounded-lg text-sm font-semibold transition-colors
                  ${tab===t?'bg-indigo-600 text-white':'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
                {t==='login'?'Вход':'Регистрация'}
              </button>
            ))}
            <button onClick={onClose} className="ml-auto text-gray-400 hover:text-white px-2">✕</button>
          </div>
        )}
        {tab === 'verify' ? (
          <div className="space-y-3">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-sm">✉️ Подтверждение почты</h3>
              <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
            </div>
            <p className="text-xs text-gray-300">Введите 6-значный код из письма на <b>{email}</b></p>
            <input type="text" placeholder="Код из письма" value={verifyCode}
              onChange={e=>setVerifyCode(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&handleVerify()}
              maxLength={6}
              className="w-full px-3 py-2 rounded-lg bg-gray-700 border border-gray-600 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 tracking-widest text-center text-lg"/>
            {error&&<p className={`text-xs ${error.includes('подтверждена')?'text-green-400':'text-red-400'}`}>{error}</p>}
            <button onClick={handleVerify} disabled={loading||verifyCode.length<6}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50">
              {loading?'Проверка...':'Подтвердить'}
            </button>
            <button onClick={()=>{setTab('login');setError('Войдите после регистрации');}}
              className="w-full py-1 text-xs text-gray-400 hover:text-white">
              Подтвердить позже
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {tab==='register'&&(
              <input type="text" placeholder="Имя" value={uname} onChange={e=>setUname(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-gray-700 border border-gray-600 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
            )}
            <input type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)}
              onKeyDown={e=>tab==='login'&&e.key==='Enter'&&handleLogin()}
              className="w-full px-3 py-2 rounded-lg bg-gray-700 border border-gray-600 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
            <input type="password" placeholder="Пароль" value={password} onChange={e=>setPassword(e.target.value)}
              onKeyDown={e=>tab==='login'&&e.key==='Enter'&&handleLogin()}
              className="w-full px-3 py-2 rounded-lg bg-gray-700 border border-gray-600 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
            {tab==='register'&&(
              <input type="password" placeholder="Повторите пароль" value={confirm} onChange={e=>setConfirm(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-gray-700 border border-gray-600 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
            )}
            {error&&<p className={`text-xs ${error.includes('подтверждена')||error.includes('успешна')?'text-green-400':'text-red-400'}`}>{error}</p>}
            <button onClick={tab==='login'?handleLogin:handleRegister} disabled={loading}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50">
              {loading?'Загрузка...':(tab==='login'?'Войти':'Зарегистрироваться')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
function Camera() {
  const {name}   = useParams();
  const navigate = useNavigate();

  const imgRef            = useRef(null);
  const containerRef      = useRef(null);
  const imageContainerRef = useRef(null);
  const videoWsRef        = useRef(null);
  const notifWsRef        = useRef(null);
  const notifReconnTimer  = useRef(null);  // таймер переподключения

  // Видеопоток
  const [scale, setScale]           = useState(1);
  const [position, setPosition]     = useState({x:0,y:0});
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart]   = useState({x:0,y:0});
  const [connectionStatus, setConnectionStatus] = useState('connecting');

  // Панель
  const [activePanel, setActivePanel] = useState(null);

  // Обводки на видео — сохраняем в localStorage, чтобы не сбрасывались при перезагрузке / переключении камеры
  const [displaySelected, setDisplaySelected] = useState(() => {
    try {
      const stored = localStorage.getItem(`apd_display_${name}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [...DETECTABLE];
  });

  // Происшествия — храним от новых к старым (индекс 0 = новейший)
  const [incidents, setIncidents]           = useState([]);
  const [incidentFilter, setIncidentFilter] = useState('all');
  const [newIncidentIndicator, setNewIncidentIndicator] = useState(false);

  // Уведомления
  const [timeRange, setTimeRange]         = useState(3600);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userName, setUserName]           = useState('');
  const [userEmail, setUserEmail]         = useState('');
  const [userPhone, setUserPhone]         = useState('');
  const [siteSubs, setSiteSubs]           = useState([]);
  const [phoneSubs, setPhoneSubs]         = useState([]);
  const [telegramSubs, setTelegramSubs]     = useState([]);
  const [userTelegram, setUserTelegram]     = useState('');
  const [showTgInput,  setShowTgInput]      = useState(false);
  const [tgInput,      setTgInput]          = useState('');
  const [emailSubs, setEmailSubs]         = useState([]);
  const [openChannel, setOpenChannel]     = useState(null);
  const [guestFilters, setGuestFilters]   = useState([...INCIDENT_TYPES]);
  const [wsNotifStatus, setWsNotifStatus] = useState('disconnected');

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [theme, setTheme] = useTheme();
  const [toastMsg, setToastMsg]   = useState('');
  const [showToast, setShowToast] = useState(false);

  // Управление потоком камеры
  const [processCamera,      setProcessCamera]      = useState(true);
  const [detectionSelected,  setDetectionSelected]  = useState([...DETECTABLE]);
  const [isSuperAdmin,       setIsSuperAdmin]        = useState(false);
  const [hasZones,           setHasZones]            = useState(false);
  const [speedLimit,         setSpeedLimit]          = useState(60);
  const [editingSpeedLimit,  setEditingSpeedLimit]   = useState(false);
  const [speedLimitInput,    setSpeedLimitInput]     = useState('60');

  // Ссылки на актуальные значения для замыканий WS
  const siteSubsRef      = useRef(siteSubs);
  const timeRangeRef     = useRef(timeRange);
  const isAuthRef        = useRef(isAuthenticated);
  const processCameraRef = useRef(true);
  const detectionRef     = useRef([...DETECTABLE]);
  // Инициализируем displayRef сразу с актуальным значением из localStorage (через displaySelected),
  // чтобы первый connectVideoWs() уже отправлял правильные display_filters, не дожидаясь эффекта
  const displayRef       = useRef(displaySelected);
  const videoReconnTimer = useRef(null);
  // Флаг: подписки только что пришли с сервера, не отправлять update_subscriptions
  const subsFromServerRef  = useRef(false);
  // Флаг: состояние детекции уже инициализировано из БД для текущей камеры
  const cameraZonesInitedRef = useRef(false);
  // Флаг первого рендера: на initial-mount processCamera-эффект не должен вызывать connectVideoWs,
  // потому что эффект [name] уже делает это; только пользовательские изменения processCamera — connect/disconnect
  const processCameraFirstRunRef = useRef(true);
  // Реф для isSuperAdmin — чтобы читать актуальное значение в эффектах без лишних зависимостей
  const isSuperAdminRef    = useRef(false);
  useEffect(() => { isSuperAdminRef.current = isSuperAdmin; }, [isSuperAdmin]);
  useEffect(()=>{ siteSubsRef.current      = siteSubs;         },[siteSubs]);
  useEffect(()=>{ timeRangeRef.current     = timeRange;        },[timeRange]);
  useEffect(()=>{ isAuthRef.current        = isAuthenticated;  },[isAuthenticated]);
  useEffect(()=>{ processCameraRef.current = processCamera;    },[processCamera]);
  useEffect(()=>{ detectionRef.current     = detectionSelected;},[detectionSelected]);
  useEffect(()=>{ displayRef.current       = displaySelected;  },[displaySelected]);
  // Сохраняем displaySelected в localStorage при каждом изменении
  useEffect(()=>{
    try { localStorage.setItem(`apd_display_${name}`, JSON.stringify(displaySelected)); } catch {}
  },[displaySelected]);
  // При смене камеры — сбрасываем флаги и состояние камеры
  // (React Router не ремаунтит компонент при смене :name, поэтому сбрасываем вручную)
  useEffect(()=>{
    cameraZonesInitedRef.current     = false;
    processCameraFirstRunRef.current = true;
    setProcessCamera(true);              // camera-zones перезапишет, если нужно
    setDetectionSelected([...DETECTABLE]);
    // Загружаем display-настройки для новой камеры из localStorage.
    // Обновляем displayRef.current сразу же (до того как [name]-эффект вызовет connectVideoWs),
    // чтобы первый WS-кадр получил правильные display_filters.
    let newDisplay = [...DETECTABLE];
    try {
      const stored = localStorage.getItem(`apd_display_${name}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) newDisplay = parsed;
      }
    } catch {}
    displayRef.current = newDisplay;
    setDisplaySelected(newDisplay);
  },[name]);

  const T = {
    dark:  {bg:'bg-gray-900',text:'text-white',cardBg:'bg-gray-800',border:'border-gray-700',btn:'bg-gray-700 hover:bg-gray-600',input:'bg-gray-700 text-white border-gray-600'},
    light: {bg:'bg-gray-100',text:'text-gray-900',cardBg:'bg-white',border:'border-gray-300',btn:'bg-gray-200 hover:bg-gray-300',input:'bg-white text-gray-900 border-gray-300'},
  }[theme];

  const toast = (msg,ms=3000) => { setToastMsg(msg); setShowToast(true); setTimeout(()=>setShowToast(false),ms); };
  const fmtTime = d => new Date(d).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
  const fmtDate = d => new Date(d).toLocaleDateString('ru-RU');

  const openPanel = n => setActivePanel(prev => prev===n ? null : n);

  const computeBackendFilters = sel => {
    if (!sel.length) return [];
    const keys = sel.map(s=>DISPLAY_TO_BACKEND[s]).filter(Boolean);
    return keys.length === Object.keys(DISPLAY_TO_BACKEND).length ? ['all'] : keys;
  };

  // ── Проверка токена + профиль + суперадмин ──────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) return;
    let email = '';
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.sub) {
        email = payload.sub;
        setIsAuthenticated(true);
        setUserEmail(email);
        setUserName(email.split('@')[0]);
      }
    } catch {}
    fetch(`${import.meta.env.VITE_API_URL}/user/profile`, {headers:{Authorization:`Bearer ${token}`}})
      .then(r=>r.json())
      .then(d=>{ if(d.telegram) setUserTelegram(d.telegram); })
      .catch(()=>{});
    if (email) {
      fetch(`${import.meta.env.VITE_API_URL}/superadmins`)
        .then(r=>r.json())
        .then(admins=>{ if(admins.includes(email)) setIsSuperAdmin(true); })
        .catch(()=>{});
    }
  }, []);

  // Загружаем зоны и текущее состояние детекции из БД
  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/camera-zones?name=${encodeURIComponent(name)}`)
      .then(r=>r.json())
      .then(d=>{
        const has = (d.road_zones?.length>0)||(d.stop_zones?.length>0)||(d.crosswalk_zones?.length>0);
        setHasZones(has);
        if (d.speed_limit != null) { setSpeedLimit(d.speed_limit); setSpeedLimitInput(String(d.speed_limit)); }
        // Инициализируем processCamera / detectionSelected из столбца incidents
        // Только при первой загрузке камеры (флаг cameraZonesInitedRef),
        // чтобы не затирать ручные изменения пользователя при повторном срабатывании эффекта
        if (!cameraZonesInitedRef.current) {
          if (d.work === false) setProcessCamera(false);
          const inc = d.incidents;
          if (Array.isArray(inc)) {
            if (isSuperAdmin) {
              const displayNames = inc.map(k => BACKEND_TO_DISPLAY[k]).filter(Boolean);
              setDetectionSelected(displayNames);
              cameraZonesInitedRef.current = true;
            }
            // else: эффект перезапустится когда isSuperAdmin станет true
          } else {
            // null → оставляем дефолт (всё включено)
            cameraZonesInitedRef.current = true;
          }
        }
      })
      .catch(()=>{});
  }, [name, isSuperAdmin]);

  // ── WS видеопотока с автопереподключением ────────────────────────────────
  const connectVideoWs = useCallback(() => {
    clearTimeout(videoReconnTimer.current);
    if (videoWsRef.current) { videoWsRef.current.onclose = null; videoWsRef.current.close(); }
    if (!processCameraRef.current) { setConnectionStatus('disconnected'); return; }

    setConnectionStatus('connecting');
    const ws = new WebSocket('ws://localhost:8000/ws');
    videoWsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({
        camera:          name,
        filters:         computeBackendFilters(detectionRef.current),
        display_filters: computeBackendFilters(displayRef.current),
      }));
      setConnectionStatus('connected');
    };
    ws.onmessage = event => {
      if (typeof event.data === 'string') { if (event.data === 'ping') ws.send('pong'); return; }
      const blob = new Blob([event.data], {type:'image/jpeg'});
      const url  = URL.createObjectURL(blob);
      const img  = document.getElementById('camera-img');
      if (!img) return;
      img.src = url;
      img.onload = () => {
        const loader = document.getElementById('loader');
        if (loader) loader.style.display = 'none';
        if (img.dataset.prev) URL.revokeObjectURL(img.dataset.prev);
        img.dataset.prev = url;
      };
    };
    ws.onerror = () => setConnectionStatus('error');
    ws.onclose = () => {
      setConnectionStatus('disconnected');
      if (processCameraRef.current) {
        videoReconnTimer.current = setTimeout(connectVideoWs, WS_RECONNECT_DELAY);
      }
    };
  }, [name]);

  useEffect(() => {
    connectVideoWs();
    return () => {
      clearTimeout(videoReconnTimer.current);
      if (videoWsRef.current) { videoWsRef.current.onclose = null; videoWsRef.current.close(); }
    };
  }, [name]);

  // вкл/выкл камеры + сохранение в БД (только суперадмин)
  useEffect(() => {
    // На первом рендере начальное подключение уже выполнено эффектом [name]; пропускаем
    if (processCameraFirstRunRef.current) {
      processCameraFirstRunRef.current = false;
      return;
    }
    if (!processCamera) {
      clearTimeout(videoReconnTimer.current);
      if (videoWsRef.current) { videoWsRef.current.onclose = null; videoWsRef.current.close(); }
      setConnectionStatus('disconnected');
    } else {
      connectVideoWs();
    }
    if (!isSuperAdminRef.current) return;
    const token = localStorage.getItem('access_token');
    fetch(`${import.meta.env.VITE_API_URL}/camera-work`, {
      method: 'POST',
      headers: {'Content-Type':'application/json', Authorization:`Bearer ${token}`},
      body: JSON.stringify({name, work: processCamera}),
    })
      .then(r => { if (!r.ok) toast(`Ошибка сохранения состояния камеры (${r.status})`); })
      .catch(() => toast('Ошибка соединения'));
  }, [processCamera, connectVideoWs, name]);

  // обновить display_filters на лету
  useEffect(() => {
    const ws = videoWsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({type:'set_display_filters', display_filters:computeBackendFilters(displaySelected)}));
  }, [displaySelected]);

  // обновить detection filters на лету (видео WS + сохранение в БД для суперадмина)
  useEffect(() => {
    const ws = videoWsRef.current;
    if (ws?.readyState === WebSocket.OPEN)
      ws.send(JSON.stringify({type:'set_filters', filters:computeBackendFilters(detectionSelected)}));
    if (!isSuperAdminRef.current) return;
    const token = localStorage.getItem('access_token');
    const incidents = detectionSelected.map(d => DISPLAY_TO_BACKEND[d]).filter(Boolean);
    fetch(`${import.meta.env.VITE_API_URL}/camera-incidents`, {
      method: 'POST',
      headers: {'Content-Type':'application/json', Authorization:`Bearer ${token}`},
      body: JSON.stringify({name, incidents}),
    })
      .then(r => { if (!r.ok) toast(`Ошибка сохранения настроек (${r.status})`); })
      .catch(() => toast('Ошибка соединения при сохранении настроек'));
  }, [detectionSelected, name]);

  // ── WS уведомлений с автопереподключением ────────────────────────────────
  const connectNotifWs = useCallback(() => {
    clearTimeout(notifReconnTimer.current);
    if (notifWsRef.current) {
      notifWsRef.current.onclose = null; // не тригерим переподключение при намеренном закрытии
      notifWsRef.current.close();
    }

    setWsNotifStatus('connecting');
    const ws = new WebSocket('ws://localhost:8000/ws/notifications');
    notifWsRef.current = ws;

    ws.onopen = () => {
      setWsNotifStatus('connected');
      ws.send(JSON.stringify({
        camera:        name,
        token:         localStorage.getItem('access_token') || '',
        time_range:    timeRangeRef.current,
        subscriptions: isAuthRef.current ? siteSubsRef.current : [],
      }));
    };

    ws.onmessage = event => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type==='connected') {
          setIsAuthenticated(msg.authenticated);
          if (msg.authenticated && msg.subscriptions) {
            subsFromServerRef.current = true;
            setSiteSubs(msg.subscriptions);
          }
          if (msg.authenticated && msg.telegram_subscriptions != null)
            setTelegramSubs(msg.telegram_subscriptions);
          if (msg.authenticated && msg.email_subscriptions != null)
            setEmailSubs(msg.email_subscriptions);
        }

        if (msg.type==='incidents') {
          const list = msg.incidents || [];
          if (msg.reset) {
            // Полная замена списка (после смены подписок или периода)
            const mapped = list.map(i => ({
              id:         i.id,
              time:       fmtTime(i.date),
              date:       fmtDate(i.date),
              type:       i.notification_text,
              severity:   i.severity,
              screenshot: i.screenshot_name,
            }));
            mapped.sort((a,b) => b.id - a.id);
            setIncidents(mapped.slice(0, 200));
          } else if (list.length) {
            setIncidents(prev => {
              const ids    = new Set(prev.map(x=>x.id));
              const mapped = list
                .filter(i => !ids.has(i.id))
                .map(i => ({
                  id:         i.id,
                  time:       fmtTime(i.date),
                  date:       fmtDate(i.date),
                  type:       i.notification_text,
                  severity:   i.severity,
                  screenshot: i.screenshot_name,
                }));
              if (!mapped.length) return prev;
              const merged = [...mapped, ...prev];
              merged.sort((a,b) => b.id - a.id);
              const isNew = mapped.some(m => !prev.find(p=>p.id===m.id));
              if (isNew) setNewIncidentIndicator(true);
              return merged.slice(0, 200);
            });
          }
        }

        if (msg.type==='subscriptions_saved') toast('Подписки сохранены ✓');

      } catch {}
    };

    ws.onerror = () => setWsNotifStatus('error');

    ws.onclose = () => {
      setWsNotifStatus('disconnected');
      // Автопереподключение через 5 сек
      notifReconnTimer.current = setTimeout(() => {
        console.log('[ws/notifications] переподключение...');
        connectNotifWs();
      }, WS_RECONNECT_DELAY);
    };
  }, [name]);

  useEffect(() => {
    connectNotifWs();
    return () => {
      clearTimeout(notifReconnTimer.current);
      if (notifWsRef.current) {
        notifWsRef.current.onclose = null;
        notifWsRef.current.close();
      }
    };
  }, [name]);

  // Сбрасываем флаг subsFromServerRef когда siteSubs пришли с сервера
  // (чтобы не дублировать update_subscriptions обратно на сервер)
  useEffect(() => {
    if (subsFromServerRef.current) { subsFromServerRef.current = false; }
  }, [siteSubs]);

  const sendTimeRangeUpdate = newTr => {
    setTimeRange(newTr);
    setIncidents([]);
    const ws = notifWsRef.current;
    if (ws?.readyState===WebSocket.OPEN)
      ws.send(JSON.stringify({type:'update_time_range', time_range:newTr}));
  };

  const saveTelegram = async (username) => {
    const token = localStorage.getItem('access_token');
    if (!token) return;
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/user/telegram`, {
        method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
        body: JSON.stringify({telegram: username.replace(/^@/,'')})
      });
      if (res.ok) { setUserTelegram(username.replace(/^@/,'')); setShowTgInput(false); setTgInput(''); toast('Telegram сохранён ✓'); }
    } catch {}
  };



  const saveSiteSubs = async (newSubs) => {
    setSiteSubs(newSubs);
    setOpenChannel(null);
    const token = localStorage.getItem('access_token');
    if (!token) return;
    // HTTP-сохранение — гарантированно попадает в БД
    try {
      await fetch(`${import.meta.env.VITE_API_URL}/user/site-notifications`, {
        method: 'POST',
        headers: {'Content-Type':'application/json', Authorization:`Bearer ${token}`},
        body: JSON.stringify({camera: name, subscriptions: newSubs}),
      });
    } catch {}
    // WS-обновление — обновляет in-memory фильтр и перезагружает историю
    const ws = notifWsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({type:'update_subscriptions', subscriptions: newSubs}));
    }
  };

  const saveTelegramSubs = async (subs) => {
    const token = localStorage.getItem('access_token');
    if (!token) return;
    try {
      await fetch(`${import.meta.env.VITE_API_URL}/user/telegram-subscriptions`, {
        method: 'POST',
        headers: {'Content-Type':'application/json', Authorization:`Bearer ${token}`},
        body: JSON.stringify({camera: name, subscriptions: subs}),
      });
      toast('Telegram-подписки сохранены ✓');
    } catch { toast('Ошибка сохранения'); }
    setOpenChannel(null);
  };

  const saveEmailSubs = async (subs) => {
    const token = localStorage.getItem('access_token');
    if (!token) return;
    try {
      await fetch(`${import.meta.env.VITE_API_URL}/user/email-subscriptions`, {
        method: 'POST',
        headers: {'Content-Type':'application/json', Authorization:`Bearer ${token}`},
        body: JSON.stringify({camera: name, subscriptions: subs}),
      });
      toast('Email-подписки сохранены ✓');
    } catch { toast('Ошибка сохранения'); }
    setOpenChannel(null);
  };

  useEffect(() => {
    if (newIncidentIndicator) {
      const t = setTimeout(()=>setNewIncidentIndicator(false),3000);
      return ()=>clearTimeout(t);
    }
  }, [newIncidentIndicator]);

  // ── Масштаб ───────────────────────────────────────────────────────────────
  const handleWheel = useCallback(e => {
    if (!imageContainerRef.current) return;
    e.preventDefault();
    const delta    = e.deltaY>0 ? -0.1 : 0.1;
    const newScale = Math.min(Math.max(scale+delta,0.5),5);
    const rect     = imageContainerRef.current.getBoundingClientRect();
    const mx = e.clientX-rect.left, my = e.clientY-rect.top;
    const sf = newScale/scale;
    setScale(newScale);
    setPosition({x:mx-(mx-position.x)*sf, y:my-(my-position.y)*sf});
  }, [scale, position]);

  const zoomIn    = () => setScale(p=>Math.min(p+0.2,5));
  const zoomOut   = () => setScale(p=>Math.max(p-0.2,0.5));
  const resetZoom = () => { setScale(1); setPosition({x:0,y:0}); };
  const handleMouseDown = e => { if(scale>1){setIsDragging(true);setDragStart({x:e.clientX-position.x,y:e.clientY-position.y});} };
  const handleMouseMove = e => { if(isDragging&&scale>1) setPosition({x:e.clientX-dragStart.x,y:e.clientY-dragStart.y}); };
  const handleMouseUp   = () => setIsDragging(false);

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    setIsAuthenticated(false); setUserName(''); setUserEmail('');
    setSiteSubs([]); setTelegramSubs([]); setEmailSubs([]);
    setUserTelegram(''); setIsSuperAdmin(false);
    toast('Вы вышли');
    connectNotifWs();
  };

  const filteredIncidents = (() => {
    let f = incidents;
    if (!isAuthenticated) f = f.filter(i => guestFilters.includes(i.type));
    if (incidentFilter==='highSeverity')   f = f.filter(i=>i.severity>=4);
    if (incidentFilter==='mediumSeverity') f = f.filter(i=>i.severity===3);
    if (incidentFilter==='lowSeverity')    f = f.filter(i=>i.severity<=2);
    return f;
  })();

  const sevColor = s => s>=4?'bg-red-600':s>=3?'bg-orange-500':s>0?'bg-yellow-500':'bg-gray-500';

  return (
    <div className={`min-h-screen ${T.bg} ${T.text} overflow-hidden`}>

      {/* ── Шапка ── */}
      <div className={`fixed top-0 left-0 right-0 z-30 ${T.cardBg} shadow-lg border-b ${T.border}`}>
        <div className="flex items-center justify-between px-4 py-2 gap-3">
          {/* Левая часть */}
          <div className="flex items-center gap-2">
            <button onClick={()=>navigate('/')}
              className={`w-9 h-9 rounded-full ${T.btn} flex items-center justify-center text-lg hover:scale-105 transition-all`}>←</button>
            <button onClick={()=>navigate(`/statistics/${encodeURIComponent(name)}`)}
              className={`w-9 h-9 rounded-full ${T.btn} flex items-center justify-center hover:scale-105 transition-all`}
              title="Статистика">📊</button>
            <button onClick={()=>setTheme(theme==='dark'?'light':'dark')}
              className={`w-9 h-9 rounded-full ${T.btn} flex items-center justify-center hover:scale-105 transition-all`}>
              {theme==='dark'?'☀️':'🌙'}
            </button>
            {isAuthenticated ? (
              <div className="flex items-center gap-2 ml-1">
                <span className="text-sm font-semibold opacity-80">👤 {userName}</span>
                <button onClick={handleLogout}
                  className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-gray-700">Выйти</button>
              </div>
            ) : (
              <button onClick={()=>setShowAuthModal(true)}
                className="ml-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold">
                Войти
              </button>
            )}
          </div>

          {/* Центр */}
          <div className="flex items-center gap-3">
            <h1 className="text-base font-bold truncate max-w-48">📷 {name||'—'}</h1>
            <div className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${connectionStatus==='connected'?'bg-green-500':'bg-red-500'}`}/>
              <span className="text-xs opacity-70">{connectionStatus==='connected'?'Онлайн':'Офлайн'}</span>
            </div>
          </div>

          {/* Правая часть */}
          <div className="flex items-center gap-2">
            <button onClick={()=>openPanel('imageControls')}
              className={`w-9 h-9 rounded-full ${T.btn} flex items-center justify-center hover:scale-105 transition-all ${activePanel==='imageControls'?'ring-2 ring-indigo-500':''}`}>🖼️</button>
            <button onClick={()=>openPanel('incidents')}
              className={`relative w-9 h-9 rounded-full ${T.btn} flex items-center justify-center hover:scale-105 transition-all ${activePanel==='incidents'?'ring-2 ring-indigo-500':''}`}>
              ⚠️
              {newIncidentIndicator&&<span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full animate-ping"/>}
              {filteredIncidents.length>0&&(
                <span className="absolute -bottom-1 -right-1 min-w-[16px] h-4 bg-red-500 rounded-full text-white text-[9px] font-bold flex items-center justify-center px-0.5">
                  {filteredIncidents.length>99?'99+':filteredIncidents.length}
                </span>
              )}
            </button>
            <button onClick={()=>openPanel('notifications')}
              className={`relative w-9 h-9 rounded-full ${T.btn} flex items-center justify-center hover:scale-105 transition-all ${activePanel==='notifications'?'ring-2 ring-indigo-500':''}`}>
              📢
              <span className={`absolute -bottom-1 -left-1 w-2 h-2 rounded-full ${wsNotifStatus==='connected'?'bg-green-500':wsNotifStatus==='connecting'?'bg-yellow-500':'bg-red-500'}`}/>
            </button>
          </div>
        </div>
      </div>

      {/* ── Видео ── */}
      <div ref={imageContainerRef} className="fixed inset-0 z-10" style={{top:52}}
           onWheel={handleWheel} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
        <div ref={containerRef} className="w-full h-full overflow-hidden bg-black relative"
             onMouseDown={handleMouseDown}
             style={{cursor:scale>1?(isDragging?'grabbing':'grab'):'default'}}>
          <div style={{transform:`scale(${scale}) translate(${position.x/scale}px,${position.y/scale}px)`,
                       transformOrigin:'0 0',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',
                       transition:isDragging?'none':'transform 0.1s ease'}}>
            <img id="camera-img" alt="Камера"
              src="https://aif-s3.aif.ru/images/009/509/f66c73edbc0f02aeae694097bdfd0f26.jpg"
              style={{maxWidth:'100%',maxHeight:'100%',objectFit:'contain'}}/>
          </div>
          <div id="loader" style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.7)',zIndex:10}}>
            <div style={{width:48,height:48,border:'6px solid #f3f3f3',borderTop:'6px solid #3498db',borderRadius:'50%',animation:'spin 1s linear infinite'}}/>
          </div>
        </div>
      </div>

      {/* ── Панель изображения ── */}
      {activePanel==='imageControls'&&(
        <div className={`fixed right-4 top-16 z-20 w-72 ${T.cardBg} rounded-lg shadow-xl border ${T.border} animate-slide-in-right overflow-y-auto`}
             style={{maxHeight:'calc(100vh - 5rem)'}}>
          <div className="flex justify-between items-center p-3 border-b">
            <h3 className="font-semibold text-sm">🖼️ Изображение</h3>
            <button onClick={()=>setActivePanel(null)} className="hover:opacity-70">✕</button>
          </div>
          <div className="p-3 space-y-3">

            {/* Удаление камеры — только суперадмин */}
            {isSuperAdmin&&(
              <button
                onClick={async () => {
                  if (!window.confirm(`Удалить камеру "${name}"?\n\nЭто действие нельзя отменить.`)) return;
                  const token = localStorage.getItem('access_token');
                  try {
                    await fetch(`${import.meta.env.VITE_API_URL}/cameras/${encodeURIComponent(name)}`, {
                      method: 'DELETE',
                      headers: { Authorization: `Bearer ${token}` },
                    });
                    navigate('/');
                  } catch {
                    toast('Ошибка удаления камеры');
                  }
                }}
                className="w-full py-2 rounded text-sm font-semibold bg-red-700 hover:bg-red-600 text-white transition-colors">
                🗑️ Удалить камеру
              </button>
            )}

            {/* Мастер-кнопка — только суперадмин с настроенными зонами */}
            {isSuperAdmin&&(
              <button onClick={()=>setProcessCamera(p=>!p)}
                className={`w-full py-2 rounded text-sm font-semibold transition-colors ${
                  processCamera ? 'bg-green-700 hover:bg-green-600 text-white'
                                : 'bg-gray-600 hover:bg-gray-500 text-gray-300'
                }`}>
                {processCamera ? '🟢 Обрабатывать камеру' : '⚫ Камера отключена'}
              </button>
            )}

            {/* Зум */}
            <div className="flex gap-2">
              <button onClick={zoomIn}    className={`flex-1 py-1.5 rounded ${T.btn} text-sm`}>➕</button>
              <button onClick={zoomOut}   className={`flex-1 py-1.5 rounded ${T.btn} text-sm`}>➖</button>
              <button onClick={resetZoom} className={`flex-1 py-1.5 rounded ${T.btn} text-sm`}>⟲</button>
            </div>
            <div className="text-center text-xs opacity-60">Масштаб: {Math.round(scale*100)}%</div>

            {/* Обнаруживать — только суперадмин с настроенными зонами */}
            {isSuperAdmin&&(
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold">Обнаруживать:</span>
                  <button onClick={()=>setDetectionSelected(detectionSelected.length===DETECTABLE.length?[]:[...DETECTABLE])}
                    className="text-xs text-indigo-400 hover:text-indigo-300">
                    {detectionSelected.length===DETECTABLE.length?'Снять все':'Все'}
                  </button>
                </div>
                <div className="space-y-1 p-2 rounded border border-gray-600">
                  {DETECTABLE.map(type=>(
                    <div key={type} className="flex items-center gap-1 hover:bg-gray-700 px-1 py-0.5 rounded">
                      <label className="flex items-center gap-2 cursor-pointer text-sm flex-1 min-w-0">
                        <input type="checkbox" checked={detectionSelected.includes(type)}
                          onChange={()=>setDetectionSelected(prev=>prev.includes(type)?prev.filter(x=>x!==type):[...prev,type])}
                          className="accent-indigo-500"/>
                        <span className="text-xs">{type}</span>
                      </label>
                      {type==='Превышение скорости'&&(
                        editingSpeedLimit?(
                          <div className="flex items-center gap-1 ml-1">
                            <input
                              type="number" min="1" max="300"
                              value={speedLimitInput}
                              onChange={e=>setSpeedLimitInput(e.target.value)}
                              onKeyDown={e=>{
                                if(e.key==='Enter') {
                                  const v=parseFloat(speedLimitInput);
                                  if(!isNaN(v)&&v>0&&v<=300){
                                    const token=localStorage.getItem('access_token');
                                    fetch(`${import.meta.env.VITE_API_URL}/cameras/${encodeURIComponent(name)}/speed-limit`,{
                                      method:'PATCH',
                                      headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
                                      body:JSON.stringify({speed_limit:v}),
                                    }).then(r=>r.json()).then(d=>{if(d.ok){setSpeedLimit(v);toast(`Лимит скорости: ${v} км/ч`);}}).catch(()=>{});
                                    setEditingSpeedLimit(false);
                                  }
                                }
                                if(e.key==='Escape') setEditingSpeedLimit(false);
                              }}
                              className="w-16 text-xs px-1 py-0.5 rounded bg-gray-600 border border-gray-500 text-white"
                              autoFocus/>
                            <span className="text-xs text-gray-400">км/ч</span>
                            <button onClick={()=>{
                              const v=parseFloat(speedLimitInput);
                              if(!isNaN(v)&&v>0&&v<=300){
                                const token=localStorage.getItem('access_token');
                                fetch(`${import.meta.env.VITE_API_URL}/cameras/${encodeURIComponent(name)}/speed-limit`,{
                                  method:'PATCH',
                                  headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
                                  body:JSON.stringify({speed_limit:v}),
                                }).then(r=>r.json()).then(d=>{if(d.ok){setSpeedLimit(v);toast(`Лимит скорости: ${v} км/ч`);}}).catch(()=>{});
                              }
                              setEditingSpeedLimit(false);
                            }} className="text-xs text-green-400 hover:text-green-300">✓</button>
                            <button onClick={()=>setEditingSpeedLimit(false)} className="text-xs text-gray-400 hover:text-white">✕</button>
                          </div>
                        ):(
                          <button onClick={()=>{setSpeedLimitInput(String(speedLimit));setEditingSpeedLimit(true);}}
                            className="text-xs text-indigo-400 hover:text-indigo-300 whitespace-nowrap ml-1">
                            {speedLimit} км/ч
                          </button>
                        )
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Отображать */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold">Отображать:</span>
                <button onClick={()=>setDisplaySelected(displaySelected.length===DETECTABLE.length?[]:[...DETECTABLE])}
                  className="text-xs text-indigo-400 hover:text-indigo-300">
                  {displaySelected.length===DETECTABLE.length?'Снять все':'Все'}
                </button>
              </div>
              <div className="space-y-1 p-2 rounded border border-gray-600">
                {DETECTABLE.map(type=>(
                  <label key={type} className="flex items-center gap-2 cursor-pointer text-sm hover:bg-gray-700 px-1 py-0.5 rounded">
                    <input type="checkbox" checked={displaySelected.includes(type)}
                      onChange={()=>setDisplaySelected(prev=>prev.includes(type)?prev.filter(x=>x!==type):[...prev,type])}
                      className="accent-indigo-500"/>
                    <span className="text-xs">{type}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Зоны — только для суперадминов */}
            {isSuperAdmin&&(
              <button onClick={()=>navigate(`/camera/${name}/zones`)}
                className={`w-full py-1.5 rounded ${T.btn} text-sm`}>⚙️ Зоны</button>
            )}
          </div>
        </div>
      )}

      {/* ── Панель происшествий ── */}
      {activePanel==='incidents'&&(
        <div className={`fixed right-4 top-16 z-20 w-96 max-h-[calc(100vh-80px)] ${T.cardBg} rounded-lg shadow-xl border ${T.border} animate-slide-in-right overflow-hidden flex flex-col`}>
          <div className="flex justify-between items-center p-3 border-b">
            <h3 className="font-semibold text-sm">⚠️ Происшествия ({filteredIncidents.length})</h3>
            <button onClick={()=>setActivePanel(null)} className="hover:opacity-70">✕</button>
          </div>
          <div className="p-3 space-y-2 overflow-y-auto flex-1">
            <select value={incidentFilter} onChange={e=>setIncidentFilter(e.target.value)}
              className={`w-full px-3 py-1.5 rounded ${T.input} border text-sm`}>
              <option value="all">Все</option>
              <option value="highSeverity">Тяжёлые (4–5)</option>
              <option value="mediumSeverity">Средние (3)</option>
              <option value="lowSeverity">Лёгкие (1–2)</option>
            </select>
            {filteredIncidents.length===0 ? (
              <div className="text-center py-8 opacity-50 text-sm">
                <p>Нет происшествий</p>
                {!isAuthenticated&&<p className="text-xs mt-1">Настройте фильтры в 📢</p>}
              </div>
            ) : filteredIncidents.map(inc=>(
              <div key={inc.id}
                onClick={()=>navigate(`/incident/${inc.id}`, { state: { source:'camera', camera:name, timeFrom: timeRange>0 ? new Date(Date.now()-timeRange*1000).toISOString() : null } })}
                className={`p-2.5 rounded ${T.btn} text-sm cursor-pointer hover:ring-1 hover:ring-indigo-400 transition-all`}>
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold flex-1 text-xs">{inc.type}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    {inc.screenshot&&<span className="text-xs opacity-40">📷</span>}
                    <span className={`px-1.5 py-0.5 rounded text-xs text-white ${sevColor(inc.severity)}`}>{inc.severity}</span>
                  </div>
                </div>
                <div className="text-xs opacity-50 mt-0.5">🕐 {inc.time} · {inc.date}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Панель уведомлений ── */}
      {activePanel==='notifications'&&(
        <div className={`fixed right-4 top-16 z-20 w-80 ${T.cardBg} rounded-lg shadow-xl border ${T.border} animate-slide-in-right`}>
          <div className="flex justify-between items-center p-3 border-b">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm">📢 Уведомления</h3>
              <span className={`text-xs px-1.5 py-0.5 rounded ${wsNotifStatus==='connected'?'bg-green-900 text-green-300':wsNotifStatus==='connecting'?'bg-yellow-900 text-yellow-300':'bg-red-900 text-red-300'}`}>
                {wsNotifStatus==='connected'?'live':wsNotifStatus==='connecting'?'подкл.':'офлайн'}
              </span>
            </div>
            <button onClick={()=>setActivePanel(null)} className="hover:opacity-70">✕</button>
          </div>
          <div className="p-3 space-y-3">

            {!isAuthenticated  ? (
              <>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold">Типы:</span>
                    <button onClick={()=>setGuestFilters(guestFilters.length===INCIDENT_TYPES.length?[]: [...INCIDENT_TYPES])}
                      className="text-xs text-indigo-400 hover:text-indigo-300">
                      {guestFilters.length===INCIDENT_TYPES.length?'Снять все':'Все'}
                    </button>
                  </div>
                  <div className="space-y-1 max-h-44 overflow-y-auto p-2 rounded border border-gray-600">
                    {INCIDENT_TYPES.map(type=>(
                      <label key={type} className="flex items-center gap-2 cursor-pointer text-xs hover:bg-gray-700 px-1 py-0.5 rounded">
                        <input type="checkbox" checked={guestFilters.includes(type)}
                          onChange={()=>setGuestFilters(prev=>prev.includes(type)?prev.filter(x=>x!==type):[...prev,type])}
                          className="accent-indigo-500"/>
                        <span>{type}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <p className="text-xs opacity-50 text-center">Войдите для сохранения настроек</p>
                <button onClick={()=>{setActivePanel(null);setShowAuthModal(true);}}
                  className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm font-semibold">Войти</button>
              </>
            ) : (
              <>
                <div>
                  <label className="text-sm font-semibold block mb-1">Промежуток:</label>
                  <div className="flex gap-1 flex-wrap">
                    {TIME_RANGE_OPTIONS.map(o=>(
                      <button key={o.value} onClick={()=>sendTimeRangeUpdate(o.value)}
                        className={`px-2 py-1 rounded text-xs transition-colors ${timeRange===o.value?'bg-indigo-600 text-white':'bg-gray-700 hover:bg-gray-600'}`}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-sm font-semibold block mb-2">Получать:</label>

                  <div>
                    <button onClick={()=>setOpenChannel(p=>p==='site'?null:'site')}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded ${T.btn} text-sm ${openChannel==='site'?'ring-2 ring-indigo-500':''}`}>
                      <span>💻 На сайте</span>
                      <span className="text-xs opacity-60">{siteSubs.length?`${siteSubs.length} тип.`:'—'}</span>
                    </button>
                    {openChannel==='site'&&(
                      <TypeSelector title="Уведомления на сайте" selected={siteSubs}
                        onToggle={t=>setSiteSubs(p=>p.includes(t)?p.filter(x=>x!==t):[...p,t])}
                        onClose={()=>setOpenChannel(null)}
                        onSave={()=>saveSiteSubs(siteSubs)} saveLabel="Сохранить"/>
                    )}
                  </div>

                  <div className="mt-1">
                    <button onClick={()=>setOpenChannel(p=>p==='telegram'?null:'telegram')}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded ${T.btn} text-sm ${openChannel==='telegram'?'ring-2 ring-indigo-500':''}`}>
                      <span>✈️ Telegram{userTelegram?` (@${userTelegram})`:''}</span>
                      <span className="text-xs opacity-60">
                        {!userTelegram ? <span className="text-yellow-400 text-xs">не указан</span> : telegramSubs.length?`${telegramSubs.length} тип.`:'—'}
                      </span>
                    </button>
                    {openChannel==='telegram'&&(
                      <div className="mt-2 p-3 bg-gray-700 rounded-lg border border-gray-600">
                        {!userTelegram||showTgInput ? (
                          <>
                            <p className="text-xs text-gray-300 mb-2">
                              {userTelegram?'Изменить Telegram:':'Укажите ваш Telegram username:'}
                            </p>
                            {!userTelegram&&(
                              <p className="text-xs text-yellow-400 mb-2">
                                Для получения уведомлений сначала запустите бота{' '}
                                <a href="https://t.me/Accident_DetectorBot" target="_blank"
                                  className="underline hover:text-yellow-300">@Accident_DetectorBot</a>
                              </p>
                            )}
                            <div className="flex gap-2 mb-2">
                              <input type="text" placeholder="@username" value={tgInput}
                                onChange={e=>setTgInput(e.target.value)}
                                onKeyDown={e=>e.key==='Enter'&&saveTelegram(tgInput)}
                                className="flex-1 px-2 py-1.5 rounded bg-gray-600 border border-gray-500 text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"/>
                              <button onClick={()=>saveTelegram(tgInput)} disabled={!tgInput.trim()}
                                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 rounded text-sm disabled:opacity-40">Сохранить</button>
                            </div>
                          </>
                        ) : (
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-green-400">✓ @{userTelegram}</span>
                            <button onClick={()=>{setShowTgInput(true);setTgInput(userTelegram);}}
                              className="text-xs text-gray-400 hover:text-white">изменить</button>
                          </div>
                        )}
                        {userTelegram&&!showTgInput&&(
                          <TypeSelector title="Уведомления в Telegram" selected={telegramSubs}
                            onToggle={t=>setTelegramSubs(p=>p.includes(t)?p.filter(x=>x!==t):[...p,t])}
                            onClose={()=>setOpenChannel(null)}
                            onSave={()=>saveTelegramSubs(telegramSubs)} saveLabel="Сохранить"/>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="mt-1">
                    <button onClick={()=>setOpenChannel(p=>p==='email'?null:'email')}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded ${T.btn} text-sm ${openChannel==='email'?'ring-2 ring-indigo-500':''}`}>
                      <span>📧 Email{userEmail?` (${userEmail})`:''}</span>
                      <span className="text-xs opacity-60">{emailSubs.length?`${emailSubs.length} тип.`:'—'}</span>
                    </button>
                    {openChannel==='email'&&(
                      <TypeSelector title="Email-уведомления" selected={emailSubs}
                        onToggle={t=>setEmailSubs(p=>p.includes(t)?p.filter(x=>x!==t):[...p,t])}
                        onClose={()=>setOpenChannel(null)}
                        onSave={()=>saveEmailSubs(emailSubs)} saveLabel="Сохранить"/>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showAuthModal&&(
        <AuthModal theme={theme} onClose={()=>setShowAuthModal(false)}
          onSuccess={email=>{
            setIsAuthenticated(true); setUserEmail(email); setUserName(email.split('@')[0]);
            setShowAuthModal(false); toast('Вы вошли ✓');
            connectNotifWs();
            const token = localStorage.getItem('access_token');
            fetch(`${import.meta.env.VITE_API_URL}/user/profile`, {headers:{Authorization:`Bearer ${token}`}})
              .then(r=>r.json()).then(d=>{ if(d.telegram) setUserTelegram(d.telegram); }).catch(()=>{});
            fetch(`${import.meta.env.VITE_API_URL}/superadmins`)
              .then(r=>r.json()).then(admins=>{ if(admins.includes(email)) setIsSuperAdmin(true); }).catch(()=>{});
          }}/>
      )}

      {showToast&&(
        <div className="fixed bottom-4 right-4 bg-gray-800 border border-gray-600 text-white px-4 py-2.5 rounded-lg shadow-lg z-50 animate-slide-in text-sm">
          {toastMsg}
        </div>
      )}

      <style>{`
        @keyframes slideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}
        @keyframes slideInRight{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes ping{0%{transform:scale(1);opacity:1}100%{transform:scale(3);opacity:0}}
        .animate-slide-in{animation:slideIn 0.3s ease-out}
        .animate-slide-in-right{animation:slideInRight 0.3s ease-out}
        .animate-ping{animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite}
      `}</style>
    </div>
  );
}

export default Camera;