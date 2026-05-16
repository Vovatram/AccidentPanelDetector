import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";

const INCIDENT_TYPES = [
  "Стоянка в неположенном месте","ДТП","Превышение скорости",
  "Пешеход в неположенном месте","Затор","Движение по встречке","Сбитие пешехода",
];
const TYPE_COLORS = {
  "Стоянка в неположенном месте":"#ef4444",
  "ДТП":"#f97316",
  "Превышение скорости":"#eab308",
  "Пешеход в неположенном месте":"#22c55e",
  "Затор":"#3b82f6",
  "Движение по встречке":"#a855f7",
  "Сбитие пешехода":"#ec4899",
};
const STEP_OPTIONS = [
  {label:"5 мин", value:300,    cols:48},
  {label:"15 мин",value:900,    cols:48},
  {label:"1 час", value:3600,   cols:24},
  {label:"4 часа",value:14400,  cols:24},
  {label:"1 день",value:86400,  cols:30},
  {label:"1 нед", value:604800, cols:12},
];
const WS_RECONNECT_DELAY = 5000;

function toLocalISO(ts) {
  const d = new Date(ts);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0,16);
}

function Tooltip({bucket,cameras,types,x,y,visible}) {
  if (!visible||!bucket) return null;
  const total = cameras.reduce((s,c)=>s+types.reduce((ss,t)=>ss+(bucket.data[c]?.[t]||0),0),0);
  return (
    <div style={{position:"fixed",left:x+14,top:y-8,zIndex:200,pointerEvents:"none"}}
      className="bg-gray-900 border border-gray-600 rounded-lg shadow-2xl p-3 min-w-44 text-sm">
      <div className="font-bold text-white mb-1.5 border-b border-gray-700 pb-1 flex justify-between">
        <span>{bucket.label}</span>
        <span className="opacity-50 text-xs font-normal ml-3">всего: {total}</span>
      </div>
      {cameras.map(cam=>{
        const row=bucket.data[cam]||{};
        const ct=types.reduce((s,t)=>s+(row[t]||0),0);
        if (!ct) return null;
        return (
          <div key={cam} className="mb-1">
            {cameras.length>1&&<div className="text-gray-400 text-xs truncate">{cam}</div>}
            {types.map(t=>{
              const v=row[t]||0; if(!v) return null;
              return (
                <div key={t} className="flex items-center gap-2 pl-1">
                  <span style={{background:TYPE_COLORS[t]||"#888"}} className="w-2 h-2 rounded-sm shrink-0"/>
                  <span className="text-gray-300 text-xs flex-1 truncate">{t}</span>
                  <span className="text-white font-semibold text-xs">{v}</span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function StackedBar({bucket,cameras,types,maxVal,isSelected,onClick}) {
  if (!maxVal) return <div className="flex-1 h-full"/>;
  const segments = types
    .map(t=>({t,v:cameras.reduce((s,c)=>s+(bucket.data[c]?.[t]||0),0)}))
    .filter(x=>x.v>0);
  return (
    <div onClick={onClick}
      className={`flex-1 flex flex-col-reverse h-full cursor-pointer ${isSelected?"outline outline-2 outline-white outline-offset-[-2px]":""}`}
      style={{minWidth:0}}>
      {segments.map(({t,v})=>(
        <div key={t}
          style={{height:`${(v/maxVal)*100}%`,background:TYPE_COLORS[t]||"#888",
                  minHeight:2,transition:"height 0.25s ease"}}/>
      ))}
    </div>
  );
}

export default function Statistics() {
  const navigate = useNavigate();
  const {camera:urlCamera} = useParams();

  const wsRef          = useRef(null);
  const reconnTimerRef = useRef(null);

  const [allBuckets, setAllBuckets] = useState([]);
  const [cameras,    setCameras]    = useState([]);
  const [types,      setTypes]      = useState([]);
  const [allCams,    setAllCams]    = useState([]);
  const [wsStatus,   setWsStatus]   = useState("disconnected");
  const [loading,    setLoading]    = useState(false);

  const [selectedCamera, setSelectedCamera] = useState(urlCamera ? decodeURIComponent(urlCamera) : "");
  const [selectedTypes,  setSelectedTypes]  = useState([...INCIDENT_TYPES]);
  const [step,    setStep]    = useState(3600);
  const [cols,    setCols]    = useState(24);
  const [timeFrom, setTimeFrom] = useState(()=>{ const d=new Date(); d.setDate(d.getDate()-1); d.setHours(0,0,0,0); return toLocalISO(d); });
  const [showTypeFilter, setShowTypeFilter] = useState(false);
  const [pageStart, setPageStart] = useState(0);
  const [tooltip,   setTooltip]   = useState({visible:false,bucket:null,x:0,y:0});
  const [selectedBucket, setSelectedBucket] = useState(null);

  const pageBuckets = useMemo(()=>allBuckets.slice(pageStart,pageStart+cols),[allBuckets,pageStart,cols]);
  const totalPages  = Math.ceil(allBuckets.length/cols);
  const currentPage = Math.floor(pageStart/cols);

  const maxVal = useMemo(()=>
    pageBuckets.reduce((m,b)=>{
      const s=cameras.reduce((cs,c)=>cs+types.reduce((ts,t)=>ts+(b.data[c]?.[t]||0),0),0);
      return Math.max(m,s);
    },0),[pageBuckets,cameras,types]);

  const typeTotals = useMemo(()=>
    types.reduce((acc,t)=>{
      acc[t]=allBuckets.reduce((s,b)=>s+cameras.reduce((cs,c)=>cs+(b.data[c]?.[t]||0),0),0);
      return acc;
    },{}),[allBuckets,cameras,types]);

  useEffect(()=>{
    fetch("/stats/cameras").then(r=>r.json()).then(d=>setAllCams(d)).catch(()=>{});
  },[]);

  const buildParams = useCallback(()=>{
    const from = new Date(timeFrom);
    return {
      camera:    selectedCamera || null,   // "" → null на бэке через  `or None`
      types:     selectedTypes.length===INCIDENT_TYPES.length?null:selectedTypes,
      step,
      time_from: from.toISOString(),
      // time_to бэк высчитывает сам (step * 300 бакетов)
    };
  },[selectedCamera,selectedTypes,step,cols,timeFrom]);

  const connect = useCallback(()=>{
    clearTimeout(reconnTimerRef.current);
    if (wsRef.current) { wsRef.current.onclose=null; wsRef.current.close(); }
    setLoading(true); setWsStatus("connecting");
    const ws = new WebSocket("ws://localhost:8000/ws/stats");
    wsRef.current = ws;
    ws.onopen = ()=>{ setWsStatus("connected"); ws.send(JSON.stringify(buildParams())); };
    ws.onmessage = event=>{
      try {
        const msg=JSON.parse(event.data);
        if (msg.type==="stats") {
          setAllBuckets(msg.buckets||[]);
          setCameras(msg.cameras||[]);
          setTypes(msg.types||[]);
          setPageStart(0); setSelectedBucket(null); setLoading(false);
        }
      } catch {}
    };
    ws.onerror = ()=>{ setWsStatus("error"); setLoading(false); };
    ws.onclose = ()=>{
      setWsStatus("disconnected"); setLoading(false);
      reconnTimerRef.current = setTimeout(connect, WS_RECONNECT_DELAY);
    };
  },[buildParams]);

  useEffect(()=>{
    connect();
    return ()=>{ clearTimeout(reconnTimerRef.current); if(wsRef.current){wsRef.current.onclose=null;wsRef.current.close();} };
  },[selectedCamera,selectedTypes,step,cols,timeFrom]);

  const handleStepChange = val=>{
    const opt=STEP_OPTIONS.find(o=>o.value===val)||STEP_OPTIONS[2];
    setStep(opt.value); setCols(opt.cols); setPageStart(0);
  };
  const goPage = n=>{ const nx=Math.max(0,Math.min(totalPages-1,n)); setPageStart(nx*cols); setSelectedBucket(null); };
  const yTicks = [4,3,2,1,0].map(i=>Math.round(maxVal*i/4));

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col select-none">
      {/* Шапка */}
      <div className="bg-gray-800 border-b border-gray-700 px-4 py-2 flex items-center gap-3 flex-wrap">
        <button onClick={()=>navigate(-1)}
          className="w-9 h-9 rounded-full bg-gray-700 hover:bg-gray-600 flex items-center justify-center text-lg shrink-0">←</button>
        <h1 className="text-sm font-bold shrink-0">📊 Статистика</h1>

        <select value={selectedCamera} onChange={e=>{setSelectedCamera(e.target.value);setPageStart(0);}}
          className="px-2 py-1.5 rounded bg-gray-700 border border-gray-600 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="">Все камеры</option>
          {allCams.map(c=><option key={c} value={c}>{c}</option>)}
        </select>

        <div className="relative">
          <button onClick={()=>setShowTypeFilter(p=>!p)}
            className={`px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 border text-sm ${showTypeFilter?"border-indigo-500":"border-gray-600"}`}>
            Типы ({selectedTypes.length}/{INCIDENT_TYPES.length}) ▾
          </button>
          {showTypeFilter&&(
            <div className="absolute top-full mt-1 left-0 z-50 bg-gray-800 border border-gray-600 rounded-lg shadow-2xl p-3 w-72"
                 onMouseLeave={()=>setShowTypeFilter(false)}>
              <div className="flex gap-3 mb-2">
                <button onClick={()=>setSelectedTypes([...INCIDENT_TYPES])} className="text-xs text-indigo-400">Все</button>
                <button onClick={()=>setSelectedTypes([])} className="text-xs text-gray-400">Снять</button>
              </div>
              {INCIDENT_TYPES.map(t=>(
                <label key={t} className="flex items-center gap-2 text-sm hover:bg-gray-700 px-2 py-1 rounded cursor-pointer">
                  <input type="checkbox" checked={selectedTypes.includes(t)}
                    onChange={()=>setSelectedTypes(prev=>prev.includes(t)?prev.filter(x=>x!==t):[...prev,t])}
                    className="accent-indigo-500"/>
                  <span style={{background:TYPE_COLORS[t]||"#888"}} className="w-2 h-2 rounded-sm shrink-0"/>
                  <span>{t}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <select value={step} onChange={e=>handleStepChange(Number(e.target.value))}
          className="px-2 py-1.5 rounded bg-gray-700 border border-gray-600 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
          {STEP_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <div className="flex items-center gap-2">
          <span className="text-xs opacity-50 shrink-0">С:</span>
          <input type="datetime-local" value={timeFrom} onChange={e=>{setTimeFrom(e.target.value);setPageStart(0);}}
            className="px-2 py-1 rounded bg-gray-700 border border-gray-600 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
        </div>

        <div className="flex items-center gap-1.5 ml-auto">
          {loading&&<span className="text-xs opacity-50 animate-pulse">загрузка...</span>}
          <div className={`w-2 h-2 rounded-full ${wsStatus==="connected"?"bg-green-500":wsStatus==="connecting"?"bg-yellow-500 animate-pulse":"bg-red-500"}`}/>
          <span className="text-xs opacity-50">{wsStatus==="connected"?"live":wsStatus==="connecting"?"подкл.":"офлайн"}</span>
        </div>
      </div>

      {/* Пагинация */}
      {totalPages>1&&(
        <div className="flex items-center gap-2 px-4 py-2 bg-gray-800 border-b border-gray-700 text-sm">
          <button onClick={()=>goPage(0)} disabled={currentPage===0} className="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-30">⟨⟨</button>
          <button onClick={()=>goPage(currentPage-1)} disabled={currentPage===0} className="px-3 py-1 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-30">← Prev</button>
          <span className="opacity-60 mx-1 text-xs">{currentPage+1} / {totalPages}</span>
          <button onClick={()=>goPage(currentPage+1)} disabled={currentPage>=totalPages-1} className="px-3 py-1 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-30">Next →</button>
          <button onClick={()=>goPage(totalPages-1)} disabled={currentPage>=totalPages-1} className="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-30">⟩⟩</button>
          <span className="text-xs opacity-40 ml-1">{pageStart+1}–{Math.min(pageStart+cols,allBuckets.length)} из {allBuckets.length}</span>
        </div>
      )}

      {/* График */}
      <div className="flex-1 flex flex-col p-4 min-h-0 overflow-hidden">
        {loading&&allBuckets.length===0?(
          <div className="flex-1 flex items-center justify-center opacity-50">
            <div className="text-center"><div className="text-4xl mb-3">📊</div><p>Загрузка...</p></div>
          </div>
        ):allBuckets.length===0?(
          <div className="flex-1 flex items-center justify-center opacity-50">
            <div className="text-center"><div className="text-4xl mb-3">🔍</div><p>Нет данных</p></div>
          </div>
        ):(
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex flex-1 min-h-0 gap-0">
              {/* Y-ось */}
              <div className="flex flex-col justify-between text-right pr-2 py-0.5 shrink-0 w-10">
                {yTicks.map((v,i)=><span key={i} className="text-xs text-gray-500 leading-none">{v}</span>)}
              </div>
              {/* Бары */}
              <div className="flex-1 relative min-w-0">
                <div className="absolute inset-0 flex flex-col justify-between pointer-events-none z-0">
                  {[0,1,2,3,4].map(i=><div key={i} className="border-t border-gray-700 w-full"/>)}
                </div>
                <div className="flex items-end h-full relative z-10"
                     onMouseLeave={()=>setTooltip(t=>({...t,visible:false}))}>
                  {pageBuckets.map((bucket,i)=>(
                    <div key={i} className="flex-1 h-full flex flex-col justify-end" style={{minWidth:0,maxWidth:`${100/cols}%`}}
                      onMouseEnter={e=>setTooltip({visible:true,bucket,x:e.clientX,y:e.clientY})}
                      onMouseMove={e=>setTooltip(t=>({...t,x:e.clientX,y:e.clientY}))}
                      onClick={()=>setSelectedBucket(prev=>prev===i?null:i)}>
                      <StackedBar bucket={bucket} cameras={cameras} types={types} maxVal={maxVal} isSelected={selectedBucket===i}/>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {/* X-метки */}
            <div className="flex ml-10 mt-1 overflow-hidden">
              {pageBuckets.map((b,i)=>(
                <div key={i} className="flex-1 text-center overflow-hidden" style={{maxWidth:`${100/cols}%`}}>
                  <span className="text-gray-500" style={{fontSize:Math.min(10,Math.max(6,480/cols))}}>{b.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Детали бакета */}
      {selectedBucket!==null&&pageBuckets[selectedBucket]&&(
        <div className="mx-4 mb-2 p-3 bg-gray-800 rounded-lg border border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-sm">⏱ {pageBuckets[selectedBucket].label}</span>
            <button onClick={()=>setSelectedBucket(null)} className="text-gray-400 hover:text-white">✕</button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {cameras.map(cam=>{
              const d=pageBuckets[selectedBucket].data[cam]||{};
              const ct=types.reduce((s,t)=>s+(d[t]||0),0);
              if (!ct) return null;
              return (
                <div key={cam} className="bg-gray-700 rounded p-2">
                  <div className="text-xs text-gray-400 truncate mb-1">{cam}</div>
                  {types.map(t=>{const v=d[t]||0;if(!v)return null;return(
                    <div key={t} className="flex items-center gap-1.5 text-xs">
                      <span style={{background:TYPE_COLORS[t]||"#888"}} className="w-2 h-2 rounded-sm shrink-0"/>
                      <span className="truncate flex-1 opacity-80">{t}</span>
                      <span className="font-bold">{v}</span>
                    </div>
                  );})}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Легенда */}
      {types.length>0&&(
        <div className="px-4 pb-3 flex flex-wrap gap-x-4 gap-y-1.5">
          {types.map(t=>(
            <label key={t} className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input type="checkbox" checked={selectedTypes.includes(t)}
                onChange={()=>setSelectedTypes(prev=>prev.includes(t)?prev.filter(x=>x!==t):[...prev,t])}
                style={{accentColor:TYPE_COLORS[t]}} className="w-3 h-3"/>
              <span style={{color:TYPE_COLORS[t]||"#fff"}} className="font-medium">{t}</span>
              <span className="text-gray-500">({typeTotals[t]||0})</span>
            </label>
          ))}
        </div>
      )}

      <Tooltip {...tooltip} cameras={cameras} types={types}/>
      <style>{`input[type="datetime-local"]::-webkit-calendar-picker-indicator{filter:invert(0.7)}`}</style>
    </div>
  );
}