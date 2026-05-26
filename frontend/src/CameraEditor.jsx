import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";

const POLYGON_TYPES = [
  { key: "road_zones",      label: "Дорожная зона",      color: "rgba(52,152,219,0.35)",  stroke: "#2980b9", icon: "🛣️" },
  { key: "stop_zones",      label: "Зона остановки",     color: "rgba(230,126,34,0.35)",  stroke: "#e67e22", icon: "🅿️" },
  { key: "crosswalk_zones", label: "Пешеходный переход", color: "rgba(46,204,113,0.35)",  stroke: "#27ae60", icon: "🚶" },
];
const LANE_KEY = "lane_lines";

const API = "http://localhost:8000";

// ── Геометрия ──────────────────────────────────────────────────────────────────

function pointInPolygon([px, py], polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i], [xj, yj] = polygon[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

// Разбивает полигон ломаной polyline (≥2 точек), возвращает [poly1, poly2] или null
function splitPolygonByPolyline(polygon, polyline) {
  const n = polygon.length;
  const hits = [];
  let cumulLen = 0;

  for (let j = 0; j < polyline.length - 1; j++) {
    const [ax, ay] = polyline[j], [bx, by] = polyline[j + 1];
    const d1x = bx - ax, d1y = by - ay;
    const segLen = Math.hypot(d1x, d1y);

    for (let i = 0; i < n; i++) {
      const [cx, cy] = polygon[i], [dx, dy] = polygon[(i + 1) % n];
      const d2x = dx - cx, d2y = dy - cy;
      const cross = d1x * d2y - d1y * d2x;
      if (Math.abs(cross) < 1e-9) continue;
      const ex = cx - ax, ey = cy - ay;
      const t = (ex * d2y - ey * d2x) / cross;
      const u = (ex * d1y - ey * d1x) / cross;
      if (t >= -1e-9 && t <= 1 + 1e-9 && u >= -1e-9 && u <= 1 + 1e-9) {
        const pt = [Math.round(ax + t * d1x), Math.round(ay + t * d1y)];
        const globalT = cumulLen + t * segLen;
        if (!hits.some(h => Math.hypot(h.pt[0] - pt[0], h.pt[1] - pt[1]) < 3))
          hits.push({ pt, polyEdge: i, polylineSegIdx: j, globalT });
      }
    }
    cumulLen += segLen;
  }

  if (hits.length < 2) return null;
  hits.sort((a, b) => a.globalT - b.globalT);

  const h1 = hits[0], h2 = hits[hits.length - 1];

  // Точки ломаной строго между первым и последним пересечением
  const innerPts = [];
  for (let j = h1.polylineSegIdx + 1; j <= h2.polylineSegIdx; j++)
    innerPts.push(polyline[j]);

  // ha — с меньшим индексом ребра полигона
  let ha, hb, inner;
  if (h1.polyEdge <= h2.polyEdge) {
    [ha, hb, inner] = [h1, h2, innerPts];
  } else {
    [ha, hb, inner] = [h2, h1, [...innerPts].reverse()];
  }

  const poly1 = [ha.pt];
  for (let i = ha.polyEdge + 1; i <= hb.polyEdge; i++) poly1.push(polygon[i]);
  poly1.push(hb.pt);
  for (let k = inner.length - 1; k >= 0; k--) poly1.push(inner[k]);

  const poly2 = [hb.pt];
  for (let i = hb.polyEdge + 1; i < n; i++) poly2.push(polygon[i]);
  for (let i = 0; i <= ha.polyEdge; i++) poly2.push(polygon[i]);
  poly2.push(ha.pt);
  for (let k = 0; k < inner.length; k++) poly2.push(inner[k]);

  return [poly1, poly2];
}

// ── Рисование стрелки на canvas ────────────────────────────────────────────────

function drawArrow(ctx, [x1, y1], [x2, y2], color, lw = 2.5) {
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
  if (len < 2) return;
  const angle = Math.atan2(dy, dx);
  const hl = Math.min(20, len * 0.45);
  const ha = Math.PI / 5.5;
  ctx.save();
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = lw; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - hl * Math.cos(angle - ha), y2 - hl * Math.sin(angle - ha));
  ctx.lineTo(x2 - hl * Math.cos(angle + ha), y2 - hl * Math.sin(angle + ha));
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

// ─────────────────────────────────────────────────────────────────────────────

export default function CameraEditor() {
  const { name } = useParams();
  const navigate = useNavigate();

  const [screenshot,    setScreenshot]    = useState(null);
  const [imgSize,       setImgSize]       = useState({ w: 0, h: 0 });
  const [activeType,    setActiveType]    = useState("road_zones");
  const [zones, setZones] = useState({
    road_zones: [], stop_zones: [], crosswalk_zones: [], lane_lines: [],
  });
  const [currentPoints, setCurrentPoints] = useState([]);
  const [hoveredZone,   setHoveredZone]   = useState(null);
  const [saving,        setSaving]        = useState(false);
  const [saved,         setSaved]         = useState(false);
  const [liveFrame,     setLiveFrame]     = useState(null);
  const [editorOpen,    setEditorOpen]    = useState(false);
  const [splitZoneIdx,  setSplitZoneIdx]  = useState(null);  // null | index в road_zones
  const [directionZoneIdx, setDirectionZoneIdx] = useState(null); // null | index в road_zones
  const [invalidMsg,    setInvalidMsg]    = useState("");

  const currentPointsRef = useRef([]);
  const zonesRef         = useRef(zones);
  useEffect(() => { zonesRef.current = zones; }, [zones]);

  const canvasRef     = useRef(null);
  const imgRef        = useRef(null);
  const wsRef         = useRef(null);
  const latestBlobRef = useRef(null);

  const flashInvalid = (msg) => {
    setInvalidMsg(msg);
    setTimeout(() => setInvalidMsg(""), 1200);
  };

  // ── WebSocket ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const ws = new WebSocket("ws://localhost:8000/ws");
    wsRef.current = ws;
    ws.onopen    = () => ws.send(JSON.stringify({ camera: name, layers: [] }));
    ws.onmessage = (e) => {
      if (typeof e.data === "string") return;
      const blob = new Blob([e.data], { type: "image/jpeg" });
      const url  = URL.createObjectURL(blob);
      if (latestBlobRef.current) URL.revokeObjectURL(latestBlobRef.current);
      latestBlobRef.current = url;
      setLiveFrame(url);
    };
    return () => { ws.close(); if (latestBlobRef.current) URL.revokeObjectURL(latestBlobRef.current); };
  }, [name]);

  // ── Загрузка зон ─────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`${API}/camera-zones?name=${encodeURIComponent(name)}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` },
    })
      .then(r => r.json())
      .then(d => {
        setZones({
          road_zones:      d.road_zones      || [],
          stop_zones:      d.stop_zones      || [],
          crosswalk_zones: d.crosswalk_zones || [],
          lane_lines:      d.lane_lines      || [],
        });
      })
      .catch(() => {});
  }, [name]);

  // ── Скриншот ─────────────────────────────────────────────────────────────────
  const takeScreenshot = useCallback(() => {
    if (!liveFrame) return;
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext("2d").drawImage(img, 0, 0);
      setScreenshot(c.toDataURL("image/jpeg", 0.95));
      setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
      setEditorOpen(true);
    };
    img.src = liveFrame;
  }, [liveFrame]);

  // ── Canvas drawing ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!editorOpen || !screenshot) return;
    const canvas = canvasRef.current, img = imgRef.current;
    if (!canvas || !img) return;
    const ctx  = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width; canvas.height = rect.height;
    const sx = rect.width / imgSize.w, sy = rect.height / imgSize.h;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Подсветка зоны для сплита
    if (splitZoneIdx !== null) {
      const poly = zones.road_zones[splitZoneIdx];
      if (poly?.length >= 3) {
        ctx.beginPath();
        ctx.moveTo(poly[0][0] * sx, poly[0][1] * sy);
        for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0] * sx, poly[i][1] * sy);
        ctx.closePath();
        ctx.fillStyle = "rgba(231,76,60,0.18)"; ctx.fill();
        ctx.strokeStyle = "#e74c3c"; ctx.lineWidth = 2.5;
        ctx.setLineDash([6, 4]); ctx.stroke(); ctx.setLineDash([]);
      }
    }

    // Подсветка дороги(-ог) когда рисуем направления
    if (activeType === LANE_KEY) {
      zones.road_zones.forEach((poly, i) => {
        if (poly.length < 3) return;
        if (directionZoneIdx !== null && directionZoneIdx !== i) return;
        ctx.beginPath();
        ctx.moveTo(poly[0][0] * sx, poly[0][1] * sy);
        for (let j = 1; j < poly.length; j++) ctx.lineTo(poly[j][0] * sx, poly[j][1] * sy);
        ctx.closePath();
        ctx.fillStyle = "rgba(52,152,219,0.12)"; ctx.fill();
        ctx.strokeStyle = "#2980b9"; ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([]);
      });
    }

    // Полигоны (road, stop, crosswalk)
    POLYGON_TYPES.forEach(zt => {
      (zones[zt.key] || []).forEach((poly, idx) => {
        if (poly.length < 3) return;
        if (zt.key === "road_zones" && splitZoneIdx === idx) return; // уже нарисован выше
        const isHov = hoveredZone?.type === zt.key && hoveredZone?.index === idx;
        ctx.beginPath();
        ctx.moveTo(poly[0][0] * sx, poly[0][1] * sy);
        for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0] * sx, poly[i][1] * sy);
        ctx.closePath();
        ctx.fillStyle = isHov ? zt.color.replace("0.35", "0.55") : zt.color;
        ctx.fill();
        ctx.strokeStyle = zt.stroke; ctx.lineWidth = isHov ? 3 : 2; ctx.stroke();
        poly.forEach(([px, py]) => {
          ctx.beginPath(); ctx.arc(px * sx, py * sy, 4, 0, Math.PI * 2);
          ctx.fillStyle = zt.stroke; ctx.fill();
        });
        const cx = (poly.reduce((s, p) => s + p[0], 0) / poly.length) * sx;
        const cy = (poly.reduce((s, p) => s + p[1], 0) / poly.length) * sy;
        ctx.font = "bold 14px monospace";
        ctx.fillStyle = "#fff"; ctx.strokeStyle = "#000"; ctx.lineWidth = 3;
        ctx.strokeText(`${zt.icon} ${idx + 1}`, cx - 12, cy + 5);
        ctx.fillText(`${zt.icon} ${idx + 1}`, cx - 12, cy + 5);
      });
    });

    // Стрелки направления (lane_lines)
    (zones.lane_lines || []).forEach((arrow, idx) => {
      if (arrow.length < 2) return;
      const isHov = hoveredZone?.type === LANE_KEY && hoveredZone?.index === idx;
      const color = isHov ? "#c39bd3" : "#8e44ad";
      drawArrow(ctx, [arrow[0][0] * sx, arrow[0][1] * sy], [arrow[1][0] * sx, arrow[1][1] * sy], color, isHov ? 3.5 : 2.5);
      arrow.forEach(([px, py]) => {
        ctx.beginPath(); ctx.arc(px * sx, py * sy, 4, 0, Math.PI * 2);
        ctx.fillStyle = "#8e44ad"; ctx.fill();
      });
    });

    // Текущий контур / ломаная сплита
    const pts = currentPoints;
    if (pts.length > 0) {
      if (splitZoneIdx !== null) {
        // Многоточечная линия разреза
        ctx.beginPath();
        ctx.moveTo(pts[0][0] * sx, pts[0][1] * sy);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] * sx, pts[i][1] * sy);
        ctx.strokeStyle = "#e74c3c"; ctx.lineWidth = 2.5;
        ctx.setLineDash([8, 4]); ctx.stroke(); ctx.setLineDash([]);
        pts.forEach(([px, py]) => {
          ctx.beginPath(); ctx.arc(px * sx, py * sy, 6, 0, Math.PI * 2);
          ctx.fillStyle = "#e74c3c"; ctx.fill();
          ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke();
        });
      } else if (activeType === LANE_KEY) {
        // Первая точка стрелки
        ctx.beginPath(); ctx.arc(pts[0][0] * sx, pts[0][1] * sy, 6, 0, Math.PI * 2);
        ctx.fillStyle = "#8e44ad"; ctx.fill();
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke();
      } else {
        // Незамкнутый полигон
        const zt = POLYGON_TYPES.find(z => z.key === activeType);
        ctx.beginPath();
        ctx.moveTo(pts[0][0] * sx, pts[0][1] * sy);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] * sx, pts[i][1] * sy);
        ctx.strokeStyle = zt?.stroke || "#fff"; ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]); ctx.stroke(); ctx.setLineDash([]);
        pts.forEach(([px, py], i) => {
          ctx.beginPath(); ctx.arc(px * sx, py * sy, i === 0 ? 7 : 4, 0, Math.PI * 2);
          ctx.fillStyle = i === 0 ? "#e74c3c" : (zt?.stroke || "#fff"); ctx.fill();
          if (i === 0) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke(); }
        });
      }
    }
  }, [editorOpen, screenshot, zones, currentPoints, activeType, hoveredZone, imgSize, splitZoneIdx, directionZoneIdx]);

  // ── Обновить currentPoints через ref (fix stale closure) ────────────────────
  const setCPts = useCallback((pts) => {
    currentPointsRef.current = pts;
    setCurrentPoints(pts);
  }, []);

  // ── Клик по canvas ──────────────────────────────────────────────────────────
  const handleCanvasClick = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = Math.round((e.clientX - rect.left) * (imgSize.w / rect.width));
    const py = Math.round((e.clientY - rect.top)  * (imgSize.h / rect.height));
    const pts = currentPointsRef.current;

    // ── Режим сплита: накапливаем точки ломаной ──
    if (splitZoneIdx !== null) {
      setCPts([...pts, [px, py]]);
      return;
    }

    // ── Стрелка направления ──
    if (activeType === LANE_KEY) {
      const targetZone = directionZoneIdx !== null
        ? zonesRef.current.road_zones[directionZoneIdx]
        : null;
      const inRoad = targetZone
        ? pointInPolygon([px, py], targetZone)
        : zonesRef.current.road_zones.some(z => pointInPolygon([px, py], z));
      if (!inRoad) { flashInvalid("Стрелки рисуются только в пределах дорожной зоны"); return; }
      if (pts.length === 0) {
        setCPts([[px, py]]);
      } else {
        setZones(prev => ({ ...prev, lane_lines: [...prev.lane_lines, [pts[0], [px, py]]] }));
        setCPts([]);
      }
      return;
    }

    // ── Рисование полигона ──
    if (pts.length >= 3) {
      const [fx, fy] = pts[0];
      if (Math.hypot(px - fx, py - fy) < 15) {
        setZones(prev => ({ ...prev, [activeType]: [...prev[activeType], pts] }));
        setCPts([]);
        return;
      }
    }
    setCPts([...pts, [px, py]]);
  }, [activeType, imgSize, splitZoneIdx, directionZoneIdx, setCPts]);

  // ── Двойной клик ─────────────────────────────────────────────────────────────
  const handleDblClick = useCallback(() => {
    // В режиме сплита двойной клик = выполнить разрез
    if (splitZoneIdx !== null) {
      let pts = currentPointsRef.current;
      if (pts.length >= 2) {
        const [lx, ly] = pts[pts.length - 1], [sx, sy] = pts[pts.length - 2];
        if (Math.hypot(lx - sx, ly - sy) < 8) pts = pts.slice(0, -1);
      }
      if (pts.length >= 2) {
        const poly   = zonesRef.current.road_zones[splitZoneIdx];
        const result = splitPolygonByPolyline(poly, pts);
        if (result) {
          setZones(prev => {
            const rz = [...prev.road_zones];
            rz.splice(splitZoneIdx, 1, result[0], result[1]);
            return { ...prev, road_zones: rz };
          });
          setSplitZoneIdx(null);
          setCPts([]);
        } else {
          flashInvalid("Линия не пересекает зону в двух местах — попробуйте ещё раз");
          setCPts([]);
        }
      }
      return;
    }

    if (activeType === LANE_KEY) return;

    // Замкнуть полигон двойным кликом
    let pts = currentPointsRef.current;
    if (pts.length >= 2) {
      const [lx, ly] = pts[pts.length - 1], [sx, sy] = pts[pts.length - 2];
      if (Math.hypot(lx - sx, ly - sy) < 8) pts = pts.slice(0, -1);
    }
    if (pts.length >= 3) {
      setZones(prev => ({ ...prev, [activeType]: [...prev[activeType], pts] }));
      setCPts([]);
    }
  }, [activeType, splitZoneIdx, setCPts]);

  // ── ПКМ: удалить последнюю точку / отмена ────────────────────────────────────
  const handleRightClick = useCallback((e) => {
    e.preventDefault();
    const pts = currentPointsRef.current;
    if (splitZoneIdx !== null) {
      if (pts.length > 0) { setCPts(pts.slice(0, -1)); return; }
      setSplitZoneIdx(null); setCPts([]);
      return;
    }
    if (pts.length > 0) setCPts(pts.slice(0, -1));
  }, [splitZoneIdx, setCPts]);

  // ── Удалить зону ──────────────────────────────────────────────────────────────
  const deleteZone = useCallback((type, index) => {
    setZones(prev => ({ ...prev, [type]: prev[type].filter((_, i) => i !== index) }));
    if (type === "road_zones" && splitZoneIdx === index)    setSplitZoneIdx(null);
    if (type === "road_zones" && directionZoneIdx === index) setDirectionZoneIdx(null);
  }, [splitZoneIdx, directionZoneIdx]);

  // ── Сохранить ────────────────────────────────────────────────────────────────
  const saveZones = useCallback(async () => {
    setSaving(true); setSaved(false);
    try {
      const res = await fetch(`${API}/camera-zones`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${window.accessToken || localStorage.getItem("access_token")}`,
        },
        body: JSON.stringify({ name, zones }),
      });
      if (res.ok) setSaved(true);
    } catch (err) { alert("Ошибка сохранения: " + err.message); }
    finally { setSaving(false); setTimeout(() => setSaved(false), 2000); }
  }, [name, zones]);

  // ── Keyboard ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape") {
        setCPts([]); setSplitZoneIdx(null);
        if (activeType === LANE_KEY) { setActiveType("road_zones"); setDirectionZoneIdx(null); }
      }
      if (e.key === "z" && (e.ctrlKey || e.metaKey)) {
        const pts = currentPointsRef.current;
        if (pts.length > 0) setCPts(pts.slice(0, -1));
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [activeType, setCPts]);

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const hasSplitTarget  = splitZoneIdx !== null;
  const isDirectionMode = activeType === LANE_KEY;
  const activeZT        = POLYGON_TYPES.find(z => z.key === activeType);

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div style={S.page}>
      {/* Хедер */}
      <div style={S.header}>
        <button onClick={() => navigate(-1)} style={S.backBtn}>← Назад</button>
        <h1 style={S.title}><span style={{ marginRight: 8 }}>📷</span>{name}</h1>
        <div style={{ display: "flex", gap: 8 }}>
          {!editorOpen ? (
            <button onClick={takeScreenshot} style={S.screenshotBtn} disabled={!liveFrame}>
              ✂️ Скриншот → Редактор зон
            </button>
          ) : (
            <button onClick={() => setEditorOpen(false)} style={S.closeBtnHdr}>✕ Закрыть редактор</button>
          )}
        </div>
      </div>

      {/* Живой поток */}
      {!editorOpen && (
        <div style={S.liveContainer}>
          {!liveFrame && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={S.spinner} />
              <span style={{ color: "#aaa", marginTop: 12 }}>Подключение к камере...</span>
            </div>
          )}
          {liveFrame && <img src={liveFrame} alt="Live" style={S.liveImg} />}
          {liveFrame && Object.values(zones).some(z => z.length > 0) && (
            <div style={{ position: "absolute", top: 12, right: 12, display: "flex", gap: 6 }}>
              {[...POLYGON_TYPES, { key: LANE_KEY, icon: "⬆️" }].map(zt => {
                const c = (zones[zt.key] || []).length;
                return c > 0 ? <span key={zt.key} style={S.badge}>{zt.icon} {c}</span> : null;
              })}
            </div>
          )}
        </div>
      )}

      {/* Редактор */}
      {editorOpen && (
        <div style={S.editorLayout}>
          {/* Левая панель */}
          <div style={S.toolPanel}>

            {/* Типы зон (только полигоны, без направлений) */}
            <div style={S.sect}>
              <div style={S.sectLabel}>Тип зоны</div>
              {POLYGON_TYPES.map(zt => (
                <button key={zt.key}
                  onClick={() => { setActiveType(zt.key); setCPts([]); setSplitZoneIdx(null); setDirectionZoneIdx(null); }}
                  style={{
                    ...S.toolBtn,
                    borderLeft: activeType === zt.key && !hasSplitTarget && !isDirectionMode
                      ? `4px solid ${zt.stroke}` : "4px solid transparent",
                    background: activeType === zt.key && !hasSplitTarget && !isDirectionMode
                      ? "rgba(255,255,255,0.08)" : "transparent",
                  }}>
                  <span style={{ fontSize: 18 }}>{zt.icon}</span>
                  <span>{zt.label}</span>
                </button>
              ))}
            </div>

            {/* Подсказки */}
            <div style={S.sect}>
              <div style={S.sectLabel}>Подсказки</div>
              {hasSplitTarget ? (
                <div style={S.hint}>
                  <b>Клик</b> — добавить точку линии разреза<br />
                  <b>Двойной клик</b> — выполнить разрез<br />
                  <b>ПКМ</b> — удалить последнюю точку<br />
                  <b>Esc</b> — отмена<br />
                  <br />
                  <span style={{ color: "#e74c3c" }}>✂️ Разрезаю зону #{splitZoneIdx + 1}</span>
                </div>
              ) : isDirectionMode ? (
                <div style={S.hint}>
                  <b>Клик 1</b> — начало стрелки<br />
                  <b>Клик 2</b> — конец стрелки (сохраняется)<br />
                  <b>ПКМ</b> — отменить начатую стрелку<br />
                  <b>Esc</b> — выйти из режима<br />
                  <div style={{ marginTop: 8, padding: "6px 8px", background: "rgba(142,68,173,0.15)", borderRadius: 4, borderLeft: "3px solid #8e44ad", lineHeight: 1.65, fontSize: 11 }}>
                    🚗 Правостороннее движение:<br />
                    Рисуйте стрелки в направлении движения.
                    {directionZoneIdx !== null && (
                      <><br /><span style={{ color: "#c39bd3" }}>Зона #{directionZoneIdx + 1}</span></>
                    )}
                  </div>
                </div>
              ) : (
                <div style={S.hint}>
                  <b>Клик</b> — добавить точку<br />
                  <b>Клик на 1-ю точку</b> — замкнуть<br />
                  <b>Двойной клик</b> — замкнуть<br />
                  <b>ПКМ</b> — удалить последнюю точку<br />
                  <b>Esc</b> — отменить<br />
                  <b>Ctrl+Z</b> — удалить точку
                </div>
              )}
            </div>

            {/* Список зон */}
            <div style={{ ...S.sect, flex: 1, overflowY: "auto" }}>
              <div style={S.sectLabel}>Зоны</div>

              {/* Дорожные зоны: кнопки ⬆️ и ✂️ на каждой */}
              {zones.road_zones.map((poly, idx) => (
                <div key={`rz-${idx}`}
                  style={{
                    ...S.zoneItem,
                    borderLeft: "3px solid #2980b9",
                    background: splitZoneIdx === idx
                      ? "rgba(231,76,60,0.15)"
                      : directionZoneIdx === idx && isDirectionMode
                        ? "rgba(142,68,173,0.15)"
                        : hoveredZone?.type === "road_zones" && hoveredZone?.index === idx
                          ? "rgba(255,255,255,0.08)"
                          : "transparent",
                  }}
                  onMouseEnter={() => setHoveredZone({ type: "road_zones", index: idx })}
                  onMouseLeave={() => setHoveredZone(null)}>
                  <span>🛣️ Дорожная #{idx + 1} <span style={{ color: "#666", fontSize: 11 }}>({poly.length}пт)</span></span>
                  <div style={{ display: "flex", gap: 4 }}>
                    {/* Направление для этой полосы */}
                    <button
                      onClick={() => {
                        if (directionZoneIdx === idx && isDirectionMode) {
                          setActiveType("road_zones");
                          setDirectionZoneIdx(null);
                          setCPts([]);
                        } else {
                          setActiveType(LANE_KEY);
                          setDirectionZoneIdx(idx);
                          setCPts([]);
                          setSplitZoneIdx(null);
                        }
                      }}
                      title="Направление движения для этой зоны"
                      style={{ ...S.iconBtn, color: directionZoneIdx === idx && isDirectionMode ? "#8e44ad" : "#666" }}>⬆️</button>
                    {/* Разрезать */}
                    <button
                      onClick={() => {
                        setSplitZoneIdx(splitZoneIdx === idx ? null : idx);
                        setCPts([]);
                        if (isDirectionMode) { setActiveType("road_zones"); setDirectionZoneIdx(null); }
                      }}
                      title="Разрезать зону"
                      style={{ ...S.iconBtn, color: splitZoneIdx === idx ? "#e74c3c" : "#888" }}>✂️</button>
                    <button onClick={() => deleteZone("road_zones", idx)} style={{ ...S.iconBtn, color: "#e74c3c" }} title="Удалить">✕</button>
                  </div>
                </div>
              ))}

              {/* Остальные зоны */}
              {["stop_zones", "crosswalk_zones"].map(key => {
                const zt = POLYGON_TYPES.find(z => z.key === key);
                return (zones[key] || []).map((poly, idx) => (
                  <div key={`${key}-${idx}`}
                    style={{ ...S.zoneItem, borderLeft: `3px solid ${zt.stroke}`, background: hoveredZone?.type === key && hoveredZone?.index === idx ? "rgba(255,255,255,0.08)" : "transparent" }}
                    onMouseEnter={() => setHoveredZone({ type: key, index: idx })}
                    onMouseLeave={() => setHoveredZone(null)}>
                    <span>{zt.icon} {zt.label} #{idx + 1} <span style={{ color: "#666", fontSize: 11 }}>({poly.length}пт)</span></span>
                    <button onClick={() => deleteZone(key, idx)} style={{ ...S.iconBtn, color: "#e74c3c" }} title="Удалить">✕</button>
                  </div>
                ));
              })}

              {/* Стрелки направлений */}
              {(zones.lane_lines || []).map((arrow, idx) => (
                <div key={`lane-${idx}`}
                  style={{ ...S.zoneItem, borderLeft: "3px solid #8e44ad", background: hoveredZone?.type === LANE_KEY && hoveredZone?.index === idx ? "rgba(255,255,255,0.08)" : "transparent" }}
                  onMouseEnter={() => setHoveredZone({ type: LANE_KEY, index: idx })}
                  onMouseLeave={() => setHoveredZone(null)}>
                  <span>⬆️ Направление #{idx + 1}</span>
                  <button onClick={() => deleteZone(LANE_KEY, idx)} style={{ ...S.iconBtn, color: "#e74c3c" }} title="Удалить">✕</button>
                </div>
              ))}

              {Object.values(zones).every(z => z.length === 0) && (
                <div style={{ color: "#555", fontSize: 12, padding: "8px 0" }}>Зон нет. Нарисуйте полигон.</div>
              )}
            </div>

            <button onClick={saveZones} style={S.saveBtn} disabled={saving}>
              {saving ? "Сохраняю..." : saved ? "✓ Сохранено!" : "💾 Сохранить зоны"}
            </button>
          </div>

          {/* Канвас */}
          <div style={S.canvasContainer}>
            {invalidMsg && (
              <div style={S.invalidBanner}>{invalidMsg}</div>
            )}
            {hasSplitTarget && (
              <div style={{ ...S.splitBanner }}>
                ✂️ Зона #{splitZoneIdx + 1} — кликайте точки, двойной клик — выполнить разрез
              </div>
            )}
            <div style={S.canvasWrapper}>
              <img ref={imgRef} src={screenshot} alt="" style={S.screenshotImg} draggable={false} />
              <canvas ref={canvasRef} style={S.canvas}
                onClick={handleCanvasClick}
                onDoubleClick={handleDblClick}
                onContextMenu={handleRightClick} />
            </div>
            <div style={{ ...S.currentTool, borderColor: hasSplitTarget ? "#e74c3c" : isDirectionMode ? "#8e44ad" : (activeZT?.stroke || "#fff") }}>
              {hasSplitTarget
                ? `✂️ Разрезаю дорожную зону #${splitZoneIdx + 1}`
                : isDirectionMode
                  ? `⬆️ Направление — зона #${directionZoneIdx !== null ? directionZoneIdx + 1 : "любая"}`
                  : `${activeZT?.icon} ${activeZT?.label}`}
              {currentPoints.length > 0 && <span style={{ color: "#aaa", marginLeft: 8 }}>({currentPoints.length} точек)</span>}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform:rotate(360deg); } }
        @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
      `}</style>
    </div>
  );
}

// ── Стили ─────────────────────────────────────────────────────────────────────

const S = {
  page:          { minHeight: "100vh", background: "#0c0c0f", color: "#e0e0e0", fontFamily: "'JetBrains Mono','Fira Code',monospace" },
  header:        { display: "flex", alignItems: "center", gap: 16, padding: "12px 20px", background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)" },
  backBtn:       { background: "none", border: "1px solid rgba(255,255,255,0.15)", color: "#aaa", padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontSize: 13 },
  title:         { fontSize: 16, fontWeight: 500, color: "#fff", margin: 0, flex: 1 },
  screenshotBtn: { background: "linear-gradient(135deg,#2980b9,#3498db)", border: "none", color: "#fff", padding: "8px 18px", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600 },
  closeBtnHdr:   { background: "rgba(231,76,60,0.15)", border: "1px solid rgba(231,76,60,0.3)", color: "#e74c3c", padding: "8px 18px", borderRadius: 6, cursor: "pointer", fontSize: 13 },
  liveContainer: { position: "relative", display: "flex", justifyContent: "center", alignItems: "center", minHeight: "70vh", background: "#000" },
  liveImg:       { maxWidth: "100%", maxHeight: "85vh", objectFit: "contain" },
  spinner:       { width: 40, height: 40, border: "4px solid #333", borderTop: "4px solid #3498db", borderRadius: "50%", animation: "spin 0.8s linear infinite" },
  badge:         { padding: "4px 10px", background: "rgba(0,0,0,0.7)", border: "1px solid #444", borderRadius: 4, fontSize: 13, color: "#fff" },
  editorLayout:  { display: "flex", height: "calc(100vh - 52px)", animation: "fadeIn 0.3s ease" },
  toolPanel:     { width: 260, minWidth: 260, background: "rgba(255,255,255,0.02)", borderRight: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", padding: "12px 0", overflowY: "auto" },
  sect:          { padding: "8px 14px", borderBottom: "1px solid rgba(255,255,255,0.04)" },
  sectLabel:     { fontSize: 10, textTransform: "uppercase", letterSpacing: 1.5, color: "#666", marginBottom: 8, fontWeight: 600 },
  toolBtn:       { display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 10px", background: "transparent", border: "none", color: "#ccc", cursor: "pointer", fontSize: 13, borderRadius: 4, textAlign: "left", transition: "background 0.15s" },
  hint:          { fontSize: 11, color: "#777", lineHeight: 1.7 },
  zoneItem:      { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 8px", fontSize: 12, borderRadius: 3, marginBottom: 2, cursor: "default" },
  iconBtn:       { background: "none", border: "none", cursor: "pointer", fontSize: 14, padding: "2px 5px", borderRadius: 3 },
  saveBtn:       { margin: "auto 14px 14px", padding: "10px 0", background: "linear-gradient(135deg,#27ae60,#2ecc71)", border: "none", color: "#fff", fontSize: 13, fontWeight: 600, borderRadius: 6, cursor: "pointer" },
  canvasContainer: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 16, position: "relative", background: "#000", overflow: "hidden" },
  canvasWrapper: { position: "relative", maxWidth: "100%", maxHeight: "calc(100vh - 120px)" },
  screenshotImg: { maxWidth: "100%", maxHeight: "calc(100vh - 120px)", objectFit: "contain", display: "block", userSelect: "none" },
  canvas:        { position: "absolute", top: 0, left: 0, width: "100%", height: "100%", cursor: "crosshair" },
  currentTool:   { position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)", padding: "6px 16px", background: "rgba(0,0,0,0.8)", border: "1px solid", borderRadius: 6, fontSize: 13, color: "#fff", whiteSpace: "nowrap" },
  invalidBanner: { position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)", background: "rgba(192,57,43,0.92)", color: "#fff", padding: "7px 18px", borderRadius: 7, fontSize: 13, zIndex: 10, pointerEvents: "none", whiteSpace: "nowrap", boxShadow: "0 2px 12px rgba(0,0,0,0.4)" },
  splitBanner:   { position: "absolute", top: 50, left: "50%", transform: "translateX(-50%)", background: "rgba(192,57,43,0.85)", color: "#fff", padding: "7px 18px", borderRadius: 7, fontSize: 13, zIndex: 10, pointerEvents: "none", whiteSpace: "nowrap", boxShadow: "0 2px 12px rgba(0,0,0,0.4)" },
};
