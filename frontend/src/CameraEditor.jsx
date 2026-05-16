import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";

const ZONE_TYPES = [
  { key: "road_zones",      label: "Дорожная зона",       color: "rgba(52, 152, 219, 0.35)",  stroke: "#2980b9", icon: "🛣️" },
  { key: "stop_zones",      label: "Зона остановки",      color: "rgba(230, 126, 34, 0.35)",  stroke: "#e67e22", icon: "🅿️" },
  { key: "crosswalk_zones", label: "Пешеходный переход",  color: "rgba(46, 204, 113, 0.35)",  stroke: "#27ae60", icon: "🚶" },
  { key: "lane_lines",      label: "Полосы (направление)",color: "rgba(155, 89, 182, 0.35)",  stroke: "#8e44ad", icon: "⬆️" },
];

const API = "http://localhost:8000";

export default function CameraEditor() {
  const { name } = useParams();
  const navigate = useNavigate();

  // --- состояния ---
  const [screenshot, setScreenshot] = useState(null);    // data URL скриншота
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const [activeType, setActiveType] = useState("road_zones");
  const [zones, setZones] = useState({
    road_zones: [],
    stop_zones: [],
    crosswalk_zones: [],
    lane_lines: [],
  });
  const [currentPoints, setCurrentPoints] = useState([]); // текущий рисуемый полигон
  const [hoveredZone, setHoveredZone] = useState(null);   // {type, index}
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [liveFrame, setLiveFrame] = useState(null);       // blob URL живого потока
  const [editorOpen, setEditorOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const wsRef = useRef(null);
  const latestBlobUrl = useRef(null);

  // --- WebSocket: живой поток ---
  useEffect(() => {
    const ws = new WebSocket(`ws://localhost:8000/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      // Шлём JSON с камерой и пустыми слоями (просто видео без оверлеев)
      ws.send(JSON.stringify({ camera: name, layers: [] }));
    };

    ws.onmessage = (event) => {
      if (typeof event.data === "string") return; // JSON-сообщения пропускаем
      const blob = new Blob([event.data], { type: "image/jpeg" });
      const url = URL.createObjectURL(blob);
      if (latestBlobUrl.current) URL.revokeObjectURL(latestBlobUrl.current);
      latestBlobUrl.current = url;
      setLiveFrame(url);
    };

    return () => {
      ws.close();
      if (latestBlobUrl.current) URL.revokeObjectURL(latestBlobUrl.current);
    };
  }, [name]);

  // --- Загрузка существующих зон ---
  useEffect(() => {
    fetch(`${API}/camera-zones?name=${encodeURIComponent(name)}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.road_zones || data.stop_zones || data.crosswalk_zones || data.lane_lines) {
          setZones({
            road_zones: data.road_zones || [],
            stop_zones: data.stop_zones || [],
            crosswalk_zones: data.crosswalk_zones || [],
            lane_lines: data.lane_lines || [],
          });
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [name]);

  // --- Скриншот ---
  const takeScreenshot = useCallback(() => {
    if (!liveFrame) return;
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext("2d").drawImage(img, 0, 0);
      setScreenshot(c.toDataURL("image/jpeg", 0.95));
      setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
      setEditorOpen(true);
    };
    img.src = liveFrame;
  }, [liveFrame]);

  // --- Перерисовка canvas ---
  useEffect(() => {
    if (!editorOpen || !screenshot) return;
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    const scaleX = rect.width / imgSize.w;
    const scaleY = rect.height / imgSize.h;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Рисуем все сохранённые полигоны
    for (const zt of ZONE_TYPES) {
      const polygons = zones[zt.key] || [];
      polygons.forEach((poly, idx) => {
        if (poly.length < 2) return;
        ctx.beginPath();
        ctx.moveTo(poly[0][0] * scaleX, poly[0][1] * scaleY);
        for (let i = 1; i < poly.length; i++) {
          ctx.lineTo(poly[i][0] * scaleX, poly[i][1] * scaleY);
        }
        ctx.closePath();

        const isHovered = hoveredZone?.type === zt.key && hoveredZone?.index === idx;
        ctx.fillStyle = isHovered
          ? zt.color.replace("0.35", "0.55")
          : zt.color;
        ctx.fill();
        ctx.strokeStyle = zt.stroke;
        ctx.lineWidth = isHovered ? 3 : 2;
        ctx.stroke();

        // Точки полигона
        poly.forEach(([px, py]) => {
          ctx.beginPath();
          ctx.arc(px * scaleX, py * scaleY, 4, 0, Math.PI * 2);
          ctx.fillStyle = zt.stroke;
          ctx.fill();
        });

        // Номер полигона
        const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length * scaleX;
        const cy = poly.reduce((s, p) => s + p[1], 0) / poly.length * scaleY;
        ctx.font = "bold 14px monospace";
        ctx.fillStyle = "#fff";
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 3;
        ctx.strokeText(`${zt.icon} ${idx + 1}`, cx - 12, cy + 5);
        ctx.fillText(`${zt.icon} ${idx + 1}`, cx - 12, cy + 5);
      });
    }

    // Рисуем текущий (незакрытый) полигон
    if (currentPoints.length > 0) {
      const zt = ZONE_TYPES.find((z) => z.key === activeType);
      ctx.beginPath();
      ctx.moveTo(currentPoints[0][0] * scaleX, currentPoints[0][1] * scaleY);
      for (let i = 1; i < currentPoints.length; i++) {
        ctx.lineTo(currentPoints[i][0] * scaleX, currentPoints[i][1] * scaleY);
      }
      ctx.strokeStyle = zt.stroke;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Точки
      currentPoints.forEach(([px, py], i) => {
        ctx.beginPath();
        ctx.arc(px * scaleX, py * scaleY, i === 0 ? 7 : 4, 0, Math.PI * 2);
        ctx.fillStyle = i === 0 ? "#e74c3c" : zt.stroke;
        ctx.fill();
        if (i === 0) {
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      });
    }
  }, [editorOpen, screenshot, zones, currentPoints, activeType, hoveredZone, imgSize]);

  // --- Клик по canvas ---
  const handleCanvasClick = useCallback(
    (e) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = imgSize.w / rect.width;
      const scaleY = imgSize.h / rect.height;
      const px = Math.round((e.clientX - rect.left) * scaleX);
      const py = Math.round((e.clientY - rect.top) * scaleY);

      // Если кликнули рядом с первой точкой — замыкаем полигон
      if (currentPoints.length >= 3) {
        const [fx, fy] = currentPoints[0];
        const dist = Math.hypot(px - fx, py - fy);
        if (dist < 15) {
          // Замкнули!
          setZones((prev) => ({
            ...prev,
            [activeType]: [...prev[activeType], [...currentPoints]],
          }));
          setCurrentPoints([]);
          return;
        }
      }

      setCurrentPoints((prev) => [...prev, [px, py]]);
    },
    [currentPoints, activeType, imgSize]
  );

  // --- Двойной клик = замыкаем ---
  const handleDblClick = useCallback(() => {
    if (currentPoints.length >= 3) {
      setZones((prev) => ({
        ...prev,
        [activeType]: [...prev[activeType], [...currentPoints]],
      }));
      setCurrentPoints([]);
    }
  }, [currentPoints, activeType]);

  // --- Правый клик = удаление последней точки ---
  const handleRightClick = useCallback(
    (e) => {
      e.preventDefault();
      if (currentPoints.length > 0) {
        setCurrentPoints((prev) => prev.slice(0, -1));
      }
    },
    [currentPoints]
  );

  // --- Удалить полигон ---
  const deleteZone = useCallback((type, index) => {
    setZones((prev) => ({
      ...prev,
      [type]: prev[type].filter((_, i) => i !== index),
    }));
  }, []);

  // --- Сохранение на бэк ---
  const saveZones = useCallback(async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch(`${API}/camera-zones`, {
        method: "POST",
        headers: {"Content-Type": "application/json", Authorization: `Bearer ${window.accessToken || localStorage.getItem('access_token')}` },
        body: JSON.stringify({ name, zones }),
      });
      if (res.ok) setSaved(true);
    } catch (err) {
      alert("Ошибка сохранения: " + err.message);
    } finally {
      setSaving(false);
      setTimeout(() => setSaved(false), 2000);
    }
  }, [name, zones]);

  // --- Keyboard ---
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") {
        setCurrentPoints([]);
      }
      if (e.key === "z" && (e.ctrlKey || e.metaKey)) {
        setCurrentPoints((prev) => prev.slice(0, -1));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ───────────── RENDER ─────────────

  const activeZoneType = ZONE_TYPES.find((z) => z.key === activeType);

  return (
    <div style={styles.page}>
      {/* Хедер */}
      <div style={styles.header}>
        <button onClick={() => navigate(-1)} style={styles.backBtn}>
          ← Назад
        </button>
        <h1 style={styles.title}>
          <span style={styles.titleIcon}>📷</span> {name}
        </h1>
        <div style={styles.headerRight}>
          {!editorOpen ? (
            <button onClick={takeScreenshot} style={styles.screenshotBtn} disabled={!liveFrame}>
              ✂️ Скриншот → Редактор зон
            </button>
          ) : (
            <button onClick={() => setEditorOpen(false)} style={styles.closeBtnHeader}>
              ✕ Закрыть редактор
            </button>
          )}
        </div>
      </div>

      {/* Живой поток (если редактор закрыт) */}
      {!editorOpen && (
        <div style={styles.liveContainer}>
          {!liveFrame && (
            <div style={styles.loader}>
              <div style={styles.spinner} />
              <span style={{ color: "#aaa", marginTop: 12 }}>Подключение к камере...</span>
            </div>
          )}
          {liveFrame && (
            <img src={liveFrame} alt="Live" style={styles.liveImg} />
          )}

          {/* Оверлей сохранённых зон поверх live-потока */}
          {liveFrame && loaded && Object.values(zones).some((z) => z.length > 0) && (
            <div style={styles.liveOverlayInfo}>
              {ZONE_TYPES.map((zt) => {
                const count = (zones[zt.key] || []).length;
                if (count === 0) return null;
                return (
                  <span key={zt.key} style={{ ...styles.badge, borderColor: zt.stroke }}>
                    {zt.icon} {count}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Редактор зон */}
      {editorOpen && (
        <div style={styles.editorLayout}>
          {/* Левая панель: инструменты */}
          <div style={styles.toolPanel}>
            <div style={styles.toolSection}>
              <div style={styles.toolLabel}>Тип зоны</div>
              {ZONE_TYPES.map((zt) => (
                <button
                  key={zt.key}
                  onClick={() => {
                    setActiveType(zt.key);
                    setCurrentPoints([]);
                  }}
                  style={{
                    ...styles.toolBtn,
                    borderLeft: activeType === zt.key ? `4px solid ${zt.stroke}` : "4px solid transparent",
                    background: activeType === zt.key ? "rgba(255,255,255,0.08)" : "transparent",
                  }}
                >
                  <span style={styles.toolIcon}>{zt.icon}</span>
                  <span>{zt.label}</span>
                </button>
              ))}
            </div>

            <div style={styles.toolSection}>
              <div style={styles.toolLabel}>Подсказки</div>
              <div style={styles.hint}>
                <b>Клик</b> — добавить точку<br />
                <b>Клик на 1-ю точку</b> — замкнуть<br />
                <b>Двойной клик</b> — замкнуть<br />
                <b>ПКМ</b> — удалить последнюю точку<br />
                <b>Esc</b> — отменить полигон<br />
                <b>Ctrl+Z</b> — удалить точку
              </div>
            </div>

            {/* Список зон */}
            <div style={styles.toolSection}>
              <div style={styles.toolLabel}>Зоны</div>
              <div style={styles.zoneList}>
                {ZONE_TYPES.map((zt) =>
                  (zones[zt.key] || []).map((poly, idx) => (
                    <div
                      key={`${zt.key}-${idx}`}
                      style={{
                        ...styles.zoneItem,
                        borderLeft: `3px solid ${zt.stroke}`,
                        background:
                          hoveredZone?.type === zt.key && hoveredZone?.index === idx
                            ? "rgba(255,255,255,0.1)"
                            : "transparent",
                      }}
                      onMouseEnter={() => setHoveredZone({ type: zt.key, index: idx })}
                      onMouseLeave={() => setHoveredZone(null)}
                    >
                      <span>
                        {zt.icon} {zt.label} #{idx + 1}{" "}
                        <span style={{ color: "#888", fontSize: 11 }}>({poly.length} точек)</span>
                      </span>
                      <button
                        onClick={() => deleteZone(zt.key, idx)}
                        style={styles.deleteBtn}
                        title="Удалить зону"
                      >
                        ✕
                      </button>
                    </div>
                  ))
                )}
                {Object.values(zones).every((z) => z.length === 0) && (
                  <div style={{ color: "#666", fontSize: 13, padding: "8px 0" }}>
                    Зон пока нет. Нарисуйте полигон на изображении.
                  </div>
                )}
              </div>
            </div>

            {/* Сохранить */}
            <button onClick={saveZones} style={styles.saveBtn} disabled={saving}>
              {saving ? "Сохраняю..." : saved ? "✓ Сохранено!" : "💾 Сохранить зоны"}
            </button>
          </div>

          {/* Правая часть: изображение + canvas */}
          <div style={styles.canvasContainer}>
            <div style={styles.canvasWrapper}>
              <img
                ref={imgRef}
                src={screenshot}
                alt="Screenshot"
                style={styles.screenshotImg}
                draggable={false}
              />
              <canvas
                ref={canvasRef}
                style={styles.canvas}
                onClick={handleCanvasClick}
                onDoubleClick={handleDblClick}
                onContextMenu={handleRightClick}
              />
            </div>

            {/* Индикатор текущего инструмента */}
            <div style={{ ...styles.currentTool, borderColor: activeZoneType.stroke }}>
              {activeZoneType.icon} {activeZoneType.label}
              {currentPoints.length > 0 && (
                <span style={{ color: "#aaa", marginLeft: 8 }}>
                  ({currentPoints.length} точек)
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}

// ─────────── Стили ───────────

const styles = {
  page: {
    minHeight: "100vh",
    background: "#0c0c0f",
    color: "#e0e0e0",
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    padding: "12px 20px",
    background: "rgba(255,255,255,0.03)",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
  },
  backBtn: {
    background: "none",
    border: "1px solid rgba(255,255,255,0.15)",
    color: "#aaa",
    padding: "6px 14px",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 13,
  },
  title: {
    fontSize: 16,
    fontWeight: 500,
    color: "#fff",
    margin: 0,
    flex: 1,
  },
  titleIcon: { marginRight: 8 },
  headerRight: { display: "flex", gap: 8 },
  screenshotBtn: {
    background: "linear-gradient(135deg, #2980b9, #3498db)",
    border: "none",
    color: "#fff",
    padding: "8px 18px",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
  },
  closeBtnHeader: {
    background: "rgba(231, 76, 60, 0.15)",
    border: "1px solid rgba(231, 76, 60, 0.3)",
    color: "#e74c3c",
    padding: "8px 18px",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 13,
  },

  // Live
  liveContainer: {
    position: "relative",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "70vh",
    background: "#000",
  },
  liveImg: {
    maxWidth: "100%",
    maxHeight: "85vh",
    objectFit: "contain",
  },
  loader: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  spinner: {
    width: 40,
    height: 40,
    border: "4px solid #333",
    borderTop: "4px solid #3498db",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  liveOverlayInfo: {
    position: "absolute",
    top: 12,
    right: 12,
    display: "flex",
    gap: 6,
  },
  badge: {
    padding: "4px 10px",
    background: "rgba(0,0,0,0.7)",
    border: "1px solid",
    borderRadius: 4,
    fontSize: 13,
    color: "#fff",
  },

  // Editor layout
  editorLayout: {
    display: "flex",
    height: "calc(100vh - 52px)",
    animation: "fadeIn 0.3s ease",
  },
  toolPanel: {
    width: 260,
    minWidth: 260,
    background: "rgba(255,255,255,0.02)",
    borderRight: "1px solid rgba(255,255,255,0.06)",
    display: "flex",
    flexDirection: "column",
    padding: "12px 0",
    overflowY: "auto",
  },
  toolSection: {
    padding: "8px 14px",
    borderBottom: "1px solid rgba(255,255,255,0.04)",
  },
  toolLabel: {
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    color: "#666",
    marginBottom: 8,
    fontWeight: 600,
  },
  toolBtn: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    padding: "8px 10px",
    background: "transparent",
    border: "none",
    color: "#ccc",
    cursor: "pointer",
    fontSize: 13,
    borderRadius: 4,
    textAlign: "left",
    transition: "background 0.15s",
  },
  toolIcon: { fontSize: 18 },
  hint: {
    fontSize: 11,
    color: "#777",
    lineHeight: 1.7,
  },
  zoneList: {
    maxHeight: 200,
    overflowY: "auto",
  },
  zoneItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "6px 8px",
    fontSize: 12,
    borderRadius: 3,
    marginBottom: 2,
    transition: "background 0.1s",
    cursor: "default",
  },
  deleteBtn: {
    background: "none",
    border: "none",
    color: "#e74c3c",
    cursor: "pointer",
    fontSize: 14,
    padding: "2px 6px",
    borderRadius: 3,
  },
  saveBtn: {
    margin: "auto 14px 14px",
    padding: "10px 0",
    background: "linear-gradient(135deg, #27ae60, #2ecc71)",
    border: "none",
    color: "#fff",
    fontSize: 13,
    fontWeight: 600,
    borderRadius: 6,
    cursor: "pointer",
    transition: "opacity 0.2s",
  },

  // Canvas area
  canvasContainer: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    position: "relative",
    background: "#000",
    overflow: "hidden",
  },
  canvasWrapper: {
    position: "relative",
    maxWidth: "100%",
    maxHeight: "calc(100vh - 120px)",
  },
  screenshotImg: {
    maxWidth: "100%",
    maxHeight: "calc(100vh - 120px)",
    objectFit: "contain",
    display: "block",
    userSelect: "none",
  },
  canvas: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    cursor: "crosshair",
  },
  currentTool: {
    position: "absolute",
    bottom: 16,
    left: "50%",
    transform: "translateX(-50%)",
    padding: "6px 16px",
    background: "rgba(0,0,0,0.8)",
    border: "1px solid",
    borderRadius: 6,
    fontSize: 13,
    color: "#fff",
  },
};
