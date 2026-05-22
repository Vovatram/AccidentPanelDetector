import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import deepEqual from 'fast-deep-equal';
import { createPortal } from 'react-dom';


const INCIDENT_TYPES = [
  'Стоянка в неположенном месте','ДТП','Превышение скорости',
  'Пешеход в неположенном месте','Затор','Движение по встречке','Сбитие пешехода'
];
const TIME_RANGE_OPTIONS = [
  {label:'15 мин',value:900},
  {label:'1 час',value:3600},
  {label:'6 часов',value:21600},
  {label:'24 часа',value:86400},
];
const WS_RECONNECT_DELAY = 5000;

const EVENT_COLORS = {
  'ДТП':                            '#ef4444',
  'Сбитие пешехода':                '#ef4444',
  'Стоянка в неположенном месте':   '#f59e0b',
  'Превышение скорости':            '#facc15',
  'Затор':                          '#f97316',
  'Пешеход в неположенном месте':   '#3b82f6',
  'Движение по встречке':           '#a855f7',
};



// ========== Компонент уведомлений ==========
const NotificationBell = ({ notifications, onMarkRead, onMarkAllRead, onDelete, onOpenSettings }) => {
  const [expanded, setExpanded] = useState(false);
  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div style={{ position: 'fixed', top: 480, left: 20, zIndex: 1100 }}>
      <div style={{ background: '#1e1e1e', borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', gap: 8 }}>
          <span role="img" aria-label="notifications" style={{ fontSize: 24 }}>🔔</span>
          {unreadCount > 0 && (
            <span style={{ background: 'red', borderRadius: 20, padding: '2px 8px', color: 'white', fontSize: 12 }}>
              {unreadCount}
            </span>
          )}
          <button onClick={() => setExpanded(!expanded)} style={{ background: 'none', border: 'none', color: 'white', fontSize: 20, cursor: 'pointer' }}>
            {expanded ? '▲' : '▼'}
          </button>
          <button onClick={onOpenSettings} style={{ background: 'none', border: 'none', color: 'white', fontSize: 20, cursor: 'pointer' }}>⚙️</button>
        </div>
        {expanded && (
          <div style={{ maxHeight: 400, overflowY: 'auto', padding: 8, minWidth: 300 }}>
            {unreadCount > 0 && (
              <button 
                onClick={onMarkAllRead} 
                style={{ width: '100%', marginBottom: 12, background: '#4caf50', border: 'none', borderRadius: 6, padding: '8px', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}
              >
                Прочитать все уведомления
              </button>
            )}
            {notifications.length === 0 && <div style={{ color: '#aaa', textAlign: 'center' }}>Нет уведомлений</div>}
            {notifications.map(notif => (
              <div key={notif.id} style={{ marginBottom: 8, padding: 8, borderRadius: 8, background: notif.read ? '#2a2a2a' : '#3a3a3a', borderLeft: `4px solid ${notif.color || '#ccc'}`, color: 'white' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong>{notif.cameraName}</strong>
                  <button onClick={() => onDelete(notif.id)} style={{ background: 'none', border: 'none', color: '#ff8888', cursor: 'pointer', fontSize: 16 }}>✕</button>
                </div>
                <div style={{ fontSize: 12 }}>{notif.eventType}</div>
                <div style={{ fontSize: 10, color: '#aaa' }}>{new Date(notif.date).toLocaleString()}</div>
                {!notif.read && (
                  <button onClick={() => onMarkRead(notif.id)} style={{ fontSize: 10, marginTop: 4, background: '#555', border: 'none', borderRadius: 4, padding: '2px 6px', cursor: 'pointer', color: 'white' }}>
                    Отметить прочитанным
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ========== Компонент выбора типов уведомлений ==========
const TypeSelector = ({title, selected, onToggle, onSave, saveLabel, onClose}) => (
  <div style={{ marginTop: 8, padding: 12, background: '#2a2a2a', borderRadius: 8, border: '1px solid #444' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
      <span style={{ fontSize: 13, fontWeight: 600 }}>{title}</span>
      <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: 16 }}>✕</button>
    </div>
    <div style={{ maxHeight: 200, overflowY: 'auto' }}>
      {INCIDENT_TYPES.map(type => (
        <label key={type} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, padding: '3px 6px', borderRadius: 4 }}>
          <input type="checkbox" checked={selected.includes(type)} onChange={() => onToggle(type)} />
          <span>{type}</span>
        </label>
      ))}
    </div>
    {onSave && (
      <button onClick={onSave}
        style={{ marginTop: 8, width: '100%', padding: '6px 0', background: '#4f46e5', color: 'white', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
        {saveLabel || 'Сохранить'}
      </button>
    )}
  </div>
);

// ========== Модальное окно авторизации ==========
const AuthModal = ({ onClose, onSuccess }) => {
  const [tab, setTab] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [uname, setUname] = useState('');
  const [confirm, setConfirm] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const inp = { padding: '8px 12px', borderRadius: 8, background: '#374151', border: '1px solid #4b5563', color: 'white', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' };

  const handleLogin = async () => {
    setError(''); setLoading(true);
    try {
      const res = await axios.post(`${import.meta.env.VITE_API_URL}/login`, { email, password });
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
      await axios.post(`${import.meta.env.VITE_API_URL}/register`, { name: uname, email, password });
      setTab('verify'); setError('Код отправлен на ' + email);
    } catch { setError('Ошибка регистрации'); }
    finally { setLoading(false); }
  };

  const handleVerify = async () => {
    setError(''); setLoading(true);
    try {
      const res = await axios.post(`${import.meta.env.VITE_API_URL}/verify-email`, { email, code: verifyCode });
      if (!res.data.ok) { setError(res.data.error || 'Неверный код'); return; }
      setTab('login'); setError('Почта подтверждена — войдите');
    } catch { setError('Ошибка подтверждения'); }
    finally { setLoading(false); }
  };

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000
    }}>
      <div style={{ background: '#1e2433', color: 'white', borderRadius: 12, padding: 24, width: '100%', maxWidth: 360, border: '1px solid #374151', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        {tab === 'verify' ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>✉️ Подтверждение почты</span>
              <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>
            <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 12 }}>Введите 6-значный код из письма на <b>{email}</b></p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input type="text" placeholder="Код из письма" value={verifyCode}
                onChange={e => setVerifyCode(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleVerify()}
                maxLength={6}
                style={{ ...inp, textAlign: 'center', fontSize: 22, letterSpacing: 8 }} />
              {error && <p style={{ fontSize: 12, color: error.includes('подтверждена') ? '#4ade80' : '#f87171', margin: 0 }}>{error}</p>}
              <button onClick={handleVerify} disabled={loading || verifyCode.length < 6}
                style={{ padding: '8px 0', background: '#4f46e5', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: (loading || verifyCode.length < 6) ? 0.5 : 1 }}>
                {loading ? 'Проверка...' : 'Подтвердить'}
              </button>
              <button onClick={() => { setTab('login'); setError('Войдите после регистрации'); }}
                style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 12, cursor: 'pointer' }}>
                Подтвердить позже
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              {['login', 'register'].map(t => (
                <button key={t} onClick={() => { setTab(t); setError(''); }}
                  style={{ flex: 1, padding: '6px 0', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', background: tab === t ? '#4f46e5' : '#374151', color: tab === t ? 'white' : '#9ca3af' }}>
                  {t === 'login' ? 'Вход' : 'Регистрация'}
                </button>
              ))}
              <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', paddingLeft: 8, fontSize: 18 }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {tab === 'register' && <input type="text" placeholder="Имя" value={uname} onChange={e => setUname(e.target.value)} style={inp} />}
              <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)}
                onKeyDown={e => tab === 'login' && e.key === 'Enter' && handleLogin()} style={inp} />
              <input type="password" placeholder="Пароль" value={password} onChange={e => setPassword(e.target.value)}
                onKeyDown={e => tab === 'login' && e.key === 'Enter' && handleLogin()} style={inp} />
              {tab === 'register' && <input type="password" placeholder="Повторите пароль" value={confirm} onChange={e => setConfirm(e.target.value)} style={inp} />}
              {error && <p style={{ fontSize: 12, color: error.includes('подтверждена') || error.includes('успешна') ? '#4ade80' : '#f87171', margin: 0 }}>{error}</p>}
              <button onClick={tab === 'login' ? handleLogin : handleRegister} disabled={loading}
                style={{ padding: '8px 0', background: '#4f46e5', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.5 : 1 }}>
                {loading ? 'Загрузка...' : (tab === 'login' ? 'Войти' : 'Зарегистрироваться')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ========== Панель аутентификации ==========
const AuthPanel = ({ user, onLogin, onLogout }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  if (user) {
    return (
      <div style={{ position: 'fixed', top: 20, left: 20, zIndex: 1000, background: '#1e1e1e', borderRadius: 12, padding: '8px 16px', color: 'white', display: 'flex', gap: 12, alignItems: 'center' }}>
        <span>👤 {user.username}</span>
        <button onClick={onLogout} style={{ background: '#f44336', border: 'none', borderRadius: 8, padding: '4px 12px', cursor: 'pointer' }}>Выйти</button>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', top: 20, left: 20, zIndex: 1000, background: '#1e1e1e', borderRadius: 12, padding: '12px', color: 'white', display: 'flex', gap: 8 }}>
      <input type="text" placeholder="Логин" value={username} onChange={e => setUsername(e.target.value)} style={{ borderRadius: 6, padding: 4 }} />
      <input type="password" placeholder="Пароль" value={password} onChange={e => setPassword(e.target.value)} style={{ borderRadius: 6, padding: 4 }} />
      <button onClick={() => onLogin(username, password)} style={{ background: '#4caf50', border: 'none', borderRadius: 6, padding: '4px 12px', cursor: 'pointer' }}>Войти</button>
    </div>
  );
};

// ========== Основной компонент карты ==========
const App = ({ theme: propTheme }) => {
  const isFirstLoad = useRef(true);
  const [activeModal, setActiveModal] = useState(null); // 'auth', 'notif', 'settings', 'add'
  const [isClosing, setIsClosing] = useState(false);
  const closeModal = () => { setIsClosing(true); setTimeout(() => { setActiveModal(null); setIsClosing(false); }, 300); };
  const [toasts, setToasts] = useState([]); // Для всплывашек (п. 8)
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const notifWsRef = useRef(null);
  const notifReconnTimer = useRef(null);
  const siteSubsRef = useRef([]);
  const timeRangeRef = useRef(3600);
  const isAuthRef = useRef(false);
  const subsFromServerRef = useRef(false);
  const filtersRef = useRef({ cameras: [], eventTypes: [...INCIDENT_TYPES], usePersonal: false });
  const cameraFilterInitRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [open, setOpen] = useState(true);
  const [coord, setCoord] = useState('');
  const [Nname, setNname] = useState('');
  const [url, setUrl] = useState('');
  const [rotation, setRotation] = useState(0);
  const [cameras, setCameras] = useState({
    "Шоссе Энтузиастов Пересечение с 3-м кольцом": [
        [
            55.748627,
            37.703343
        ],
        "https://cameras.inetcom.ru/hls/camera12_2.m3u8"
    ],
    "Волгоградский проспект Метро Кузьминки": [
        [
            55.705198,
            37.763426
        ],
        "https://cameras.inetcom.ru/hls/camera12_4.m3u8"
    ],
    "Улица Люблинская Пересечение с улицей Шкулева": [
        [
            55.692909,
            37.735339
        ],
        "https://cameras.inetcom.ru/hls/camera12_7.m3u8"
    ]
});
  const [user, setUser] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [showSettings, setShowSettings] = useState(false);
  const [filters, setFilters] = useState(() => {
    try { const s = localStorage.getItem('map2_filters'); if (s) return JSON.parse(s); } catch {}
    return { cameras: [], eventTypes: [...INCIDENT_TYPES], usePersonal: false };
  });
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [darkTheme, setDarkTheme] = useState(true); // тема карты
  const [cameraStatus, setCameraStatus] = useState({}); // {name: true/false}

  // Уведомления (структура из camera3)
  const [timeRange, setTimeRange] = useState(3600);
  const [siteSubs, setSiteSubs] = useState([]);
  const [telegramSubs, setTelegramSubs] = useState([]);
  const [userTelegram, setUserTelegram] = useState('');
  const [showTgInput, setShowTgInput] = useState(false);
  const [tgInput, setTgInput] = useState('');
  const [emailSubs, setEmailSubs] = useState([]);
  const [openChannel, setOpenChannel] = useState(null);
  const [guestFilters, setGuestFilters] = useState([...INCIDENT_TYPES]);
  const [wsNotifStatus, setWsNotifStatus] = useState('disconnected');
  const [notifToastMsg, setNotifToastMsg] = useState('');
  const [showNotifToast, setShowNotifToast] = useState(false);

  const { numb } = useParams();
  const navigate = useNavigate();

  // Загрузка API Яндекс.Карт с тёмной темой
// 1. Загружаем API один раз, без зависимости от темы
  useEffect(() => {
      const script = document.createElement("script");
      script.src =
        "https://api-maps.yandex.ru/2.1/?apikey=ВАШ_API_КЛЮЧ&lang=ru_RU";
      script.async = true;
      script.onload = () => {
        window.ymaps.ready(() => {
          
          if (mapRef.current && !mapInstanceRef.current) {
            mapInstanceRef.current = new window.ymaps.Map(mapRef.current, {
              center: [55.751574, 37.573856],
              zoom: 10,
            });
            setMapReady(true); // карта готова
          }
        });
      };
      document.body.appendChild(script);
  
      return () => document.body.removeChild(script);
    }, []);
  // Добавление камеры (с углом поворота)
  const addCam = async () => {
    if (!coord || !url) return alert('Введите координаты и URL камеры');
    await axios.get(`${import.meta.env.VITE_API_URL}/newcam`, {
      params: { Nname, coord, url, rotation },
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    setCoord('');
    setUrl('');
    setRotation(0);
  };

  // Аутентификация (заглушка)
  const handleLogin = async (email, password) => {
    if (email && password) {
          let res = await axios.post(`${import.meta.env.VITE_API_URL}/login`, {
    email: email,     // для OAuth2PasswordRequestForm это поле называется username
    password: password})
    res = res.data
    console.log(res)
    if(res.error){alert('Неверный логин или пароль')}
    else{localStorage.setItem('access_token', res.access_token);window.accessToken = res.access_token; navigate('/' + res.url)
      setUser({ email });}
    } else alert('Введите логин и пароль');
  };
  const handleLogout = () => {
    setUser(null);
    setIsSuperAdmin(false);
    setSiteSubs([]);
    setTelegramSubs([]);
    localStorage.removeItem('access_token');
    connectNotifWs();
  };

  const isAuthenticated = user !== null;

  // Синхронизируем filtersRef и сохраняем в localStorage
  useEffect(() => {
    filtersRef.current = filters;
    localStorage.setItem('map2_filters', JSON.stringify(filters));
    const ws = notifWsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      const effectiveSubs = filters.usePersonal ? siteSubsRef.current : filters.eventTypes;
      ws.send(JSON.stringify({
        type:          'update_display_filter',
        cameras:       filters.cameras,
        subscriptions: effectiveSubs,
      }));
    }
  }, [filters]);

  // Авто-вход по сохранённому токену
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) return;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.sub) {
        const email = payload.sub;
        setUser({ email });
        fetch(`${import.meta.env.VITE_API_URL}/user/profile`, { headers: { Authorization: `Bearer ${token}` } })
          .then(r => r.json()).then(d => { if (d.telegram) setUserTelegram(d.telegram); }).catch(() => {});
        fetch(`${import.meta.env.VITE_API_URL}/superadmins`)
          .then(r => r.json()).then(admins => { if (admins.includes(email)) setIsSuperAdmin(true); }).catch(() => {});
      }
    } catch {}
  }, []);

  // Инициализируем список камер в фильтре после первой загрузки с сервера
  useEffect(() => {
    const keys = Object.keys(cameras);
    if (!cameraFilterInitRef.current && keys.length > 0) {
      cameraFilterInitRef.current = true;
      setFilters(f => ({ ...f, cameras: f.cameras.length === 0 ? keys : f.cameras }));
    }
  }, [cameras]);

  const notifToast = (msg, ms = 3000) => {
    setNotifToastMsg(msg); setShowNotifToast(true);
    setTimeout(() => setShowNotifToast(false), ms);
  };

  useEffect(() => { siteSubsRef.current = siteSubs; }, [siteSubs]);
  useEffect(() => { timeRangeRef.current = timeRange; }, [timeRange]);
  useEffect(() => { isAuthRef.current = isAuthenticated; }, [isAuthenticated]);

  const connectNotifWs = useCallback(() => {
    clearTimeout(notifReconnTimer.current);
    if (notifWsRef.current) {
      notifWsRef.current.onclose = null;
      notifWsRef.current.close();
    }
    setWsNotifStatus('connecting');
    const ws = new WebSocket('ws://localhost:8000/ws/notifications');
    notifWsRef.current = ws;

    ws.onopen = () => {
      setWsNotifStatus('connected');
      ws.send(JSON.stringify({
        camera:        '',
        cameras:       filtersRef.current.cameras,
        token:         localStorage.getItem('access_token') || '',
        time_range:    timeRangeRef.current,
        subscriptions: filtersRef.current.eventTypes,
      }));
    };

    ws.onmessage = event => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'connected') {
          if (msg.authenticated && msg.subscriptions) {
            subsFromServerRef.current = true;
            setSiteSubs(msg.subscriptions);
          }
          if (msg.authenticated && msg.telegram_subscriptions != null)
            setTelegramSubs(msg.telegram_subscriptions);
          if (msg.authenticated && msg.email_subscriptions != null)
            setEmailSubs(msg.email_subscriptions);
          // Применяем настройки ленты поверх сохранённых подписок сервера
          const f = filtersRef.current;
          const effectiveSubs = f.usePersonal ? siteSubsRef.current : f.eventTypes;
          ws.send(JSON.stringify({
            type:          'update_display_filter',
            cameras:       f.cameras,
            subscriptions: effectiveSubs,
          }));
        }

        if (msg.type === 'incidents') {
          const list = msg.incidents || [];
          const toNotif = i => ({
            id:             i.id,
            cameraName:     i.camera || i.camera_name || '',
            eventType:      i.notification_text,
            date:           i.date,
            read:           false,
            color:          EVENT_COLORS[i.notification_text] || '#facc15',
            severity:       i.severity || 0,
            screenshot_name: i.screenshot_name || null,
          });
          if (msg.reset) {
            setNotifications(list.map(toNotif));
          } else if (list.length) {
            setNotifications(prev => {
              const ids = new Set(prev.map(x => x.id));
              const fresh = list.filter(i => !ids.has(i.id)).map(toNotif);
              if (!fresh.length) return prev;
              return [...fresh, ...prev].slice(0, 200);
            });
          }
        }

        if (msg.type === 'subscriptions_saved') notifToast('Подписки сохранены ✓');
      } catch {}
    };

    ws.onerror = () => setWsNotifStatus('error');
    ws.onclose = () => {
      setWsNotifStatus('disconnected');
      notifReconnTimer.current = setTimeout(connectNotifWs, WS_RECONNECT_DELAY);
    };
  }, []);

  useEffect(() => {
    connectNotifWs();
    return () => {
      clearTimeout(notifReconnTimer.current);
      if (notifWsRef.current) { notifWsRef.current.onclose = null; notifWsRef.current.close(); }
    };
  }, []);

  useEffect(() => {
    if (subsFromServerRef.current) { subsFromServerRef.current = false; }
  }, [siteSubs]);

  const sendTimeRangeUpdate = newTr => {
    setTimeRange(newTr);
    setNotifications([]);
    const ws = notifWsRef.current;
    if (ws?.readyState === WebSocket.OPEN)
      ws.send(JSON.stringify({type: 'update_time_range', time_range: newTr}));
  };

  const saveTelegram = async (username) => {
    const token = localStorage.getItem('access_token');
    if (!token) return;
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/user/telegram`, {
        method: 'POST', headers: {'Content-Type': 'application/json', Authorization: `Bearer ${token}`},
        body: JSON.stringify({telegram: username.replace(/^@/, '')})
      });
      if (res.ok) {
        setUserTelegram(username.replace(/^@/, ''));
        setShowTgInput(false);
        setTgInput('');
        notifToast('Telegram сохранён ✓');
      }
    } catch {}
  };

  const saveSiteSubs = async (newSubs) => {
    setSiteSubs(newSubs);
    setOpenChannel(null);
    const token = localStorage.getItem('access_token');
    if (!token) return;
    try {
      await fetch(`${import.meta.env.VITE_API_URL}/user/site-notifications`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json', Authorization: `Bearer ${token}`},
        body: JSON.stringify({camera: '', subscriptions: newSubs}),
      });
    } catch {}
    const ws = notifWsRef.current;
    if (ws?.readyState === WebSocket.OPEN)
      ws.send(JSON.stringify({type: 'update_subscriptions', subscriptions: newSubs}));
  };

  const saveTelegramSubs = async (subs) => {
    const token = localStorage.getItem('access_token');
    if (!token) return;
    try {
      await fetch(`${import.meta.env.VITE_API_URL}/user/telegram-subscriptions`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json', Authorization: `Bearer ${token}`},
        body: JSON.stringify({camera: '', subscriptions: subs}),
      });
      notifToast('Telegram-подписки сохранены ✓');
    } catch { notifToast('Ошибка сохранения'); }
    setOpenChannel(null);
  };

  const saveEmailSubs = async (subs) => {
    const token = localStorage.getItem('access_token');
    if (!token) return;
    try {
      await fetch(`${import.meta.env.VITE_API_URL}/user/email-subscriptions`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json', Authorization: `Bearer ${token}`},
        body: JSON.stringify({camera: '', subscriptions: subs}),
      });
      notifToast('Email-подписки сохранены ✓');
    } catch { notifToast('Ошибка сохранения'); }
    setOpenChannel(null);
  };

  useEffect(() => {
    const fetchCameras = () => {
      axios.get(`${import.meta.env.VITE_API_URL}/cameras`)
        .then(response => {
          if (response.data && !deepEqual(response.data, cameras)) {
            setCameras(response.data);
          }
        })
        .catch(error => console.error('Error fetch cameras:', error));
    };
    fetchCameras();
    const intervalId = setInterval(fetchCameras, 10000);
    return () => clearInterval(intervalId);
  }, [cameras]);

  useEffect(() => {
    const fetchStatus = () => {
      axios.get(`${import.meta.env.VITE_API_URL}/cameras/status`)
        .then(r => { if (r.data) setCameraStatus(r.data); })
        .catch(() => {});
    };
    fetchStatus();
    const id = setInterval(fetchStatus, 10000);
    return () => clearInterval(id);
  }, []);

  // Управление уведомлениями
  const addTestNotification = () => {
    const cameraNames = Object.keys(cameras);
    const incidentTypes = ["ДТП", "Остановка запрещена", "Превышение скорости", "Нарушение разметки"];
    
    // Вспомогательная функция для создания уведомления
    const createNotif = (dateDelayMs) => {
      const type = incidentTypes[Math.floor(Math.random() * incidentTypes.length)];
      return {
        id: Math.random(),
        cameraName: cameraNames[Math.floor(Math.random() * cameraNames.length)],
        eventType: type,
        date: new Date(Date.now() - dateDelayMs).toISOString(),
        read: false,
        color: EVENT_COLORS[type] || "#facc15",
        severity: Math.floor(Math.random() * 5) + 1
      };
    };

    const newBatch = [
      createNotif(30 * 60 * 1000),                // 30 минут назад (попадет в "Час")
      createNotif(15 * 24 * 60 * 60 * 1000),      // 15 дней назад (попадет в "Месяц")
      createNotif(200 * 24 * 60 * 60 * 1000)      // ~7 месяцев назад (попадет в "Год")
    ];

    setNotifications(prev => [...newBatch, ...prev]);
  };
  const markAsRead = (id) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };
  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };
  const deleteNotification = (id) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isDeleting: true } : n));
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 300);
  };
  const getFilteredNotifications = () => {
    // Камеры и типы событий фильтрует сервер — здесь только временное окно
    const limit = Date.now() - timeRange * 1000;
    return notifications.filter(n => new Date(n.date).getTime() > limit);
  };
  // Отображение маркеров камер
  // Отображение маркеров камер
  useEffect(() => {
    if (!mapReady || !cameras || !mapInstanceRef.current) return;

    // Полная очистка перед перерисовкой
    mapInstanceRef.current.geoObjects.removeAll();

    // SVG иконки камеры
    const cameraSVG = `
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="6" width="18" height="14" rx="2" ry="2" fill="#333" stroke="white"/>
        <circle cx="12" cy="13" r="3" fill="red" stroke="white"/>
        <path d="M8 5v2h8V5" stroke="white"/>
      </svg>
    `;

    const placemarks = [];

    Object.entries(cameras).forEach(([name, body]) => {
      // body[0] — это [lat, lng], body[1] — это URL потока
      const coords = body[0];
      const streamUrl = body[1];

      // Считаем уведомления именно для этой камеры
      const cameraNotifs = notifications.filter(n => n.cameraName === name);
      const unreadNotifs = cameraNotifs.filter(n => !n.read);
      const unreadCount = unreadNotifs.length;

      // Статус камеры: зелёный = работает, красный = остановлена
      const isRunning = cameraStatus[name] === true;
      const badgeColor = isRunning ? "#22c55e" : "#ef4444";

      const placemark = new window.ymaps.Placemark(
        coords,
        { hintContent: name },
        {
          iconLayout: 'default#imageWithContent',
          iconImageHref: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(cameraSVG)}`,
          iconImageSize: [32, 32],
          iconImageOffset: [-16, -16],
          // Кружок с цифрой теперь ВСЕГДА отображается
          iconContentLayout: window.ymaps.templateLayoutFactory.createClass(
            `<div style="position: relative;">
               <div style="
                 position: absolute; 
                 top: -10px; 
                 right: -10px; 
                 background: ${badgeColor}; 
                 color: white; 
                 border-radius: 12px; 
                 min-width: 18px; 
                 height: 18px; 
                 display: flex; 
                 align-items: center; 
                 justify-content: center; 
                 font-size: 11px; 
                 font-weight: bold; 
                 padding: 0 4px; 
                 border: 1.5px solid white;
                 box-shadow: 0 2px 4px rgba(0,0,0,0.4);
               ">
                 ${unreadCount}
               </div>
             </div>`
          )
        }
      );

      placemark.events.add('click', () => {
        // Стили зависят от выбранной тобой темы
        const bgColor = darkTheme ? '#1e1e1e' : '#ffffff';
        const textColor = darkTheme ? '#ffffff' : '#1a1a1a';
        const btnColor = '#3b82f6';

        const balloonContent = `
          <div style="
            width: 300px; 
            background: ${bgColor}; 
            color: ${textColor}; 
            border-radius: 16px; 
            overflow: hidden; 
            font-family: 'Inter', sans-serif;
            box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);
          ">
            <!-- Превью камеры -->
            <div style="position: relative; height: 170px; background: #000;">
              <img src="${streamUrl}" style="width:100%; height:100%; object-fit: cover; opacity: 0.9;" />
              <div style="
                position: absolute; top: 10px; left: 10px; 
                background: rgba(239, 68, 68, 0.8); color: white; 
                padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: bold;
              ">
                LIVE
              </div>
            </div>

            <!-- Контент -->
            <div style="padding: 16px;">
              <div style="font-weight: 700; margin-bottom: 4px; font-size: 14px; line-height: 1.2;">
                ${name}
              </div>
              <div style="font-size: 11px; color: #888; margin-bottom: 16px;">
                ID: ${Math.random().toString(36).substr(2, 9).toUpperCase()} • Онлайн
              </div>

              <!-- Кнопки -->
              <div style="display: flex; gap: 8px;">
                <button 
                  onclick="window.location.href='/camera/${encodeURIComponent(name)}'"
                  style="
                    flex: 1; background: ${btnColor}; color: white; 
                    border: none; padding: 10px; border-radius: 8px; 
                    cursor: pointer; font-weight: 600; font-size: 12px;
                    transition: 0.2s;
                  ">
                  Открыть во весь экран
                </button>
              </div>
            </div>
          </div>
        `;

        placemark.properties.set({ balloonContent });
        placemark.balloon.open();
      });

      mapInstanceRef.current.geoObjects.add(placemark);
      placemarks.push(placemark);
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.geoObjects.removeAll();
      }
    };
  }, [mapReady, cameras, notifications, cameraStatus]);
    // ========== Динамическое переключение темы карты (п. 4 ТЗ) ==========
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;

    // Устанавливаем тему: 'dark' или 'default' (светлая)
    const yandexTheme = darkTheme ? 'dark' : 'default';
    
    // Применяем настройки к экземпляру карты
    mapInstanceRef.current.options.set('theme', yandexTheme);
    
  }, [darkTheme, mapReady]);
  return (
    <div style={{ position: 'relative', background: darkTheme ? '#121212' : '#fff', minHeight: '100vh' }}>
      <div ref={mapRef} style={{ 
        width: '100%', 
        height: '100vh', 
        filter: darkTheme ? 'brightness(0.8) invert(100%) hue-rotate(180deg) saturate(0.5)' : 'none',
        transition: 'filter 0.3s ease'
      }} />

            {/* ЛЕВАЯ БОКОВАЯ ПАНЕЛЬ (п. 5 ТЗ) */}
      <div style={{ 
        position: 'fixed', left: 0, top: 0, bottom: 0, width: '70px', 
        background: darkTheme ? '#1e1e1e' : '#fff', borderRight: `1px solid ${darkTheme ? '#333' : '#ccc'}`, 
        zIndex: 2000, display: 'flex', flexDirection: 'column', alignItems: 'center', 
        paddingTop: '20px', gap: '25px' 
      }}>
        <div title="Профиль" onClick={() => {
          if (!isAuthenticated) { setShowAuthModal(true); }
          else { activeModal === 'auth' ? closeModal() : setActiveModal('auth'); }
        }} style={{ cursor: 'pointer', fontSize: '24px', opacity: activeModal === 'auth' ? 1 : 0.6 }}>👤</div>
        
        <div title="Уведомления" onClick={() => activeModal === 'notif' ? closeModal() : setActiveModal('notif')} style={{
          cursor: 'pointer', fontSize: '24px', position: 'relative', opacity: activeModal === 'notif' ? 1 : 0.6
        }}>
          🔔
          {notifications.filter(n => !n.read).length > 0 &&
            <span style={{
              position: 'absolute', top: -5, right: -5, background: 'red', borderRadius: '50%',
              width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '10px', color: '#fff', border: '2px solid ' + (darkTheme ? '#1e1e1e' : '#fff')
            }}>
              {notifications.filter(n => !n.read).length}
            </span>
          }
          <span style={{
            position: 'absolute', bottom: -3, left: -3, width: 8, height: 8, borderRadius: '50%',
            background: wsNotifStatus === 'connected' ? '#4ade80' : wsNotifStatus === 'connecting' ? '#facc15' : '#f87171',
            border: '1.5px solid ' + (darkTheme ? '#1e1e1e' : '#fff')
          }} />
        </div>

        <div title="Настройки" onClick={() => activeModal === 'settings' ? closeModal() : setActiveModal('settings')} style={{
          cursor: 'pointer', fontSize: '24px', opacity: activeModal === 'settings' ? 1 : 0.6
        }}>⚙️</div>

        <div title="Статистика" onClick={() => navigate('/statistics')} style={{
          cursor: 'pointer', fontSize: '24px', opacity: 0.6
        }}>📊</div>

        {isSuperAdmin && (
          <div title="Добавить камеру" onClick={() => activeModal === 'add' ? closeModal() : setActiveModal('add')} style={{
            cursor: 'pointer', fontSize: '24px', opacity: activeModal === 'add' ? 1 : 0.6
          }}>➕</div>
        )}
        
        <div title="Сменить тему" onClick={() => setDarkTheme(!darkTheme)} style={{ 
          marginTop: 'auto', marginBottom: '20px', cursor: 'pointer', fontSize: '20px' 
        }}>
          {darkTheme ? '🌙' : '☀️'}
        </div>
      </div>

      {/* МОДАЛЬНОЕ ОКНО: Авторизация */}
       {activeModal === 'auth' && (
        <div style={{ 
          position: 'fixed', left: '80px', top: '20px', 
          width: 'min(350px, calc(100vw - 100px))', // Адаптивная ширина
          maxHeight: 'calc(100vh - 40px)', // Ограничение по высоте экрана
          background: darkTheme ? '#1e1e1e' : '#fff', color: darkTheme ? '#fff' : '#000',
          borderRadius: '16px', padding: '20px', zIndex: 1500, boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          border: `1px solid ${darkTheme ? '#333' : '#ddd'}`,
          display: 'flex', flexDirection: 'column',
          overflowY: 'auto', // ВКЛЮЧАЕТ СКРОЛЛ (тот самый слайдер)
          boxSizing: 'border-box',
          animation: isClosing ? 'modalSlideOut 0.3s ease-in forwards' : 'modalSlideIn 0.3s ease-out forwards'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
            <h3 style={{ margin: 0 }}>Профиль</h3>
            <button onClick={closeModal} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '18px' }}>✕</button>
          </div>
          {user ? (
            <div>
              <p style={{ marginBottom: '15px' }}>Вы вошли как: <b>{user.username || user.email}</b></p>
              <button onClick={handleLogout} style={{ 
                width: '100%', padding: '10px', background: '#ef4444', color: '#fff', 
                border: 'none', borderRadius: '8px', cursor: 'pointer' 
              }}>Выйти</button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <input type="text" placeholder="Email" id="auth-email" style={{ 
                width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #444', 
                background: darkTheme ? '#2a2a2a' : '#f0f0f0', color: darkTheme ? '#fff' : '#000' 
              }} />
              <input type="password" placeholder="Пароль" id="auth-pass" style={{ 
                width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #444', 
                background: darkTheme ? '#2a2a2a' : '#f0f0f0', color: darkTheme ? '#fff' : '#000' 
              }} />
              <button onClick={() => {
                const email = document.getElementById('auth-email').value;
                const pass = document.getElementById('auth-pass').value;
                handleLogin(email, pass);
              }} style={{ 
                width: '100%', padding: '10px', background: '#4caf50', color: '#fff', 
                border: 'none', borderRadius: '8px', cursor: 'pointer', marginTop: '5px' 
              }}>Войти</button>
            </div>
          )}
        </div>
      )}

      {/* МОДАЛЬНОЕ ОКНО: Уведомления */}
      {activeModal === 'notif' && (
        <div style={{
          position: 'fixed', left: '80px', top: '20px',
          width: 'min(350px, calc(100vw - 100px))',
          maxHeight: 'calc(100vh - 40px)',
          background: darkTheme ? '#1e1e1e' : '#fff', color: darkTheme ? '#fff' : '#000',
          borderRadius: '16px', padding: '20px', zIndex: 1500, boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          border: `1px solid ${darkTheme ? '#333' : '#ddd'}`,
          display: 'flex', flexDirection: 'column',
          overflowY: 'auto',
          boxSizing: 'border-box',
          animation: isClosing ? 'modalSlideOut 0.3s ease-in forwards' : 'modalSlideIn 0.3s ease-out forwards'
        }}>
          {/* Шапка */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h3 style={{ margin: 0 }}>📢 Уведомления</h3>
              <span style={{
                fontSize: 11, padding: '2px 6px', borderRadius: 4,
                background: wsNotifStatus === 'connected' ? '#14532d' : wsNotifStatus === 'connecting' ? '#713f12' : '#7f1d1d',
                color: wsNotifStatus === 'connected' ? '#86efac' : wsNotifStatus === 'connecting' ? '#fde047' : '#fca5a5'
              }}>
                {wsNotifStatus === 'connected' ? 'live' : wsNotifStatus === 'connecting' ? 'подкл.' : 'офлайн'}
              </span>
            </div>
            <button onClick={closeModal} style={{ background: 'none', border: 'none', color: darkTheme ? '#fff' : '#000', cursor: 'pointer', fontSize: 18 }}>✕</button>
          </div>

          {/* Промежуток — для всех */}
          <div style={{ marginBottom: 10 }}>
            <span style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>Промежуток:</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {TIME_RANGE_OPTIONS.map(o => (
                <button key={o.value} onClick={() => sendTimeRangeUpdate(o.value)}
                  style={{
                    flex: 1, padding: '4px 0', borderRadius: 6, fontSize: 11, border: 'none', cursor: 'pointer',
                    background: timeRange === o.value ? '#4f46e5' : '#333',
                    color: timeRange === o.value ? 'white' : '#ccc',
                    fontWeight: timeRange === o.value ? 600 : 400,
                  }}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Список уведомлений */}
          <div style={{ maxHeight: 340, overflowY: 'auto', marginBottom: 10 }}>
            {getFilteredNotifications().length === 0 ? (
              <div style={{ textAlign: 'center', color: '#888', padding: '20px 0', fontSize: 13 }}>
                Нет уведомлений
              </div>
            ) : getFilteredNotifications().map(notif => (
              <div key={notif.id} style={{
                marginBottom: 8, padding: 10, borderRadius: 8,
                background: notif.read
                  ? (darkTheme ? '#252525' : '#f5f5f5')
                  : (darkTheme ? '#333' : '#e8e8e8'),
                borderLeft: `4px solid ${notif.color || EVENT_COLORS[notif.eventType] || '#ccc'}`,
                animation: notif.isDeleting ? 'itemFadeOut 0.3s ease-in forwards' : 'none',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: 13 }}>{notif.cameraName}</strong>
                  <button onClick={() => deleteNotification(notif.id)}
                    style={{ background: 'none', border: 'none', color: '#ff8888', cursor: 'pointer', fontSize: 14 }}>✕</button>
                </div>
                <div style={{ fontSize: 12, marginTop: 2 }}>{notif.eventType}</div>
                <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>{new Date(notif.date).toLocaleString()}</div>
                {notif.screenshot_name && (
                  <div onClick={() => navigate(`/incident/${notif.id}`)} style={{ marginTop: 6, cursor: 'pointer', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
                    <img src={`${import.meta.env.VITE_API_URL}/incidents/photo/${notif.screenshot_name}`}
                      style={{ width: '100%', height: 72, objectFit: 'cover', display: 'block' }} alt="" />
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🔍</div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Нижняя секция: подсказка для гостей */}
          {!isAuthenticated && (
            <div style={{ borderTop: `1px solid ${darkTheme ? '#333' : '#ddd'}`, paddingTop: 12 }}>
              <button onClick={() => setShowAuthModal(true)}
                style={{ width: '100%', padding: '8px 0', background: '#4f46e5', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Войти для персональных настроек
              </button>
            </div>
          )}
        </div>
      )}

      {/* МОДАЛЬНОЕ ОКНО: Настройки (п. 1, 3) */}
        {activeModal === 'settings' && (
        <div style={{ 
          position: 'fixed', left: '80px', top: '20px', 
          width: 'min(350px, calc(100vw - 100px))', // Адаптивная ширина
          maxHeight: 'calc(100vh - 40px)', // Ограничение по высоте экрана
          background: darkTheme ? '#1e1e1e' : '#fff', color: darkTheme ? '#fff' : '#000',
          borderRadius: '16px', padding: '20px', zIndex: 1500, boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          border: `1px solid ${darkTheme ? '#333' : '#ddd'}`,
          display: 'flex', flexDirection: 'column',
          overflowY: 'auto', // ВКЛЮЧАЕТ СКРОЛЛ (тот самый слайдер)
          boxSizing: 'border-box',
          animation: isClosing ? 'modalSlideOut 0.3s ease-in forwards' : 'modalSlideIn 0.3s ease-out forwards'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
            <h3 style={{ margin: 0 }}>Настройки ленты</h3>
            <button onClick={closeModal} style={{ background: 'none', border: 'none', color: darkTheme ? '#fff' : '#000', cursor: 'pointer', fontSize: '18px' }}>✕</button>
          </div>
          
          {/* Камеры с чекбоксами */}
          <div style={{ marginBottom: '15px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <label style={{ fontSize: '13px', color: '#888' }}>Камеры в ленте:</label>
              <button onClick={() => {
                const allKeys = Object.keys(cameras);
                const allSelected = allKeys.every(c => filters.cameras.includes(c));
                setFilters(f => ({ ...f, cameras: allSelected ? [] : allKeys }));
              }} style={{ fontSize: 11, color: '#4f46e5', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                {Object.keys(cameras).every(c => filters.cameras.includes(c)) ? 'Скрыть все' : 'Показать все'}
              </button>
            </div>
            <div style={{
              overflowY: 'hidden', padding: '10px',
              background: darkTheme ? '#2a2a2a' : '#f0f0f0', borderRadius: '8px',
              border: '1px solid #444', display: 'flex', flexDirection: 'column', gap: '8px'
            }}>
              {Object.keys(cameras).map(cam => (
                <label key={cam} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '14px' }}>
                  <input
                    type="checkbox"
                    checked={filters.cameras.includes(cam)}
                    onChange={() => {
                      const next = filters.cameras.includes(cam)
                        ? filters.cameras.filter(c => c !== cam)
                        : [...filters.cameras, cam];
                      setFilters({ ...filters, cameras: next });
                    }}
                  />
                  <span style={{ color: darkTheme ? '#fff' : '#000' }}>{cam}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Типы событий с цветами */}
          <div style={{ marginBottom: '15px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <label style={{ fontSize: '13px', color: '#888' }}>Типы событий:</label>
              <button onClick={() => setFilters(f => ({
                ...f,
                usePersonal: false,
                eventTypes: f.eventTypes.length === INCIDENT_TYPES.length ? [] : [...INCIDENT_TYPES]
              }))} style={{ fontSize: 11, color: '#4f46e5', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                {filters.eventTypes.length === INCIDENT_TYPES.length ? 'Снять все' : 'Все'}
              </button>
            </div>

            {/* Персональные — только для авторизованных */}
            {isAuthenticated && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '14px', marginBottom: '6px', paddingBottom: '6px', borderBottom: `1px solid ${darkTheme ? '#444' : '#ddd'}` }}>
                <input type="checkbox" checked={filters.usePersonal} onChange={() =>
                  setFilters(f => ({ ...f, usePersonal: !f.usePersonal }))
                } />
                <span style={{ color: '#4f46e5', fontWeight: 600 }}>⭐ Персональные</span>
                <span style={{ fontSize: 11, color: '#888' }}>
                  {siteSubs.length ? `(${siteSubs.length} тип.)` : '(не настроены)'}
                </span>
              </label>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', opacity: filters.usePersonal ? 0.4 : 1 }}>
              {INCIDENT_TYPES.map(type => (
                <label key={type} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: filters.usePersonal ? 'default' : 'pointer', fontSize: '14px' }}>
                  <input type="checkbox"
                    checked={filters.usePersonal ? siteSubs.includes(type) : filters.eventTypes.includes(type)}
                    disabled={filters.usePersonal}
                    onChange={() => {
                      if (filters.usePersonal) return;
                      const next = filters.eventTypes.includes(type)
                        ? filters.eventTypes.filter(t => t !== type)
                        : [...filters.eventTypes, type];
                      setFilters({ ...filters, eventTypes: next });
                    }} />
                  <span style={{
                    display: 'inline-block', width: '12px', height: '12px',
                    background: EVENT_COLORS[type] || '#888', borderRadius: '50%', marginRight: '5px'
                  }}></span>
                  {type}
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* МОДАЛЬНОЕ ОКНО: Добавление камеры (перенесено из старой панели) */}
        {activeModal === 'add' && (
        <div style={{ 
          position: 'fixed', left: '80px', top: '20px', 
          width: 'min(350px, calc(100vw - 100px))', // Адаптивная ширина
          maxHeight: 'calc(100vh - 40px)', // Ограничение по высоте экрана
          background: darkTheme ? '#1e1e1e' : '#fff', color: darkTheme ? '#fff' : '#000',
          borderRadius: '16px', padding: '20px', zIndex: 1500, boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          border: `1px solid ${darkTheme ? '#333' : '#ddd'}`,
          display: 'flex', flexDirection: 'column',
          overflowY: 'auto', // ВКЛЮЧАЕТ СКРОЛЛ (тот самый слайдер)
          boxSizing: 'border-box',
          animation: isClosing ? 'modalSlideOut 0.3s ease-in forwards' : 'modalSlideIn 0.3s ease-out forwards'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
            <h3 style={{ margin: 0 }}>Новая камера</h3>
            <button onClick={closeModal} style={{ background: 'none', border: 'none', color: darkTheme ? '#fff' : '#000', cursor: 'pointer', fontSize: '18px' }}>✕</button>
          </div>
          <input type="text" placeholder="Название" value={Nname} onChange={e => setNname(e.target.value)} style={{ 
            width: '100%', marginBottom: '10px', padding: '8px', borderRadius: '6px', 
            background: darkTheme ? '#2a2a2a' : '#f0f0f0', color: darkTheme ? '#fff' : '#000', border: '1px solid #444' 
          }} />
          <input type="text" placeholder="Координаты (lat,lng)" value={coord} onChange={e => setCoord(e.target.value)} style={{ 
            width: '100%', marginBottom: '10px', padding: '8px', borderRadius: '6px', 
            background: darkTheme ? '#2a2a2a' : '#f0f0f0', color: darkTheme ? '#fff' : '#000', border: '1px solid #444' 
          }} />
          <input type="text" placeholder="URL потока" value={url} onChange={e => setUrl(e.target.value)} style={{ 
            width: '100%', marginBottom: '10px', padding: '8px', borderRadius: '6px', 
            background: darkTheme ? '#2a2a2a' : '#f0f0f0', color: darkTheme ? '#fff' : '#000', border: '1px solid #444' 
          }} />
          <input type="number" placeholder="Угол поворота" value={rotation} onChange={e => setRotation(parseInt(e.target.value))} style={{ 
            width: '100%', marginBottom: '15px', padding: '8px', borderRadius: '6px', 
            background: darkTheme ? '#2a2a2a' : '#f0f0f0', color: darkTheme ? '#fff' : '#000', border: '1px solid #444' 
          }} />
          <button onClick={addCam} style={{ 
            width: '100%', padding: '10px', background: '#4caf50', color: '#fff', 
            border: 'none', borderRadius: '8px', cursor: 'pointer' 
          }}>Добавить на карту</button>
        </div>
      )}

      {/* Кнопка тестового уведомления (оставляем для отладки) */}
      <button onClick={addTestNotification} style={{ 
        position: 'fixed', bottom: '20px', right: '20px', zIndex: 1100, 
        background: '#ff9800', border: 'none', borderRadius: '40px', padding: '12px 20px', 
        color: 'white', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 2px 8px black' 
      }}>📢 Тест</button>

            {/* КОНТЕЙНЕР ДЛЯ ВСПЛЫВАШЕК (п. 8 ТЗ) */}
      <div style={{ 
        position: 'fixed', 
        bottom: '20px', 
        right: '20px', 
        zIndex: 10000, 
        display: 'flex', 
        flexDirection: 'column-reverse', 
        gap: '10px', 
        pointerEvents: 'none' 
      }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            background: darkTheme ? '#2a2a2a' : '#fff', 
            color: darkTheme ? '#fff' : '#000', 
            padding: '16px 20px', 
            borderRadius: '12px', 
            boxShadow: '0 10px 15px -3px rgba(0,0,0,0.4)', 
            borderLeft: `6px solid ${t.color}`, 
            minWidth: '280px', 
            pointerEvents: 'auto',
            animation: 'toastSlideIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) both'
          }}>
            <div style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '4px' }}>{t.cameraName}</div>
            <div style={{ fontSize: '12px', opacity: 0.85 }}>{t.eventType}</div>
          </div>
        ))}
      </div>

      {showNotifToast && (
        <div style={{
          position: 'fixed', bottom: 20, right: 20, zIndex: 10001,
          background: darkTheme ? '#1e1e1e' : '#fff', color: darkTheme ? '#fff' : '#000',
          border: `1px solid ${darkTheme ? '#333' : '#ddd'}`,
          padding: '10px 16px', borderRadius: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          fontSize: 13, animation: 'modalSlideIn 0.3s ease-out'
        }}>
          {notifToastMsg}
        </div>
      )}

      {/* AuthModal */}
      {showAuthModal && (
        <AuthModal
          onClose={() => setShowAuthModal(false)}
          onSuccess={email => {
            setUser({ email });
            setShowAuthModal(false);
            notifToast('Вы вошли ✓');
            connectNotifWs();
            const token = localStorage.getItem('access_token');
            fetch(`${import.meta.env.VITE_API_URL}/user/profile`, { headers: { Authorization: `Bearer ${token}` } })
              .then(r => r.json())
              .then(d => {
                if (d.telegram) setUserTelegram(d.telegram);
              }).catch(() => {});
            fetch(`${import.meta.env.VITE_API_URL}/superadmins`)
              .then(r => r.json())
              .then(admins => { if (admins.includes(email)) setIsSuperAdmin(true); })
              .catch(() => {});
          }}
        />
      )}

      {/* СТИЛИ ДЛЯ АНИМАЦИЙ */}
      {/* СТИЛИ ДЛЯ АНИМАЦИЙ И СКРОЛЛБАРА */}
      <style>{`
        @keyframes toastSlideIn {
          0% { transform: translateX(100%) scale(0.9); opacity: 0; }
          70% { transform: translateX(-10px) scale(1.02); opacity: 1; }
          100% { transform: translateX(0) scale(1); opacity: 1; }
        }
        @keyframes modalSlideIn {
          from { transform: translateX(-100px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes modalSlideOut {
          from { transform: translateX(0); opacity: 1; }
          to { transform: translateX(-100px); opacity: 0; }
        }
        @keyframes itemFadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes itemFadeOut {
          from { opacity: 1; transform: scale(1); }
          to { opacity: 0; transform: scale(0.9); }
        }

        /* КРАСИВЫЙ СКРОЛЛБАР (Слайдер) */
        div::-webkit-scrollbar {
          width: 5px;
        }
        div::-webkit-scrollbar-track {
          background: transparent;
        }
        div::-webkit-scrollbar-thumb {
          background: ${darkTheme ? '#444' : '#ccc'};
          border-radius: 10px;
        }
        div::-webkit-scrollbar-thumb:hover {
          background: ${darkTheme ? '#666' : '#999'};
        }
      `}</style>
    </div>
  );
};

// ========== Обёртка с QueryClient ==========
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const queryClient = new QueryClient();

const YandexMapDirect = () => (
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>
);

export default YandexMapDirect;