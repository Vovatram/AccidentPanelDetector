import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from 'react-router-dom';
import { useNavigate } from "react-router-dom";
import axios from 'axios';


function Camera() {
  const { name } = useParams();
  const imgRef = useRef(null);
  const containerRef = useRef(null);
  const navigate = useNavigate();
  // Состояния для управления изображением
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [showNotifications, setShowNotifications] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState('');
  const [notifications, setNotifications] = useState([]);
  const [theme, setTheme] = useState('dark'); // 'light' или 'dark'
  const [showIncidentGraph, setShowIncidentGraph] = useState(false);
  const [incidents, setIncidents] = useState([
    { time: '08:30', date: '2024-01-15', type: 'Движение' },
    { time: '12:45', date: '2024-01-15', type: 'Звук' },
    { time: '15:20', date: '2024-01-15', type: 'Движение' },
    { time: '18:10', date: '2024-01-15', type: 'Объект' },
    { time: '22:35', date: '2024-01-15', type: 'Движение' },
  ]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');

  // WebSocket для реального видеопотока (закомментирован, но готов к использованию)
  useEffect(() => {
    
    console.log(33)
    const loader = document.getElementById(`loader`);
    const img = document.getElementById(`camera-img`);
    
    const ws = new WebSocket("ws://localhost:8000/ws");
    setConnectionStatus('connecting');
    
    ws.onopen = () => {
          
        ws.send(JSON.stringify({
          camera: name,
          filters: ["all"]
        }));
    
      setConnectionStatus('connected');
      setIsStreaming(true);
    };
    
    ws.onmessage = (event) => {
      if (event.data === "ping") {
        ws.send("pong");
        return;
      }

      const blob = new Blob([event.data], { type: "image/jpeg" });
      const url = URL.createObjectURL(blob);
      img.src = url;

      img.onload = () => {
        if (loader) loader.style.display = "none";
        if (img.dataset.prev) URL.revokeObjectURL(img.dataset.prev);
        img.dataset.prev = url;
      };
    };
    
    ws.onerror = () => setConnectionStatus('error');
    ws.onclose = () => {
      setConnectionStatus('disconnected');
      setIsStreaming(false);
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) ws.close();
    };
    
  }, [name]);
/*
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
    }, 1000);}, [])*/

  const zoomIn = () => {
    setScale(prev => Math.min(prev + 0.2, 3));
  };

  const zoomOut = () => {
    setScale(prev => Math.max(prev - 0.2, 0.5));
  };

  const resetZoom = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  // Обработчики перетаскивания
  const handleMouseDown = (e) => {
    if (scale > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  };

  const handleMouseMove = (e) => {
    if (isDragging && scale > 1) {
      const newX = e.clientX - dragStart.x;
      const newY = e.clientY - dragStart.y;
      setPosition({ x: newX, y: newY });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Отправка уведомления
  const sendNotification = () => {
    if (notificationMessage.trim()) {
      const newNotification = {
        id: Date.now(),
        message: notificationMessage,
        time: new Date().toLocaleTimeString(),
        camera: name
      };
      setNotifications(prev => [newNotification, ...prev]);
      setNotificationMessage('');
      setShowNotifications(true);
      
      // Автоматически скрыть уведомление через 3 секунды
      setTimeout(() => {
        setShowNotifications(false);
      }, 3000);
    }
  };

  // Переключение темы
  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  // Подсчет происшествий по часам для графика
  const getIncidentsByHour = () => {
    const hours = Array(24).fill(0);
    incidents.forEach(incident => {
      const hour = parseInt(incident.time.split(':')[0]);
      hours[hour]++;
    });
    return hours;
  };

  const incidentsByHour = getIncidentsByHour();
  const maxIncidents = Math.max(...incidentsByHour, 1);

  // Стили в зависимости от темы
  const themeStyles = {
    dark: {
      bg: 'bg-gray-900',
      text: 'text-white',
      cardBg: 'bg-gray-800',
      border: 'border-gray-700',
      button: 'bg-gray-700 hover:bg-gray-600',
      input: 'bg-gray-700 text-white border-gray-600',
      notification: 'bg-green-600',
      graphBar: 'bg-indigo-500',
    },
    light: {
      bg: 'bg-gray-100',
      text: 'text-gray-900',
      cardBg: 'bg-white',
      border: 'border-gray-300',
      button: 'bg-gray-200 hover:bg-gray-300',
      input: 'bg-white text-gray-900 border-gray-300',
      notification: 'bg-green-500',
      graphBar: 'bg-indigo-600',
    }
  };

  const currentTheme = themeStyles[theme];

  return (
    <div className={`min-h-screen ${currentTheme.bg} ${currentTheme.text} transition-colors duration-300`}>
      {/* Верхняя панель */}
      <div className={`fixed top-0 left-0 right-0 z-20 ${currentTheme.cardBg} shadow-lg p-4 border-b ${currentTheme.border}`}>
        <div className="container mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Камера: {name || 'Не выбрана'}</h1>
            <div className="flex items-center gap-2 mt-1">
              <div className={`w-2 h-2 rounded-full ${
                connectionStatus === 'connected' ? 'bg-green-500' :
                connectionStatus === 'connecting' ? 'bg-yellow-500' : 'bg-red-500'
              }`}></div>
              <span className="text-sm">
                {connectionStatus === 'connected' ? 'Подключено' :
                 connectionStatus === 'connecting' ? 'Подключение...' : 'Отключено'}
              </span>
            </div>
          </div>
          
          <div className="flex gap-3">
            <button
              onClick={toggleTheme}
              className={`px-4 py-2 rounded-lg ${currentTheme.button} transition-colors`}
            >
              {theme === 'dark' ? '☀️ Светлая' : '🌙 Тёмная'}
            </button>
            <button onClick={() => navigate(`/camera/${name}/zones`)}>
              ⚙️ Настроить зоны
            </button>
            <button
              onClick={() => setShowIncidentGraph(!showIncidentGraph)}
              className={`px-4 py-2 rounded-lg ${currentTheme.button} transition-colors`}
            >
              📊 График происшествий
            </button>
          </div>
        </div>
      </div>

      {/* Основной контент */}
      <div className="pt-20 pb-4 px-4">
        <div className="container mx-auto">
          {/* Панель управления */}
          <div className={`${currentTheme.cardBg} rounded-lg shadow-lg p-4 mb-4 border ${currentTheme.border}`}>
            <div className="flex flex-wrap gap-3 justify-between items-center">
              <div className="flex gap-2">
                <button
                  onClick={zoomIn}
                  className={`px-4 py-2 rounded-lg ${currentTheme.button} transition-colors font-semibold`}
                  title="Приблизить"
                >
                  🔍 + Приблизить
                </button>
                <button
                  onClick={zoomOut}
                  className={`px-4 py-2 rounded-lg ${currentTheme.button} transition-colors font-semibold`}
                  title="Отдалить"
                >
                  🔍 - Отдалить
                </button>
                <button
                  onClick={resetZoom}
                  className={`px-4 py-2 rounded-lg ${currentTheme.button} transition-colors font-semibold`}
                  title="Сбросить"
                >
                  ⟲ Сброс
                </button>
              </div>
              
              <div className="text-sm">
                Масштаб: {Math.round(scale * 100)}%
              </div>
            </div>
          </div>

          {/* Область изображения */}
          <div 
            ref={containerRef}
            className={`${currentTheme.cardBg} rounded-lg shadow-lg overflow-hidden border ${currentTheme.border} mb-4`}
            style={{ height: 'calc(100vh - 280px)', position: 'relative' }}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <div
              style={{
                transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
                transformOrigin: '0 0',
                cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: isDragging ? 'none' : 'transform 0.1s ease'
              }}
              onMouseDown={handleMouseDown}
            >
              <img
                ref={imgRef}
                id="camera-img"
                alt="Камера"
                src="https://aif-s3.aif.ru/images/009/509/f66c73edbc0f02aeae694097bdfd0f26.jpg"
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                  pointerEvents: scale > 1 ? 'auto' : 'none'
                }}
              />
            </div>
            
            {/* Спиннер загрузки */}
            <div id="loader" style={{
              position: 'absolute',
              inset: '0',
              display: isStreaming ? 'none' : 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0,0,0,0.7)',
              zIndex: 10
            }}>
              <div style={{
                width: '48px',
                height: '48px',
                border: '6px solid #f3f3f3',
                borderTop: '6px solid #3498db',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }}></div>
            </div>
          </div>

          {/* Панель отправки уведомлений */}
          <div className={`${currentTheme.cardBg} rounded-lg shadow-lg p-4 border ${currentTheme.border}`}>
            <h3 className="text-lg font-semibold mb-3">📢 Отправить уведомление</h3>
            <div className="flex gap-3">
              <input
                type="text"
                value={notificationMessage}
                onChange={(e) => setNotificationMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendNotification()}
                placeholder="Введите сообщение..."
                className={`flex-1 px-4 py-2 rounded-lg ${currentTheme.input} border ${currentTheme.border} focus:outline-none focus:ring-2 focus:ring-indigo-500`}
              />
              <button
                onClick={sendNotification}
                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors font-semibold"
              >
                Отправить
              </button>
            </div>
          </div>

          {/* Всплывающее уведомление */}
          {showNotifications && notifications.length > 0 && (
            <div className={`fixed bottom-4 right-4 ${currentTheme.notification} text-white p-4 rounded-lg shadow-lg z-50 animate-bounce`}>
              <p className="font-semibold">Новое уведомление!</p>
              <p className="text-sm">{notifications[0].message}</p>
              <p className="text-xs mt-1">Камера: {notifications[0].camera}</p>
            </div>
          )}
        </div>
      </div>

      {/* График происшествий (модальное окно) */}
      {showIncidentGraph && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className={`${currentTheme.cardBg} rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-auto p-6 ${currentTheme.text}`}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold">📈 График происшествий по времени</h2>
              <button
                onClick={() => setShowIncidentGraph(false)}
                className="text-2xl hover:text-red-500 transition-colors"
              >
                ✕
              </button>
            </div>
            
            <div className="mb-6">
              <h3 className="font-semibold mb-2">Камера: {name}</h3>
              <p className="text-sm opacity-75">За последние 24 часа</p>
            </div>

            {/* График */}
            <div className="space-y-2 mb-6">
              {incidentsByHour.map((count, hour) => (
                <div key={hour} className="flex items-center gap-2">
                  <div className="w-16 text-sm">{hour}:00</div>
                  <div className="flex-1 h-8 bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden">
                    <div
                      className={`h-full ${currentTheme.graphBar} transition-all duration-500 flex items-center justify-end px-2 text-xs text-white`}
                      style={{ width: `${(count / maxIncidents) * 100}%` }}
                    >
                      {count > 0 && count}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Список происшествий */}
            <div>
              <h3 className="font-semibold mb-3">📋 Последние происшествия</h3>
              <div className="space-y-2 max-h-60 overflow-auto">
                {incidents.map((incident, idx) => (
                  <div key={idx} className={`p-3 rounded-lg ${currentTheme.button} flex justify-between items-center`}>
                    <div>
                      <span className="font-medium">{incident.time}</span>
                      <span className="ml-3 text-sm opacity-75">{incident.date}</span>
                    </div>
                    <span className={`px-2 py-1 rounded text-sm ${
                      incident.type === 'Движение' ? 'bg-yellow-500' :
                      incident.type === 'Звук' ? 'bg-blue-500' : 'bg-red-500'
                    } text-white`}>
                      {incident.type}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Стили для анимации */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        .animate-bounce {
          animation: bounce 0.5s ease-in-out;
        }
      `}</style>
    </div>
  );
}

export default Camera;