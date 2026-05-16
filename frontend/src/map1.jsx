import React, { useEffect, useRef, useMemo } from 'react';
import { useState } from 'react';
import { useNavigate } from "react-router-dom" 
import {handle} from './functions.jsx';
import axios from 'axios';
import { useQuery, useMutation, useQueryClient, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {useParams} from 'react-router-dom'
import deepEqual from 'fast-deep-equal';

const queryClient = new QueryClient()
import { createPortal } from "react-dom";

function YandexMapDirect() {
  return (
    <><QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider></>
  )
}

const App = (theme) => {
  const [cameraContainer, setCameraContainer] = useState(null);
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [open, setOpen] = useState(true);
  const [coord, setCoord] = useState("");
  const [Nname, setNname] = useState()
  const [url, setUrl] = useState("");
  const [data, setData] = useState(false)
  const [notifications, setNotifications] = useState([])
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
})
  
  const { numb } = useParams();
  const navigate = useNavigate();

  // Загружаем API Яндекс.Карт
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
  
  // Получаем камеры каждые 10 секунд
  /*
  const { data: cameras } = useQuery({
    queryKey: ["camera", numb],
    queryFn: async () => {
      const { data } = await axios.get(
        `${import.meta.env.VITE_API_URL}/cameras`,
        { params: { numb } }
      );
      return data.value || data; // на случай, если сервер возвращает {value: [...]}
    },
    refetchInterval: 10000,
  });*/
  /*
  useEffect(() => {
     const F = () => {
      console.log('->>')
      axios.get(`${import.meta.env.VITE_API_URL}/cameras`,{ params: { numb } })
      .then(response => {
          //console.log(response.data, url)
          if (response.data){
            //if(!url[1]){changeUrl(url[0] + '/' + Object.keys(response.data.data.Directs)[0])}
            if (!deepEqual(response.data, cameras)){
              console.log(response.data, cameras)
              setCameras(response.data)}
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
  }, [cameras])*/
  // Отображаем камеры на карте
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
    }, 1000); 

    // Обязательная очистка!
    return () => {
      clearInterval(intervalId);
      console.log("Таймер очищен");
    };
  }, [])*/
  
useEffect(() => {
  
  if (!mapReady || !cameras) return;

  const cameraSVG = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="7" width="18" height="14" rx="2" ry="2"></rect>
      <circle cx="12" cy="14" r="3"></circle>
      <path d="M8 7V5h8v2"></path>
    </svg>
  `;

  // Один overlay на всю карту — создаём один раз
  const overlay = document.createElement("div");
  overlay.id = "camera-overlay";
  overlay.style.position = "absolute";
  overlay.style.top = "0";
  overlay.style.left = "0";
  overlay.style.width = "100%";
  overlay.style.height = "100%";
  overlay.style.pointerEvents = "none";
  mapRef.current.appendChild(overlay);

  // Массив для хранения всех placemark (чтобы точно обновлять scale)
  const placemarks = [];
  console.log(cameras)
  Object.entries(cameras).forEach(([name, body]) => {
    console.log(11255, name)
    const placemark = new window.ymaps.Placemark(
      body[0],
      { hintContent: body[1] },
      {
iconLayout: 'default#image',
    iconImageHref: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(cameraSVG),
    iconImageSize: [32, 32],       // ← это и есть масштаб в пикселях
    iconImageOffset: [-16, -16],
        //iconScale: 1.0,                      // начальное значение
        iconContentLayout: window.ymaps.templateLayoutFactory.createClass(
          `<div id="camera-container" style="position: relative;"></div>`
        )
      }
    );

    mapInstanceRef.current.geoObjects.add(placemark);
    placemarks.push(placemark); // сохраняем ссылку

    placemark.events.add("click", () => {
      mapInstanceRef.current.balloon.close();

      const url = body[1]; // поток
      const cameraId = body[2]; // для пути /camera/...

      const balloonContent = `
  <div style="position: relative; width: 300px; height: 240px; background: #000; border-radius: 6px; overflow: hidden;">
    
    <!-- Спиннер (показывается по умолчанию) -->
    <div id="loader-${body[0].join('-')}" 
         style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.6); z-index: 10;">
      <div style="width: 48px; height: 48px; border: 6px solid #f3f3f3; border-top: 6px solid #3498db; border-radius: 50%; animation: spin 1s linear infinite;"></div>
    </div>

    <!-- Изображение (изначально пустое) -->
    <img id="cam-${body[0].join('-')}" 
         style="width: 100%; height: 100%; object-fit: cover; display: block;"
         src="" alt="Камера">

    <!-- Кнопки справа (если нужно сохранить структуру) -->
    <div style="position: absolute; right: 12px; top: 12px; display: flex; flex-direction: column; gap: 10px; z-index: 15;">
      <button onclick="window.open('${body[1]}', '_blank', 'noopener,noreferrer')" 
              style="padding:8px 12px; background:#007bff; color:white; border:none; border-radius:4px; cursor:pointer;">
        Следить
      </button>
      <button onclick="window.open('/camera/${encodeURIComponent(name)}', '_blank')" 
              style="padding:8px 12px; background:#28a745; color:white; border:none; border-radius:4px; cursor:pointer;">
        Открыть
      </button>
    </div>
  </div>

  <style>
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  </style>
`;

      placemark.properties.set({
        balloonContent: balloonContent,
        balloonContentHeader: `<strong>${body[2] || 'Камера'}</strong>`,
      });

      placemark.balloon.open();

     setTimeout(() => {
  const loader = document.getElementById(`loader-${body[0].join('-')}`);
  const img   = document.getElementById(`cam-${body[0].join('-')}`);

  if (!img || !loader) return;

  const ws = new WebSocket("ws://localhost:8000/ws");

  ws.onopen = () => ws.send(name);

  ws.onmessage = (event) => {
    if (event.data === "ping") {
      ws.send("pong");
      return;
    }

    const blob = new Blob([event.data], { type: "image/jpeg" });
    const url = URL.createObjectURL(blob);

    img.src = url;

    // Как только пришёл первый кадр → скрываем спиннер
    img.onload = () => {
      loader.style.display = "none";
      // Можно сразу revoke предыдущий URL, если был
      if (img.dataset.prev) URL.revokeObjectURL(img.dataset.prev);
      img.dataset.prev = url;
    };
  };

  // На всякий случай: если WS упал до первого кадра
  ws.onerror = () => {
    loader.innerHTML = '<div style="color:white; font-size:16px;">Ошибка соединения</div>';
  };

}, 200);
    });
  });

  // Функция обновления масштаба иконок
  const updatePlacemarkScales = () => {

    if (!mapInstanceRef.current) return;
    const zoom = mapInstanceRef.current.getZoom();

    let scale = 1.0;
    if (zoom <= 3)       scale = 0;
    //else if (zoom <= 13) scale = 16 + (zoom - 10) * 1.3;   // плавнее
    else if (zoom <= 160) scale = 30 + (zoom - 13) * 7;
    else                 scale = 50

    // Обновляем все placemark
    placemarks.forEach((placemark) => {
     placemark.options.set({
        iconImageSize: [scale, scale],          // scale — желаемый размер в пикселях, например 48
        iconImageOffset: [-scale / 2, -scale / 2]  // чтобы центр оставался на месте
      });
    });


  };

  // Подписка на изменение зума
  const zoomListener = (e) => {
    if (e.get('newZoom') !== e.get('oldZoom')) {
      updatePlacemarkScales();
    }
  };

  mapInstanceRef.current.events.add('boundschange', zoomListener);

  // Инициализация
  updatePlacemarkScales();
console.log(mapInstanceRef.current.getZoom());
  // Cleanup при размонтировании компонента
  return () => {
    mapInstanceRef.current.events.remove('boundschange', zoomListener);
    // Можно также удалить placemark'и, если нужно:
    // placemarks.forEach(p => mapInstanceRef.current.geoObjects.remove(p));
    if (overlay.parentNode) overlay.remove();
  };

}, [mapReady, cameras]);

  // Добавление новой камеры
  const addCam = async () => {
    if (!coord || !url) return alert("Введите координаты и URL камеры");

    await axios.get(`${import.meta.env.VITE_API_URL}/newcam`, {
      params: {Nname, coord, url },
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    });

    setCoords("");
    setUrl("");
  };
  

  return (
    <><div style={{ position: "relative" }}>
      <div ref={mapRef} style={{ width: "100%", height: "100vh" }} />
      {/* Панель управления */}
      <button
        onClick={() => setOpen(!open)}
        className={`toggle-btn ${open ? "open" : ""}`}
        style={{ position: "absolute", top: 80, left: 10, zIndex: 1000 }}
      >
        {open ? "✕" : "☰"}
      </button>

      <div
        className={`control-panel ${open ? "open" : ""}`}
        style={{
          position: "absolute",
          top: 50,
          zIndex: 1000,
          width: 250,
          background: theme === "dark" ? "rgba(30,30,30,0.9)" : "rgba(255,255,255,0.9)",
          borderRadius: 8,
        }}
      ><input
          type="text"
          placeholder="Имя"
          value={Nname}
          onChange={(e) => setNname(e.target.value)}
          style={{ width: "100%", marginBottom: 8 }}
        />
        <input
          type="text"
          placeholder="**.******, **.******"
          value={coord}
          onChange={(e) => setCoord(e.target.value)}
          style={{ width: "100%", marginBottom: 8 }}
        />
        <input
          type="text"
          placeholder="Ссылка на камеру"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          style={{ width: "100%", marginBottom: 8 }}
        />
        <button onClick={addCam} style={{ width: "100%" }}>
          ➕ Добавить камеру
        </button>
      </div></div></>
   
  );
};

function Camera() {

  const imgRef = useRef()

useEffect(() => {
  console.log("Пытаемся подключиться к WS");

  //const ws = new WebSocket("wss://accidentpaneldetector.onrender.com/ws");
  const ws = new WebSocket("ws://localhost:8000/ws");

  ws.onopen = () => {
    console.log("WebSocket открыт — соединение установлено");
  };

ws.onmessage = (event) => {
  if (event.data === "ping") {
    ws.send("pong");
    return;
  }
    //console.log("Получено сообщение, длина base64:", event.data.length);
    imgRef.current.src = "data:image/jpeg;base64," + event.data;
  };

  ws.onerror = (err) => {
    console.error("WebSocket ошибка:", err);
  };

  ws.onclose = (event) => {
    console.log("WebSocket закрыт", event.code, event.reason);
  };

  return () => {
    ws.close();
  };
}, []);

  return <img  style={{height : '300px'}} ref={imgRef}/>
}

export default YandexMapDirect;