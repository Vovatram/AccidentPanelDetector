import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import deepEqual from 'fast-deep-equal';
import { createPortal } from 'react-dom';
import CameraEditor from "./CameraEditor";

// ========== Компонент уведомлений ==========
const NotificationBell = ({ notifications, onMarkRead, onDelete, onOpenSettings }) => {
  const [expanded, setExpanded] = useState(false);
  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div style={{ position: 'fixed', top: 80, right: 20, zIndex: 1100 }}>
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
            {notifications.length === 0 && <div style={{ color: '#aaa', textAlign: 'center' }}>Нет уведомлений</div>}
            {notifications.map(notif => (
              <div key={notif.id} style={{ marginBottom: 8, padding: 8, borderRadius: 8, background: notif.read ? '#2a2a2a' : '#3a3a3a', borderLeft: `4px solid ${notif.color || '#ccc'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong>{notif.cameraName}</strong>
                  <button onClick={() => onDelete(notif.id)} style={{ background: 'none', border: 'none', color: '#ff8888', cursor: 'pointer', fontSize: 16 }}>✕</button>
                </div>
                <div style={{ fontSize: 12 }}>{notif.eventType}</div>
                <div style={{ fontSize: 10, color: '#aaa' }}>{new Date(notif.date).toLocaleString()}</div>
                {!notif.read && (
                  <button onClick={() => onMarkRead(notif.id)} style={{ fontSize: 10, marginTop: 4, background: '#555', border: 'none', borderRadius: 4, padding: '2px 6px', cursor: 'pointer' }}>
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

// ========== Компонент настроек ==========
const SettingsPanel = ({ onClose, filters, setFilters, camerasList }) => {
  const [tempFilters, setTempFilters] = useState(filters);

  return (
    <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: '#2c2c2c', borderRadius: 16, padding: 20, zIndex: 1200, minWidth: 300, color: 'white', boxShadow: '0 8px 24px black' }}>
      <h3>Настройки уведомлений</h3>
      <label>Период (часов):</label>
      <input type="number" value={tempFilters.periodHours} onChange={e => setTempFilters({ ...tempFilters, periodHours: parseInt(e.target.value) || 24 })} style={{ width: '100%', marginBottom: 12 }} />
      
      <label>Камеры:</label>
      <select multiple value={tempFilters.cameras} onChange={e => setTempFilters({ ...tempFilters, cameras: Array.from(e.target.selectedOptions, o => o.value) })} style={{ width: '100%', marginBottom: 12 }}>
        {camerasList.map(cam => <option key={cam} value={cam}>{cam}</option>)}
      </select>
      
      <label>Типы событий:</label>
      <select multiple value={tempFilters.eventTypes} onChange={e => setTempFilters({ ...tempFilters, eventTypes: Array.from(e.target.selectedOptions, o => o.value) })} style={{ width: '100%', marginBottom: 12 }}>
        <option value="accident">ДТП</option>
        <option value="fire">Пожар</option>
        <option value="smoke">Дым</option>
        <option value="other">Другое</option>
      </select>
      
      <div style={{ display: 'flex', gap: 12 }}>
        <button onClick={() => { setFilters(tempFilters); onClose(); }} style={{ background: '#4caf50', border: 'none', padding: '8px 16px', borderRadius: 8, cursor: 'pointer' }}>Применить</button>
        <button onClick={onClose} style={{ background: '#f44336', border: 'none', padding: '8px 16px', borderRadius: 8, cursor: 'pointer' }}>Отмена</button>
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
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
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
  const [filters, setFilters] = useState({ periodHours: 24, cameras: [], eventTypes: [] });
  const [darkTheme, setDarkTheme] = useState(true); // тема карты
  const { numb } = useParams();
  const navigate = useNavigate();

  // Загрузка API Яндекс.Карт с тёмной темой
// 1. Загружаем API один раз, без зависимости от темы
useEffect(() => {
  const script = document.createElement('script');
  script.src = "https://api-maps.yandex.ru/2.1/?apikey=ВАШ_API_КЛЮЧ&lang=ru_RU";
  script.async = true;
  script.onload = () => {
    window.ymaps.ready(() => {
      if (mapRef.current && !mapInstanceRef.current) {
        const map = new window.ymaps.Map(mapRef.current, {
          center: [55.751574, 37.573856],
          zoom: 10,
        });
        mapInstanceRef.current = map;
        setMapReady(true);
      }
    });
  };
  document.body.appendChild(script);
  return () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.destroy();
      mapInstanceRef.current = null;
    }
    document.body.removeChild(script);
  };
}, []); // без darkTheme — карта создаётся один раз

// 2. Тема применяется через CSS на контейнере


  // Получение камер (polling)
  
  useEffect(() => {
    const fetchCameras = () => {
      axios.get(`${import.meta.env.VITE_API_URL}/cameras`, { params: { numb } })
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
  }, [numb, cameras]);
  
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
    localStorage.removeItem('user');
  };
    useEffect(() => {
     const F = () => {
      console.log('->>')
      let cameras = 'all'
      let time = 'all'
      let paramU = false
      axios.get(`${import.meta.env.VITE_API_URL}/notifications`, {params: {cameras, time, paramU }, headers: {Authorization: `Bearer ${window.accessToken || localStorage.getItem('access_token')}` }})
      .then(response => {
          if (response.data){
            console.log(response.data)
          }})
        
      .catch(error => console.error('Error find:', error));}
    
      F()
    const intervalId = setInterval(() => {
      F()
    }, 1000); 

    // Обязательная очистка!
    return () => {
      clearInterval(intervalId);
      console.log("Таймер очищен");
    };
  }, [])

  // Управление уведомлениями
  const addTestNotification = () => {
    const newNotif = {
      id: Date.now(),
      cameraName: Object.keys(cameras)[0] || 'Тестовая камера',
      eventType: 'Тестовое событие',
      date: new Date().toISOString(),
      read: false,
      color: '#ff9800',
      severity: 2,
      cameraId: Object.keys(cameras)[0] || 'test',
    };
    setNotifications(prev => [newNotif, ...prev]);
  };
  const markAsRead = (id) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };
  const deleteNotification = (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };
  const getFilteredNotifications = () => {
    let filtered = notifications;
    if (filters.periodHours) {
      const limit = Date.now() - filters.periodHours * 3600000;
      filtered = filtered.filter(n => new Date(n.date).getTime() > limit);
    }
    if (filters.cameras.length > 0) {
      filtered = filtered.filter(n => filters.cameras.includes(n.cameraName));
    }
    if (filters.eventTypes.length > 0) {
      filtered = filtered.filter(n => filters.eventTypes.includes(n.eventType));
    }
    return filtered;
  };

  // Отображение маркеров камер
  useEffect(() => {
    if (!mapReady || !cameras) return;

    // Новая иконка камеры (красный глазок)
    const cameraSVG = `
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="6" width="18" height="14" rx="2" ry="2" fill="#333" stroke="white"/>
        <circle cx="12" cy="13" r="3" fill="red" stroke="white"/>
        <path d="M8 5v2h8V5" stroke="white"/>
      </svg>
    `;

    const placemarks = [];
    const overlay = document.createElement('div');
    overlay.id = 'camera-overlay';
    overlay.style.position = 'absolute';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.pointerEvents = 'none';
    mapRef.current.appendChild(overlay);

    Object.entries(cameras).forEach(([name, body]) => {
      const [coords, streamUrl, rotationAngle = 0] = body; // ожидаем rotation третьим элементом
      // Подсчёт уведомлений для камеры
      const cameraNotifications = notifications.filter(n => n.cameraName === name);
      const unreadCount = cameraNotifications.filter(n => !n.read).length;
      const maxSeverity = Math.max(0, ...cameraNotifications.map(n => n.severity || 0));
      let markerColor = '#4caf50'; // зелёный (нет событий)
      if (maxSeverity >= 3) markerColor = '#f44336'; // красный
      else if (maxSeverity >= 1) markerColor = '#ff9800'; // оранжевый

      // Создаём HTML-содержимое для метки с кружком
      const placemark = new window.ymaps.Placemark(
        coords,
        { hintContent: name },
        {
          iconLayout: 'default#imageWithContent',
          iconImageHref: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(cameraSVG)}`,
          iconImageSize: [32, 32],
          iconImageOffset: [-16, -16],
          iconContentLayout: window.ymaps.templateLayoutFactory.createClass(
            `<div style="position: relative;">
               <div style="position: absolute; top: -8px; right: -8px; background: ${markerColor}; border-radius: 12px; min-width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; color: white; font-size: 11px; font-weight: bold; padding: 0 4px;">${unreadCount || ''}</div>
             </div>`
          )
        }
      );

      mapInstanceRef.current.geoObjects.add(placemark);
      placemarks.push(placemark);

      placemark.events.add('click', () => {
        const balloonContent = `
          <div style="width: 320px; background: #2c2c2c; color: white; border-radius: 12px; overflow: hidden;">
            <div style="position: relative; height: 240px; background: black;">
              <img src="${streamUrl}" style="width:100%; height:100%; object-fit: cover;" />
            </div>
            <div style="padding: 12px; display: flex; gap: 12px; justify-content: space-between;">
              <button onclick="window.open('${streamUrl}', '_blank')" style="background: #007bff; border: none; padding: 6px 12px; border-radius: 8px; cursor: pointer;">Следить</button>
              <button onclick="window.open('/camera/${encodeURIComponent(name)}', '_blank')" style="background: #28a745; border: none; padding: 6px 12px; border-radius: 8px; cursor: pointer;">Открыть</button>
            </div>
          </div>
        `;
        placemark.properties.set({ balloonContent, balloonContentHeader: `<strong>${name}</strong>` });
        placemark.balloon.open();
      });
    });

    // Масштабирование иконок
    const updateScales = () => {
      if (!mapInstanceRef.current) return;
      const zoom = mapInstanceRef.current.getZoom();
      const size = Math.min(48, Math.max(24, 16 + zoom * 2));
      placemarks.forEach(p => p.options.set({ iconImageSize: [size, size], iconImageOffset: [-size/2, -size/2] }));
    };
    mapInstanceRef.current.events.add('boundschange', updateScales);
    updateScales();

    return () => {
      mapInstanceRef.current.events.remove('boundschange', updateScales);
      placemarks.forEach(p => mapInstanceRef.current.geoObjects.remove(p));
      if (overlay.parentNode) overlay.remove();
    };
  }, [mapReady, cameras, notifications]);

  return (
    <div style={{ position: 'relative', background: darkTheme ? '#121212' : '#fff', minHeight: '100vh' }}>
      <div ref={mapRef} style={{ width: '100%', height: '100vh',      filter: darkTheme
        ? 'invert(1) hue-rotate(180deg) brightness(0.9) contrast(1.1)'
        : 'none',
      transition: 'filter 0.3s ease', }} />
      {/* Панель аутентификации */}
      <AuthPanel user={user} onLogin={handleLogin} onLogout={handleLogout} />

      {/* Панель уведомлений */}
      <NotificationBell
        notifications={getFilteredNotifications()}
        onMarkRead={markAsRead}
        onDelete={deleteNotification}
        onOpenSettings={() => setShowSettings(true)}
      />

      {/* Настройки */}
      {showSettings && (
        <SettingsPanel
          onClose={() => setShowSettings(false)}
          filters={filters}
          setFilters={setFilters}
          camerasList={Object.keys(cameras)}
        />
      )}

      {/* Кнопка тестового уведомления */}
      <button
        onClick={addTestNotification}
        style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 1100, background: '#ff9800', border: 'none', borderRadius: 40, padding: '12px 20px', color: 'white', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 2px 8px black' }}
      >
        📢 Тест уведомления
      </button>

      {/* Боковая панель добавления камер (увеличена кнопка сворачивания) */}
      <button
        onClick={() => setOpen(!open)}
        style={{ position: 'absolute', top: 80, left: 10, zIndex: 1000, fontSize: 28, background: '#333', border: 'none', borderRadius: 12, width: 48, height: 48, cursor: 'pointer', color: 'white' }}
      >
        {open ? '✕' : '☰'}
      </button>
      <div
        className={`control-panel ${open ? 'open' : ''}`}
        style={{
          position: 'absolute',
          top: 140,
          left: 10,
          zIndex: 1000,
          width: 260,
          background: darkTheme ? 'rgba(30,30,30,0.95)' : 'rgba(255,255,255,0.95)',
          borderRadius: 16,
          padding: 12,
          transition: '0.2s',
          display: open ? 'block' : 'none',
          color: darkTheme ? 'white' : 'black',
        }}
      >
        <h4>Добавить камеру</h4>
        <input type="text" placeholder="Название" value={Nname} onChange={e => setNname(e.target.value)} style={{ width: '100%', marginBottom: 8, padding: 6, borderRadius: 8 }} />
        <input type="text" placeholder="Координаты (lat,lng)" value={coord} onChange={e => setCoord(e.target.value)} style={{ width: '100%', marginBottom: 8, padding: 6, borderRadius: 8 }} />
        <input type="text" placeholder="URL потока" value={url} onChange={e => setUrl(e.target.value)} style={{ width: '100%', marginBottom: 8, padding: 6, borderRadius: 8 }} />
        <input type="number" placeholder="Угол поворота (градусы)" value={rotation} onChange={e => setRotation(parseInt(e.target.value))} style={{ width: '100%', marginBottom: 12, padding: 6, borderRadius: 8 }} />
        <button onClick={addCam} style={{ width: '100%', padding: 8, background: '#4caf50', border: 'none', borderRadius: 8, cursor: 'pointer', color: 'white' }}>➕ Добавить</button>
        <hr style={{ margin: '12px 0' }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={darkTheme} onChange={() => setDarkTheme(!darkTheme)} />
          Тёмная тема карты
        </label>
      </div>
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