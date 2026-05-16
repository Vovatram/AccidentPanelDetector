import { useEffect, useRef } from "react";
import {useParams} from 'react-router-dom'
function Camera() {
  const { name } = useParams();
  const imgRef = useRef()

  useEffect(() => {
    console.log(33)
  const loader = document.getElementById(`1`);
  const img   = document.getElementById(`2`);
  
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


  }, [])

  return (<>
  <div id="1" 
         style= {{'position': 'absolute', 'inset': '0', 'display': 'flex', 'alignItems': 'center', 'justifyContent': 'center', 'background': 'rgba(0,0,0,0.6)', 'zIndex': '10'}}>
      <div style={{'width': '48px', 'height': '48px', 'border': '6px solid #f3f3f3', 'borderTop': '6px solid #3498db', 'borderRadius': '50%', 'animation': 'spin 1s linear infinite'}}></div>
    </div>
<style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

    <img id="2" alt="Камера" src="https://aif-s3.aif.ru/images/009/509/f66c73edbc0f02aeae694097bdfd0f26.jpg"/></>)
}

export default Camera