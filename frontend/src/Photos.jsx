import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import useTheme from './useTheme';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const INCIDENT_TYPES = [
  'Стоянка в неположенном месте', 'ДТП', 'Превышение скорости',
  'Пешеход в неположенном месте', 'Затор', 'Движение по встречке', 'Сбитие пешехода',
];

const EVENT_COLORS = {
  'ДТП':                           '#ef4444',
  'Сбитие пешехода':               '#ef4444',
  'Стоянка в неположенном месте':  '#f59e0b',
  'Превышение скорости':           '#facc15',
  'Затор':                         '#f97316',
  'Пешеход в неположенном месте':  '#3b82f6',
  'Движение по встречке':          '#a855f7',
};

const TIME_OPTIONS = [
  { label: '1 час',   value: 3600 },
  { label: '6 часов', value: 21600 },
  { label: '24 часа', value: 86400 },
  { label: '7 дней',  value: 604800 },
  { label: '30 дней', value: 2592000 },
  { label: 'Всё',     value: 0 },
];

const PAGE_SIZE_OPTIONS = [12, 24, 48];

const sevColor = s =>
  s === 0 ? '#6b7280' :
  s >= 4  ? '#ef4444' :
  s >= 3  ? '#f97316' : '#eab308';

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function Photos() {
  const [theme, setTheme] = useTheme();
  const D = theme === 'dark';
  const navigate = useNavigate();

  const [allCameras,   setAllCameras]   = useState([]);
  const [selCameras,   setSelCameras]   = useState([]);
  const [selTypes,     setSelTypes]     = useState([...INCIDENT_TYPES]);
  const [timeRange,    setTimeRange]    = useState(86400);
  const [pageSize,     setPageSize]     = useState(12);
  const [page,         setPage]         = useState(1);
  const [incidents,    setIncidents]    = useState([]);
  const [total,        setTotal]        = useState(0);
  const [loading,      setLoading]      = useState(false);
  const [camSearch,    setCamSearch]    = useState('');
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [hasMistakes,  setHasMistakes]  = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (token) {
      try {
        const email = JSON.parse(atob(token.split('.')[1])).sub;
        fetch(`${API}/superadmins`)
          .then(r => r.json())
          .then(admins => { if (admins.includes(email)) setIsSuperAdmin(true); })
          .catch(() => {});
      } catch {}
    }
  }, []);

  useEffect(() => {
    fetch(`${API}/cameras`)
      .then(r => r.json())
      .then(d => {
        const keys = Object.keys(d);
        setAllCameras(keys);
        setSelCameras(keys);
      }).catch(() => {});
  }, []);

  const fetchPhotos = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (selCameras.length) params.set('cameras', selCameras.join(','));
    if (selTypes.length)   params.set('types',   selTypes.join(','));
    if (timeRange > 0)     params.set('time_from', new Date(Date.now() - timeRange * 1000).toISOString());
    params.set('page',      String(page));
    params.set('page_size', String(pageSize));
    params.set('has_photo', 'true');
    if (hasMistakes) params.set('has_mistakes', 'true');

    fetch(`${API}/incidents/feed?${params}`)
      .then(r => r.json())
      .then(d => { setIncidents(d.items || []); setTotal(d.total || 0); })
      .catch(() => { setIncidents([]); setTotal(0); })
      .finally(() => setLoading(false));
  }, [selCameras, selTypes, timeRange, page, pageSize, hasMistakes]);

  useEffect(() => { fetchPhotos(); }, [fetchPhotos]);

  useEffect(() => { setPage(1); }, [selCameras, selTypes, timeRange, pageSize, hasMistakes]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const toggleCamera = cam => setSelCameras(p =>
    p.includes(cam) ? p.filter(c => c !== cam) : [...p, cam]
  );
  const toggleType = t => setSelTypes(p =>
    p.includes(t) ? p.filter(x => x !== t) : [...p, t]
  );

  const visibleCameras = camSearch
    ? allCameras.filter(c => c.toLowerCase().includes(camSearch.toLowerCase()))
    : allCameras;

  const sb = {
    width: '100%', padding: '5px 9px', borderRadius: 7, fontSize: 12,
    background: D ? '#2a2a2a' : '#f0f0f0', color: D ? '#fff' : '#111',
    border: `1px solid ${D ? '#444' : '#ddd'}`, boxSizing: 'border-box', outline: 'none',
  };

  const btnBase = (active) => ({
    padding: '4px 9px', borderRadius: 6, fontSize: 11, border: 'none', cursor: 'pointer',
    background: active ? '#6366f1' : (D ? '#2a2a2a' : '#e5e7eb'),
    color: active ? '#fff' : (D ? '#ccc' : '#444'),
    fontWeight: active ? 700 : 400,
  });

  const pagBtn = (disabled) => ({
    padding: '6px 12px', borderRadius: 8, fontSize: 13,
    border: `1px solid ${D ? '#444' : '#ddd'}`,
    background: D ? '#2a2a2a' : '#fff', color: D ? '#fff' : '#111',
    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1,
  });

  const pageNums = (() => {
    const start = Math.max(1, Math.min(page - 2, totalPages - 4));
    return Array.from({ length: Math.min(5, totalPages) }, (_, i) => start + i).filter(p => p >= 1 && p <= totalPages);
  })();

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: D ? '#111' : '#f3f4f6', color: D ? '#fff' : '#111', fontFamily: 'Inter, sans-serif' }}>

      {/* ── Sidebar ── */}
      <div style={{
        width: 240, flexShrink: 0, background: D ? '#1a1a1a' : '#fff',
        borderRight: `1px solid ${D ? '#333' : '#e5e7eb'}`,
        padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 18,
        overflowY: 'auto', position: 'sticky', top: 0, height: '100vh', boxSizing: 'border-box',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => navigate('/')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: D ? '#aaa' : '#666', fontSize: 20, padding: 0, lineHeight: 1 }}>←</button>
            <span style={{ fontWeight: 700, fontSize: 15 }}>📷 Фото</span>
          </div>
          <button onClick={() => setTheme(D ? 'light' : 'dark')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, padding: 0 }}>
            {D ? '🌙' : '☀️'}
          </button>
        </div>

        {/* Time range */}
        <div>
          <div style={{ fontSize: 11, opacity: 0.5, marginBottom: 7 }}>Период</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {TIME_OPTIONS.map(o => (
              <button key={o.value} onClick={() => setTimeRange(o.value)} style={btnBase(timeRange === o.value)}>
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* Page size */}
        <div>
          <div style={{ fontSize: 11, opacity: 0.5, marginBottom: 7 }}>На странице</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {PAGE_SIZE_OPTIONS.map(n => (
              <button key={n} onClick={() => setPageSize(n)} style={{ ...btnBase(pageSize === n), flex: 1, padding: '4px 0' }}>
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Mistakes filter — superadmin only */}
        {isSuperAdmin && (
          <div style={{
            padding: '10px 12px', borderRadius: 8,
            background: hasMistakes ? (D ? '#3b1f1f' : '#fef2f2') : (D ? '#2a2a2a' : '#f9fafb'),
            border: `1px solid ${hasMistakes ? '#ef4444' : (D ? '#444' : '#e5e7eb')}`,
          }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={hasMistakes}
                onChange={e => setHasMistakes(e.target.checked)}
                style={{ width: 15, height: 15, accentColor: '#ef4444', flexShrink: 0 }}
              />
              <span style={{ fontSize: 13, fontWeight: 600, color: hasMistakes ? '#ef4444' : (D ? '#ddd' : '#374151') }}>
                ⚠ Только с жалобами
              </span>
            </label>
          </div>
        )}

        {/* Cameras */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
            <span style={{ fontSize: 11, opacity: 0.5 }}>Камеры</span>
            <button onClick={() => setSelCameras(selCameras.length === allCameras.length ? [] : [...allCameras])}
              style={{ fontSize: 10, color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              {selCameras.length === allCameras.length ? 'Снять все' : 'Все'}
            </button>
          </div>
          <input placeholder="Поиск..." value={camSearch} onChange={e => setCamSearch(e.target.value)}
            style={{ ...sb, marginBottom: 7 }} />
          <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
            {visibleCameras.map(cam => (
              <label key={cam} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', fontSize: 12 }}>
                <input type="checkbox" checked={selCameras.includes(cam)} onChange={() => toggleCamera(cam)}
                  style={{ marginTop: 2, flexShrink: 0 }} />
                <span style={{ color: D ? '#ddd' : '#333', lineHeight: 1.35 }}>{cam}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Incident types */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
            <span style={{ fontSize: 11, opacity: 0.5 }}>Типы инцидентов</span>
            <button onClick={() => setSelTypes(selTypes.length === INCIDENT_TYPES.length ? [] : [...INCIDENT_TYPES])}
              style={{ fontSize: 10, color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              {selTypes.length === INCIDENT_TYPES.length ? 'Снять все' : 'Все'}
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {INCIDENT_TYPES.map(t => (
              <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12 }}>
                <input type="checkbox" checked={selTypes.includes(t)} onChange={() => toggleType(t)} />
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: EVENT_COLORS[t] || '#888', flexShrink: 0 }} />
                <span style={{ color: D ? '#ddd' : '#333' }}>{t}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* ── Main ── */}
      <div style={{ flex: 1, padding: '20px 24px', display: 'flex', flexDirection: 'column', minHeight: '100vh', boxSizing: 'border-box' }}>
        {/* Stats bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <span style={{ fontSize: 13, opacity: 0.55 }}>
            {loading ? 'Загрузка...' : `Найдено: ${total} фото`}
          </span>
          <span style={{ fontSize: 13, opacity: 0.55 }}>Стр. {page} из {totalPages}</span>
        </div>

        {/* Grid */}
        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.4, fontSize: 14 }}>
            Загрузка...
          </div>
        ) : incidents.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.4, fontSize: 14 }}>
            Нет фотографий за выбранный период
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, flex: 1, alignContent: 'start' }}>
            {incidents.map(inc => (
              <PhotoCard key={inc.id} inc={inc} D={D} navigate={navigate} />
            ))}
          </div>
        )}

        {/* Pagination */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, paddingTop: 28 }}>
          <button onClick={() => setPage(1)} disabled={page === 1} style={pagBtn(page === 1)}>«</button>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={pagBtn(page === 1)}>‹</button>
          {pageNums.map(p => (
            <button key={p} onClick={() => setPage(p)}
              style={{ ...pagBtn(false), background: p === page ? '#6366f1' : (D ? '#2a2a2a' : '#fff'), color: p === page ? '#fff' : (D ? '#fff' : '#111'), fontWeight: p === page ? 700 : 400 }}>
              {p}
            </button>
          ))}
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={pagBtn(page === totalPages)}>›</button>
          <button onClick={() => setPage(totalPages)} disabled={page === totalPages} style={pagBtn(page === totalPages)}>»</button>
        </div>
      </div>
    </div>
  );
}

function PhotoCard({ inc, D, navigate }) {
  const color = EVENT_COLORS[inc.notification_text] || '#888';

  return (
    <div
      onClick={() => navigate(`/incident/${inc.id}`)}
      style={{
        background: D ? '#1e1e1e' : '#fff',
        borderRadius: 12, overflow: 'hidden', cursor: 'pointer',
        border: `1px solid ${D ? '#2d2d2d' : '#e5e7eb'}`,
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        transition: 'transform 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.18)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)'; }}
    >
      {/* Photo */}
      <div style={{ position: 'relative', height: 180, background: '#000' }}>
        <img
          src={`${API}/incidents/photo/${inc.screenshot_name}`}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          onError={e => { e.currentTarget.parentElement.style.background = D ? '#1e1e1e' : '#f0f0f0'; e.currentTarget.style.display = 'none'; }}
        />
        {/* Type badge */}
        <div style={{
          position: 'absolute', top: 8, left: 8,
          background: color, color: '#fff',
          padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700,
          maxWidth: 'calc(100% - 16px)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {inc.notification_text}
        </div>
        {/* Severity */}
        {inc.severity > 0 && (
          <div style={{
            position: 'absolute', top: 8, right: 8,
            background: sevColor(inc.severity), color: '#fff',
            padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700,
          }}>
            {inc.severity}★
          </div>
        )}
      </div>

      {/* Details */}
      <div style={{ padding: '10px 12px', borderTop: `2px solid ${color}` }}>
        <div style={{
          fontWeight: 600, fontSize: 13, marginBottom: 3,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          color: D ? '#f0f0f0' : '#111',
        }}>
          {inc.camera}
        </div>
        <div style={{ fontSize: 11, color: D ? '#777' : '#9ca3af' }}>
          {fmtDate(inc.date)}
        </div>
        {inc.mistake && inc.mistake.length > 0 && (
          <div style={{ fontSize: 10, color: '#f87171', marginTop: 4 }}>
            ⚠ {inc.mistake.length} {inc.mistake.length === 1 ? 'жалоба' : 'жалобы'}
          </div>
        )}
      </div>
    </div>
  );
}
