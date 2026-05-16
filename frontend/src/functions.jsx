

export function deleteRout(Rout, i) {
  let newRout = [...Rout]
  let Id = newRout[i].id
  while (typeof newRout[i] === 'number' || typeof newRout[i] === 'object' && newRout[i].id === Id) {
    if (typeof newRout[i] === 'object' && newRout[i].id === -1) { newRout.splice(i, 2); break }
  newRout.splice(i, 1);}
  return newRout

}

export function isValidDate(str) {
  const date = new Date(str);
  return !isNaN(date.getTime());
}

export function MaxIdRout(Rout) {
  
  let Arr = [0]
  for (let i = 0; i < Rout.length; i++) {
    if (typeof Rout[i] === 'object') { Arr.splice(0, 0, Rout[i].id) }
  }
  Arr.sort(function(a, b){return b - a})
  return N(Arr)[0]
}
export function MaxIndRoutL(Rout) {
  let Arr = [0]
  for (let i = 0; i < Rout.length; i++) {
    if (typeof Rout[i] === 'object') { Arr.splice(0, 0, Rout[i].ind) }}
  return Math.max.apply(null, Arr)
}

export function MaxIndRout(data, Rout) { 
  let Max = 0
  let L = data.Directs[Rout[0].direct].routs[Rout[0].name].routs[0]

  while (true){
    Max = Math.max(MaxIndRoutL(L.rout), Max)
    if (String(L.svzD) === 'undefined'){break}
    L = data.Directs[L.svzD].routs[L.svzB].routs[0]
  }
  L = FindNameRoutO(data, Rout[0].direct, Rout[0].name)


  while (L != false){
    Max = Math.max(MaxIndRoutL(L.rout), Max)
    L = FindNameRoutO(data, L.direct, L.base)
  }
  return Max
}

export function FindLostIndexL(data, Rout, S, F){
  let LO = data.Directs[Rout.direct].routs[Rout.name].routs[0]
  
  if (String(LO.svzB) === 'undefined'){
    return ['undefined']
  }else{
    let SO = data.Directs[LO.svzD].routs[LO.svzB].routs[0]
    let SOR = SO.rout.filter((elm) => typeof elm === 'object')
    
    let SOI = SO.rout.filter((elm) => typeof elm === 'object').map(elm => elm.ind)
    let LOI = LO.rout.filter((elm) => typeof elm === 'object').map(elm => elm.ind)
    
    if (SOI.includes(S) & SOI.includes(F)){
      let RS = []
      for (let i = SOI.indexOf(S); i < SOI.indexOf(F) - 1; i ++){
         RS.push.apply(RS, FindLostIndexL(data, SO, SOI[i], SOI[i+1]))
         if(!LOI.includes(SOI[i+1])){
          RS.push.apply(RS, [SOR[i+1].name])}
      }
      return RS
    }else{return ['undefined']}
  }

}

export function isMobileOrNarrow() {
  // Проверяем несколько признаков одновременно
  const isSmallScreen = window.matchMedia("(max-width: 700px)").matches;
  const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  const userAgent = navigator.userAgent.toLowerCase();

  const isMobileUA = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);

  // Основная логика
  return isSmallScreen || (isTouchDevice && isMobileUA && 0);
}

export function FindLostIndex(data, direct, base, name, S, F){

  //let LO = data.Directs[direct].routs[base].routs[0]
  let LD = FindNameTrain(data, direct, name) 
  let LO = {name: base, direct : direct, rout : data['Vehicle'][LD[0]].routs[LD[1]].rout}

  if (F === -1){F = LO.rout.length}
  let Lst = []
  let Ost = []


  let L = LO.rout.slice(S, F + 1).filter((elm) => typeof elm === 'object')
  
  L.some((elm) => {if(elm.status === 'Отменен'){Lst.splice(Lst.length, 0, elm.name)}else{Ost.splice(Ost.splice,0, elm.name)}})
  //L = FindNameTrain(data, direct, name).slice(S, F).filter((elm) => typeof elm === 'object').filter((elm) => elm.stat !== 'Отменен')

  for (let i = 0; i < L.length;i ++){
    if (i < L.length-1){
      Lst.push.apply(Lst, FindLostIndexL(data, LO, L[i].ind,L[i+1].ind))}
  }
  
  Lst = Lst.filter((elem) => elem != 'undefined')
     
  if (Lst.length === 0){return 'Со всеми остановками'}
  else if (Ost.length < Lst.length){
    return 'С остановками: ' + Ost.join(', ')
  }else{return 'Со всеми остановками КРОМЕ: ' + Lst.join(', ')}
}
export function NameTrain(data, direct, name, currentRout){
  let LD = Object.entries(data.Vehicle).reduce((acc, [key, value]) => {value.routs.forEach((route) => {if (typeof route === 'object' && route.direct === direct){acc.splice(0,0,route.name)};});return acc;}, [])
  currentRout.some(elm => {if (typeof elm === 'object' && elm.direct === direct){LD.splice(0,0, elm.name)}})
  console.log(JS(currentRout))
  if (LD.includes(name)){
  let n = 1
  while (LD.includes(name + ' (' + n + ')' )){
    n += 1
  }name += ' (' + n + ')'}
  return name
  }
export function FindNameTrain(data, direct, name){
  let LD = Object.entries(data.Vehicle).reduce((acc, [key, value]) => {let time = new Date(value.time); value.routs.forEach((route, ind) => {if (typeof route === 'object' && route.direct === direct && route.name === name){acc.push.apply(acc, [key, ind, time])} if (typeof route === 'object'){time = new Date(time.getTime() + routTime(route.rout) * 1000)}else{time = new Date(time.getTime() + route * 1000)}});return acc;}, [])

  if (LD.length != 0){
  return LD}
  return false
}

export function FindNameRout(data, direct, name){
  let LD = Object.entries(data.Directs).reduce((acc, [key, value]) => {Object.entries(value.routs).forEach(([key, routs], ind) => { if (routs.routs[0].direct === direct && routs.routs[0].name === name){acc.push.apply(acc, [routs.routs[0].direct === direct && routs.routs[0].name])}});return acc;}, [])

  if (LD.length != 0){
  return LD}
  return false
}

export function FindNameRoutO(data, direct, name){
  let LD = Object.entries(data.Directs).reduce((acc, [key, value]) => {Object.entries(value.routs).forEach(([key, routs], ind) => { if (routs.routs[0].svzD === direct && routs.routs[0].svzB === name){acc.push.apply(acc, [routs.routs[0]])}});return acc;}, [])
  if (LD.length != 0){
  return LD[0]}
  return false
}

export function secondsToTime3(A) {
  if (A < 60) {
    return `${A} с.`
  }else {
    return `${Math.floor(A / 60)} мин. ${A % 60} c. `
}}

export const GetTime = (time) => {
  try{return time.getTime()}catch{return 0}
}

export function calculateDelay(time1, time2) {
  return Math.floor((time2.getTime() - time1.getTime()) / 1000)
}
export function timeToTime(time) {
  return time.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}
export function secondsToTime(seconds) {
  if (typeof seconds !== 'number' || seconds < 0) {
    return '00:00:00';
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function secondsToTime2(time) {
  let A = new Date()
  A.setTime(time)
  return timeToTime(A)
}

export function N(A) {
  return structuredClone(A)
}
export const routTime = (rout) => {
  let time0 = 0
  for (let i = 0; i < rout.length; i++) {
    if (typeof rout[i] !== 'number') {
      time0 += rout[i].stop
    } else { time0 += rout[i] }
  } return time0
}
export const routsTime = (routs) => {
  let time0 = 0
  for (let i = 0; i < routs.length; i++) {
    if (typeof routs[i] !== 'number') {
      time0 += routTime(routs[i].rout)
    } else { time0 += routs[i] }
  } return time0
}
export function timeToSeconds(date) {
  return Math.floor(date.getTime() / 1000);
}

export const handle = (param, tip, status) => {
  if (String(param[tip]) !== 'undefined' ){
    if (status === 'dark')
      param[tip] = 'light'
    else{param[tip] = 'dark'}
  }else{param[tip] = 'dark'}
  };

export const otheme = (theme) => {
   if (String(theme) === 'undefined'){return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'}
   if (theme != 'auto'){return theme}
}
export function ChRout(setData, Rout) {
  if (!Rout.length) return;

  const { direct, base, rout } = Rout[0];
  console.log(direct, base, rout )

  setData(prev => ({
    ...prev,
    Vehicle: Object.fromEntries(
      Object.entries(prev.Vehicle).map(([k, v]) => [k, {
        ...v,
        routs: v.routs.map(r =>
          typeof r === 'object' && r.direct === direct && r.base === base
            ? { ...r, rout: N(rout) }
            : r
        ),
      }])
    ),
    Schedule: Object.fromEntries(
      Object.entries(prev.Schedule).map(([k, v]) => [k, {
        ...v,
        routs: v.routs.map(r =>
          typeof r === 'object' && r.direct === direct && r.base === base
            ? { ...r, rout: N(rout) }
            : r
        ),
      }])
    ),
  }));
}

export function ChRoutName(setData, name, dt, nap) {
  setData(prev => {
    const updateRouts = (routs) => {
      console.log('!!!!!!!!!', routs, name, dt, nap);
      let F = 0
      return name === '~D~E!E!E~L~'
        ? routs.filter((r, i, arr) => {
            if (typeof r === 'object' && r.direct === nap && r.base === dt) {F = 1; return false;}
            if (F === 1){F = 0; return false;}
            //const prev = arr[i - 1];
            //if (typeof prev === 'object' && prev.direct === nap && prev.base === dt) return false;
            return true;
          })
        : routs.map(r => {
          let newName
          if (typeof r === 'object'){
          const parts = r.name.split(' ');
          const firstWord = parts[0];

           newName = (!isNaN(firstWord) && firstWord.trim() !== '')
            ? `${firstWord} ${name}`
            : name;}
            return typeof r === 'object' && r.direct === nap && r.base === dt
              ? { ...r, base: name, name : newName}
              : r
    });
        }

    let newData = {
      ...prev,
      Vehicle: Object.fromEntries(
        Object.entries(prev.Vehicle).map(([k, v]) => [k, {
          ...v,
          routs: updateRouts(v.routs),
        }])
      ),
      Schedule: Object.fromEntries(
        Object.entries(prev.Schedule).map(([k, v]) => [k, {
          ...v,
          routs: updateRouts(v.routs),
        }])
      ),
    };

    // Обновление svzB через FindNameRoutO
     newData = immutableSvzB(newData, nap, dt, name);
     console.log(newData)

    return newData;
  });
}


// Вспомогательная — обновить svzB в нужном маршруте
function immutableSvzB(data, nap, dt, name) {
  const isDelete = name === '~D~E!E!E~L~';

  return {
    ...data,
    Directs: Object.fromEntries(
      Object.entries(data.Directs).map(([dk, dv]) => [dk, {
        ...dv,
        routs: Object.fromEntries(
          Object.entries(dv.routs || {}).map(([rk, rv]) => [rk, {
            ...rv,
            routs: rv.routs.map(r => {
              if (typeof r === 'object' && r.svzD === nap && r.svzB === dt) {
                if (isDelete) {
                  const { svzB, svzD, ...rest } = r;
                  return rest;
                }
                return { ...r, svzB: name };
              }
              return r;
            }),
          }])
        ),
      }])
    ),
  };
}
 

export function ChRoutName2(data, setData, name, dt, nap){
  for (let i =  Object.entries(data.Vehicle).length - 1; i >= 0; i--){
  for (let q = Object.entries(data.Vehicle)[i][1].routs.length - 1; q >= 0 ;q--){
  let v1 = data.Vehicle[Object.entries(data.Vehicle)[i][0]].routs[q]
  if  (typeof v1 === 'object' && v1.direct === nap && v1.base === dt){
    if (name === '~D~E!E!E~L~'){data.Vehicle[Object.entries(data.Vehicle)[i][0]].routs.splice(q,2)}
    else{v1.base = N(name)}
  }}}
  let L = FindNameRoutO(data, nap, dt)
  if (L != false){
    L.svzB = name
  }}

 export function linestations(data, FT) {
      console.log(new Date(FT.date).getTimezoneOffset() * 60000)
      FT.date2 = new Date(FT.date + 'T00:00:00Z').getTime() + new Date(FT.date).getTimezoneOffset() * 60000
      console.log(FT.date2)
     let TravelTrains = []
         for (let i = 0; i < Object.entries(data.Vehicle).length; i++){      
           let date = new Date(Object.entries(data.Vehicle)[i][1].time)
           if (date.getTime() < FT.date2 + (24 + 4) * 60 * 60 * 1000){
             for (let q = 0; q < Object.entries(data.Vehicle)[i][1].routs.length; q++){
              if (date.getTime() > FT.date2 + (24 + 4) * 60 * 60 * 1000){break}
                 let v1 = JSON.parse(JSON.stringify(Object.entries(data.Vehicle)[i][1].routs[q]))
                 if (typeof v1 === 'object'){
                   let LpoS = RtoS(v1.rout)
                   let A = LpoS[FT.from]
                   let B = LpoS[FT.to]
                   ///alert(JS([LpoS, v1, FT]))
                   if(A && B && A < B){
                     let maptime = timepind(date, N(v1.rout), [A, B])
                     console.log(maptime, FT.date, new Date(FT.date).getTime(), maptime.from.getTime(), FT.date2 + (24 + 4) * 60 * 60 * 1000)
                     if (FT.date2 <= maptime.from.getTime() + N(v1.rout[A]).delay * 1000 && maptime.from.getTime() + N(v1.rout[A]).delay * 1000 <= FT.date2 + 24 * 60 * 60 * 1000){
                     let from = N(v1.rout[A])
                     from.date = maptime.from
                     let to = N(v1.rout[B])
                     to.date = maptime.to
                     
                     TravelTrains.splice(0,0, {direct: v1.direct, name: v1.name, from : from, to : to, time : maptime.time, stationsonrout : FindLostIndex(data, v1.direct, v1.base, v1.name, A, B)}) 
                   }}
                   date = new Date(date.getTime() + routTime(v1.rout) * 1000);
                 }else{date = new Date(date.getTime() + v1 * 1000);}}}}
  console.log(TravelTrains)
  TravelTrains.sort((a, b) => a.from.delay + a.from.date.getTime()/1000 - b.from.delay - b.from.date.getTime()/1000)
   return TravelTrains}
 
 export function RtoS(Rout){
   let stations = {}
   for (let i in Rout){
     if(typeof Rout[i] === 'object'){
       stations[ Rout[i].name ] = Number(i)
     }
   }
   return stations
 }
 
 export function timepind(date, Rout, [A, B]){
   
   let maptime = {}
   let time = -1
   //AL([date, A, B, Rout])
   for (let i = 0; i <= B; i ++){
     if(typeof Rout[i] === 'object'){
       if(i === B){maptime.to = date; maptime.time = time}
       date = new Date(date.getTime() + Rout[i].stop * 1000)
       if(time !== -1){time += Rout[i].stop}
       if(i === A){maptime.from = date; time = 0}
     }else{
       date = new Date(date.getTime() + Rout[i] * 1000)
       if(time !== -1){time += Rout[i]}
     }
   }
 
   return maptime
 }
export  const OTV = (name, data) => {
    let B = data.Exteral.sensor
    let body = B[name]
    body.cd.map((elm) => {if(B[elm].cd.includes(name)){B[elm].cd.splice(B[elm].cd.indexOf(name),1)}
    if(B[elm].rd.includes(name)){B[elm].rd.splice(B[elm].rd.indexOf(name),1)}})
    body.rd.map((elm) => {if(B[elm].cd.includes(name)){B[elm].cd.splice(B[elm].cd.indexOf(name),1)}
    if(B[elm].rd.includes(name)){B[elm].rd.splice(B[elm].rd.indexOf(name),1)}})
    Object.entries(data.Exteral.receiver).map(([name1, bodyr]) => {if(bodyr.sensors && count(bodyr.sensors, name)){delete bodyr.sensors}})
    Object.entries(data.Stations).map(([name1, st]) => {Object.entries(st.tracks).map(([nm, tr]) => {if(tr.sensors && count(tr.sensors, name)){delete tr.sensors}})})
    body.cd = []
    body.rd = []
    }
export const UI = (data) => {
  let d = Object.keys(data.Exteral.sensor)
  let k = 0

while(count(d, 'I' + k)){
  k += 1}
  return 'I' + k
}

export  const ROTV = (name, name2, data, setData) => {
    let B = data.Exteral.sensor
    let PH = false
    delete B[name].signals
    
    
    if(B[name].phantom){PH = true}
    if(name2 === 'Точка'){name2 = UI(data); B[name].phantom = true}else{delete  B[name].phantom; delete B[name2].signals}
    
    let body = B[name]
    body.cd.map((elm) => {if(B[elm].cd.includes(name)){B[elm].cd[B[elm].cd.indexOf(name)] = name2}
    if(B[elm].rd.includes(name)){B[elm].rd[B[elm].rd.indexOf(name)] = name2}})
    body.rd.map((elm) => {if(B[elm].cd.includes(name)){B[elm].cd[B[elm].cd.indexOf(name)] = name2}
    if(B[elm].rd.includes(name)){B[elm].rd[B[elm].rd.indexOf(name)] = name2}})
    Object.entries(data.Exteral.receiver).map(([name1, bodyr]) => {if(bodyr.sensors && count(bodyr.sensors, name)){bodyr.sensors[bodyr.sensors.indexOf(name)] = name2}})
    Object.entries(data.Stations).map(([name1, st]) => {Object.entries(st.tracks).map(([nm, tr]) => {if(tr.sensors && count(tr.sensors, name)){tr.sensors[tr.sensors.indexOf(name)] = name2}})})
    B[name2] = N(B[name])
    if(PH){delete B[name]}
    else{B[name] = {cd : [], rd : [], np : 1, ar : 1}}
    }
    
export const ChangeSpeed = (receiver) => {
      if(receiver.time < (new Date).getTime()){
      if (receiver.currentSpeed < receiver.targetSpeed * receiver.np) {
        receiver.time = (new Date).getTime() + 300
        receiver.currentSpeed += receiver.rate
        if (receiver.currentSpeed > receiver.targetSpeed * receiver.np){
          receiver.currentSpeed = receiver.targetSpeed * receiver.np}
      } else if (receiver.currentSpeed > receiver.targetSpeed * receiver.np) {
        receiver.time = (new Date).getTime() + 300
        receiver.currentSpeed -= receiver.rate
        if (receiver.currentSpeed < receiver.targetSpeed * receiver.np){
          receiver.currentSpeed = receiver.targetSpeed * receiver.np
        }}receiver.currentSpeed = Math.round(receiver.currentSpeed * 1000) / 1000}}

export const NextStop = (name, nameR, data) => {
  //console.log(1123)
    let Vehicle = data.Vehicle[name]
    if (!Vehicle){return false}
    let F = 0
    let DrivePanel = {}
    let time5 = new Date(Vehicle.time)

    Vehicle.routs.some((v1, q) => {
    if (typeof v1 === 'object') {
    v1.rout.some((v2, i) => {
    if (typeof v2 === 'object') {
    if (['', 'Прибыл'].includes(v2.status)) {

    DrivePanel.index = [q, i]
    DrivePanel.station = [v2.name, v2.tracks]
    DrivePanel.delay = v2.delay
    if(v2.tracks.length > 0 && nameR && data.Exteral.receiver[nameR].sensors){
      let sensors = []
      let rec_sen = N(data.Exteral.receiver[nameR].sensors)
      for(let i = 0; i < v2.tracks.length; i ++){
        if(data.Stations[v2.name].tracks[v2.tracks[i]].sensors){
        let [V1, V2] = data.Stations[v2.name].tracks[v2.tracks[i]].sensors
        let stat_sen = [FBR([V1, V2], data.Exteral.sensor), FBR([V2, V1], data.Exteral.sensor)]
        if (stat_sen){
        sensors.splice(0,0,ReceiverTasks(rec_sen, stat_sen.sort(), data, 0))
      }}}
      if(sensors.length > 0){
      sensors.sort(function(a, b){return a[0] - b[0]})
      DrivePanel.sensors = sensors[0][2]}}
    if (v2.status === '') { DrivePanel.tip = 'Прибыл' }
    if (v2.status === 'Прибыл') { DrivePanel.tip = 'Отправился'; time5 = new Date(time5.getTime() + v2.stop * 1000) }
    DrivePanel.time = time5; F = 1; return 1
    } time5 = new Date(time5.getTime() + v2.stop * 1000)
    } else if (typeof v2 === 'number') { time5 = new Date(time5.getTime() + v2 * 1000) }
    })
    } else { time5 = new Date(time5.getTime() + v1 * 1000) }
    if (F === 1) { return 1 }
    });
    if (JSON.stringify(DrivePanel) === '{}'){return false}
    return DrivePanel}

export const NextStopOt = (name, [q1, i1], data) => {
    console.log(1124)
    let Vehicle = data.Vehicle[name]
    let F = 0
    let DrivePanel = {}
    let time5 = new Date(Vehicle.time)
    let B = data.Exteral.sensor
    i1 += 1
    Vehicle.routs.slice(q1, Vehicle.routs.length).some((v1, q) => {
    if (typeof v1 === 'object') {
      v1.rout.slice(i1, v1.rout.length).some((v2, i) => {
    if (typeof v2 === 'object') {
      time5 = new Date(time5.getTime() + v2.stop * 1000)
      DrivePanel.index = [q+q1, i+i1]
    if(v2.tracks.length > 0){
      let perN = data.Stations[v2.name].tracks[v2.tracks[0]].sensors
      DrivePanel.sensors = [FBR(N(perN).reverse(), B),FBR(N(perN), B)]}
      F = 1
      return 1
    } else if (typeof v2 === 'number') { time5 = new Date(time5.getTime() + v2 * 1000) }
    });i1 = 0} else { time5 = new Date(time5.getTime() + v1 * 1000) }
    if (F === 1) { return 1 }});
    if (JSON.stringify(DrivePanel) === '{}'){return false}
    return DrivePanel}


export const Signal = (name, data) => {
  let B = data.Exteral.sensor
  let signals = ['grey','grey','grey']
  let trainsensors = Object.entries(data.Exteral.receiver).map(([name, body]) => {if(Object.keys(body).includes('sensors')){return N(body.sensors).sort()}})
  let C = RFSignal(name, [], B[name].np,trainsensors, B, 3)
  if (String(C) === 'undefined'){alert('Стоп, мне это неприятно! ')}
  let peregon = (C).length
  
  let D = {4:['green'],3 : ['green','yellow'], 2: ['yellow'], 1: ['red'], 0: ['blue']}
  let I = {4:[2],3 : [2,1], 2: [1], 1: [0], 0 : [0]}
  
  if (String(I[peregon]) === 'undefined'){alert([88, peregon])}
 
  for (let i = 0; i < I[peregon].length; i ++){
    signals[I[peregon][i]] = D[peregon][i]
  }

  return [signals, C]
}

export const LVS = (peregon) => {
  let signals = ['grey','grey','grey']
  
  let D = {4:['green'],3 : ['green','yellow'], 2: ['yellow'], 1: ['red'], 0: ['blue']}
  let I = {4:[2],3 : [2,1], 2: [1], 1: [0], 0 : [0]}
  
  if (String(I[peregon]) === 'undefined'){alert([88, peregon])}
 
  for (let i = 0; i < I[peregon].length; i ++){
    signals[I[peregon][i]] = D[peregon][i]
  }

  return signals
}


export const RFSignal = (nm, lst, np, trainsensors, B, M) => {
    lst.splice(lst.length, 0, nm)
    let name = FBR([nm, np === 1 ? B[nm].cd[0] : B[nm].rd[0]], B, 1)
    let F = 0
    
    if(B[name] && (FBR([name, B[name].cd[0]], B,0) === nm && FBR([nm, B[nm].cd[0]], B,0) === name || FBR([name, B[name].rd[0]], B,0) === nm && FBR([nm, B[nm].rd[0]], B,0) === name)){np *= -1; F = 1}
    if(!name){return lst}
    else if(B[name] && (FBR([name, B[name].cd[0]], B,0) === nm || FBR([name, B[name].rd[0]], B,0) === nm) && !count(trainsensors,[nm, name].sort()) && (B[nm].np === B[name].np && !F || F && B[nm].np !== B[name].np) && lst.length < M){
      lst = RFSignal(name,lst,np,trainsensors, B, M)
      return lst
    }else{
      if(!count(trainsensors,[nm, name].sort())){lst.splice(lst.length, 0, name)}
      return lst
    }
}

export const FBR = (L, B, D) => {

  if(!L[1]){return false}
  let nd = 'cd'
  let k = 0
    while (B[L[L.length-1]].phantom){
      k += 1
      if(B[L[L.length - 1]][nd][0] === L[L.length-2]){if(nd === 'cd'){nd = 'rd'}else{nd = 'cd'}}
      if(!B[L[L.length-1]][nd][0]){return false}

      //L[L.length - 1] = B[L[L.length - 1]][nd][0]
      L.splice(L.length,0,B[L[L.length - 1]][nd][0])
      if(k > 20){alert(JSON.stringify(['limit', L]));break}
    }
    return L[L.length - 1]
}
export const FBR2 = (L, B, D) => {

  let nd = 'cd'
  let k = 0
    while (B[L[L.length-1]].phantom){
      k += 1
      if(B[L[L.length - 1]][nd][0] === L[L.length-2]){if(nd === 'cd'){nd = 'rd'}else{nd = 'cd'}}
      if(!B[L[L.length-1]][nd][0]){break}

      //L[L.length - 1] = B[L[L.length - 1]][nd][0]
      L.splice(L.length,0,B[L[L.length - 1]][nd][0])
      if(k > 20){alert(JSON.stringify(['limit', L]));break}
    }
    return L
}

export const NSI = (receiver, data) => {
  let B = data.Exteral.sensor
  let Nsen = N(B[FBR(N(receiver.sensors), B)])

  let FS = Nsen.np === 1 ? Nsen.rd[0] : Nsen.cd[0]
  let stat = false
  if (Nsen.np === 1 && Nsen.cd.length > 1 || Nsen.np === -1 && Nsen.rd.length > 1){stat = 'Перевести стрелку'}
  if (FS !== LN(FBR2(N(receiver.sensors), B), -2)){stat = 'Открыть светофор'}

  return stat
}

export const OSignal = ([nameA, nameB], data, setData) => {
  const B = data?.Exteral?.sensor;
  if (!B?.[nameB]) return;

  setData(prevData => {
    const prevSensor = B[FBR([nameA, nameB], B)]
    const prevSensorA = LN(FBR2([nameA, nameB], B), -2)
    console.log(prevSensorA)
    if (!prevSensor?.rd || !prevSensor?.cd) return prevData;

    let newSensor = { ...prevSensor };
    console.log(prevSensor)
    const getConnected = (sensor) =>
      sensor.np === 1 
        ? sensor.rd[0]
        : sensor.cd[0]

    // Первая проверка
    if (getConnected(newSensor) !== prevSensorA) {
      newSensor.np *= -1;
    }

    // Вторая проверка — если всё ещё не совпадает, разворачиваем массивы
    if (getConnected(newSensor) !== prevSensorA) {
      newSensor.rd = [...newSensor.rd].reverse();
      newSensor.cd = [...newSensor.cd].reverse();
    }

    // Третья проверка — если всё равно не совпадает, снова меняем np
    if (getConnected(newSensor) !== prevSensorA) {
      newSensor.np *= -1;
    }
    console.log(newSensor)
    return {
      ...prevData,
      Exteral: {
        ...prevData.Exteral,
        sensor: {
          ...prevData.Exteral.sensor,
          [nameB]: newSensor
        }
      }
    };
  });
};



export const AutoOtp = (name, data) => {
  console.log(1124)
  let receiver = data.Exteral.receiver[name]

  if (!receiver.Vehicle || receiver.tip != 'Auto'){return 1}

  let Nstop = NextStop(receiver.Vehicle, name, data)

  if(!Nstop){return 1}

  let elem = data.Vehicle[ receiver.Vehicle ].routs[ Nstop.index[0] ].rout[ Nstop.index[1] ]
  if (Nstop.tip === 'Отправился' && ((new Date().getTime() - Nstop.time.getTime()) / 1000 >  elem.delay)){
    Delay(Nstop.index, Math.floor((new Date().getTime() - Nstop.time.getTime()) / 1000), data.Vehicle[ receiver.Vehicle ].routs,0)
    elem.status = 'Отправился'
      }
}

export function Delay(index, delay, Rout, setRout, T) {
  const k = 0.2;
  let F = 0;
  const RDelay = delay;
  let currentDelay = delay;        // используем отдельную переменную
  let startPointIndex = index[1];

  setRout((prevRout) => {
    if (!prevRout || !Array.isArray(prevRout)) return prevRout;

    const newRout = prevRout.map((group, groupIdx) => {
      // Пропускаем группы до нужной
      if (groupIdx < index[0]) return group;
      let newGroup

      if (typeof group === 'number'){          
          currentDelay -= Math.floor(group * k);
          return group;
        }else{
          newGroup = { ...group };
          newGroup.rout = group.rout.map((point, pointIdx) => {
        // Пропускаем точки до нужной в первой группе
        if (groupIdx === index[0] && pointIdx < startPointIndex) {
          return point;
        }

        // Если это число (не объект)
        if (typeof point === 'number') {
          currentDelay -= Math.floor(point * k);
          return point;
        }

        // Если это объект — создаём копию
        if (typeof point === 'object' && point !== null) {
          let newPoint = { ...point };

          if (currentDelay <= 0 && newPoint.delay <= 0) {
            F = 1;
          }

          if (newPoint.status === 'Отменен') {
            if (!T) {
            currentDelay -= newPoint.stop;}
          } 
          else if (newPoint.status !== 'Прибыл') {
            if (!T) {
              currentDelay -= Math.floor(newPoint.stop * k);
            }
          }

          if (currentDelay < 0) {
            newPoint.delay = 0;
          }

          // Эта строка в оригинале ничего не делает (умножение на 0)
          if (currentDelay > 0) {
            newPoint.stop = newPoint.stop - Math.floor(newPoint.stop * 0);
          }

          if (currentDelay > 3 || newPoint.delay > 0 || T || 
              (newPoint.status === 'Прибыл' && newPoint.delay > 0)) {
            newPoint.delay = currentDelay;
          }

          if (T) T = 0;   // это влияет только на текущую итерацию

          return newPoint;
        }

        return point;
      });}

      return newGroup;
    });

    // Финальные корректировки после прохода по всему маршруту
    const targetGroup = newRout[index[0]];
    if (targetGroup?.rout?.[index[1]]) {
      const targetPoint = { ...targetGroup.rout[index[1]] }; // копия

      if (targetPoint.status === 'Отправился' && RDelay < -5) {
        targetPoint.delay = RDelay;
      }

      if (targetPoint.status === 'Прибыл') {
        if (index[1] > 2) {
          const prevDelay = targetGroup.rout[index[1] - 2]?.delay || 0;
          targetPoint.delayA = RDelay - prevDelay;
        } else {
          targetPoint.delayA = RDelay;
        }
      }

      // Заменяем точку в новом массиве
      newRout[index[0]] = {
        ...targetGroup,
        rout: [
          ...targetGroup.rout.slice(0, index[1]),
          targetPoint,
          ...targetGroup.rout.slice(index[1] + 1)
        ]
      };
    }

    return newRout;
  });
}

export const Detected = (sensor, data) => {}

export const Sum = (arr) =>{
  let s = 0
  arr.forEach(elm => s += elm)
  return s
}

export const JS = (e) => {
  return JSON.stringify(e)
}

export const INDOF = (lst, a) => {
  for(let i in lst){
    if (JS(lst[i]) === JS(a)){return i}
  }
}
export const count = (lst, id) => {
  return lst.filter(elm => JSON.stringify(elm) === JSON.stringify(id)).length
}

export const OdataFrec = (data) => {
  console.log(1124)
  let data2 = []
  data2.splice(0,0,N(data.Stations))
  data2.splice(0,0,N(data.Exteral.sensor))
  data2.splice(0,0,N(Object.entries(data.Exteral.receiver).map(([name, body]) => {
  return [body.sensors,body.tip, NextStop(body.Vehicle, name, data)]})))
  return JSON.stringify(data2) 
  
}
export const RLZ = (data, tip, name, direct) => {
  if (tip === 'Trains'){
    let train = FindNameTrain(data, direct, name)
    let map = data.Vehicle[train[0]].routs[train[1]].rout
    let time = new Date(train[2])
    let delayL = [] 
    let indA = map.length
    let F = 0
    map.some((v1, ind)=> {if (typeof v1 === 'object'){if (v1.status === '' || 0 < delayL.length && delayL.length  < 2){if (delayL.length === 0){indA = ind; F = 1}
    delayL.splice(0,0,Math.max(v1.delay, ((new Date).getTime() - time.getTime())/ 1000))}
    time = new Date(time.getTime() + v1.stop * 1000)}else{time = new Date(time.getTime() + v1 * 1000)}})
    if (!F){return 'bg-blue-400'}
    indA -= 1
    for (indA; indA >= 0; indA --){
      if (typeof map[indA] === 'object' && map[indA].status != 'Отменен' && delayL.length  < 5){delayL.splice(0,0,map[indA].delay)}
    }
    let DL = Sum(delayL)/delayL.length
    if (DL < 15){return 'bg-green-400'}
    if (DL < 30){return 'bg-green-200'}
    if (DL < 120){return 'bg-yellow-400'}
    if (DL < 300){return 'bg-red-400'}
    return 'bg-black'
  }
  if (tip === 'Stations'){
    let delayL = DepartsDelay(data, name).filter((tm) =>  tm[0]  <= (new Date).getTime() + 500000 && tm[0]  >= (new Date).getTime() - 500000).map((el) => el[1].delay)
    if (!delayL.length){return 'bg-blue-400'}
    let DL = Sum(delayL)/delayL.length
    if (DL < 20){return 'bg-green-400'}
    if (DL < 40){return 'bg-green-200'}
    if (DL < 180){return 'bg-yellow-400'}
    if (DL < 500){return 'bg-red-400'}
    return 'bg-black'
  }
  return 'bg-white'
}
const DepartsDelay = (data, station) => {
  let datal = []
            for (let i = 0; i < Object.entries(data.Vehicle).length; i++){
            let time = new Date(Object.entries(data.Vehicle)[i][1].time)
            for (let q = 0; q < Object.entries(data.Vehicle)[i][1].routs.length; q++){
                let v1 = JSON.parse(JSON.stringify(Object.entries(data.Vehicle)[i][1].routs[q]))
                if (typeof v1 === 'object'){
                    for (let u = 0; u < v1.rout.length; u ++){
                        let v2 = v1.rout[u]
                        if (typeof v2 === 'object' && v2.name === station){
                            if (v2.status === '' && time.getTime() + v2.delay * 1000 < (new Date).getTime()){
                              v2.delay = Math.floor(((new Date).getTime() - time.getTime())/1000)}
                            time = new Date(time.getTime() + v2.stop * 1000)
                            if (v2.status === 'Прибыл' && time.getTime() + v2.delay * 1000 < (new Date()).getTime()){
                              v2.delay = Math.floor(((new Date).getTime() - time.getTime())/1000)}
                            datal.splice(0,0, [time.getTime() + v2.delay * 1000, {delay: v2.delay}])
                            
                        }else if(typeof v2 === 'object'){time = new Date(time.getTime() + v2.stop * 1000);}
                        else{time = new Date(time.getTime() + v2 * 1000);}
                    }}else{time = new Date(time.getTime() + v1 * 1000);}}
      }datal.sort(function(a, b){return b - a}).reverse()
  return datal

}
export const TSK = (tip, task, name, data, setData) => {
    setData(prev => {
      const next = structuredClone(prev);   // или глубокая копия любым способом

      // ─────────────────────────────────────────────────────────────
      if (task === 'Add') {

        // ─── Проверка на уникальность имени (для Vehicle / Schedule / DirectsA / Stations) ───
        if (['Vehicle', 'Schedule', 'DirectsA', 'Stations'].includes(tip[0])) {
          const existingNames = [
            ...Object.keys(next.Vehicle || {}),
            ...Object.keys(next.Schedule || {}),
            ...Object.keys(next.Stations || {}),
            // DirectsA — если это отдельный ключ, добавь ...Object.keys(next.DirectsA || {})
          ];

          let finalName = name;
          let counter = 1;
          while (existingNames.includes(finalName)) {
            finalName = `${name} (${counter})`;
            counter++;
          }
          name = finalName;   // ← переопределяем name
        }

        // ─── Добавление в Stations ───
        if (tip[0] === 'Stations') {
          next.Stations = {
            ...(next.Stations || {}),
            [name]: {
              description: N(data.DefaultStation?.description),
              tracks:      N(data.DefaultStation?.tracks),
              towards:     N(data.DefaultStation?.towards),
              platforms:   N(data.DefaultStation?.platforms),
            }
          };
        }

        // ─── Добавление в массив внутри DefaultStation ───
        else if (tip[0] === 'DefaultStation') {
          next.DefaultStation = { ...next.DefaultStation };
          next.DefaultStation[tip[1]] = [
            ...(next.DefaultStation[tip[1]] || []),
            name
          ];
        }

        // ─── Directs ───
        else if (tip[0] === 'Directs') {
          next.Directs = { ...next.Directs };

          if (tip.length === 1) {
            next.Directs[name] = {};
          } else {
            next.Directs[tip[1]] = { ...next.Directs[tip[1]] };
            next.Directs[tip[1]][tip[2]] = { ...next.Directs[tip[1]][tip[2]] };

            next.Directs[tip[1]][tip[2]][name] = {
              routs: [{
                name: name,
                base: name,
                step: 1,
                number: 0,
                id: -1,
                direct: tip[1],
                rout: [0]
              }],
              time: new Date('2000-01-01T00:00:00')
            };
          }
        }

        // ─── Schedule ───
        else if (tip[0] === 'Schedule') {
          next.Schedule = {
            ...(next.Schedule || {}),
            [name]: {
              routs: [0],
              time: new Date('2000-01-01T00:00:00')
            }
          };
        }

        // ─── Vehicle ───
        else if (tip[0] === 'Vehicle') {
          next.Vehicle = {
            ...(next.Vehicle || {}),
            [name]: {
              routs: [0],
              time: new Date().toLocaleString('sv-SE', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
              }).replace(' ', 'T'),
              otl: false
            }
          };
        }
      }

      // ─────────────────────────────────────────────────────────────
      else if (task === 'Izm') {
        next[tip[0]] = {
          ...next[tip[0]],
          [tip[1]]: name
        };
      }

      // ─────────────────────────────────────────────────────────────
      else if (task === 'Del') {
        next[tip[0]] = { ...next[tip[0]] };

        if (tip.length === 2) {
          // удаляем из массива
          const arr = [...(next[tip[0]][tip[1]] || [])];
          const idx = arr.indexOf(name);
          if (idx !== -1) {
            arr.splice(idx, 1);
          }
          next[tip[0]][tip[1]] = arr;
        }
        else if (tip.length === 3) {
          // удаляем вложенный ключ
          next[tip[0]][tip[1]] = { ...next[tip[0]][tip[1]] };
          next[tip[0]][tip[1]][tip[2]] = { ...next[tip[0]][tip[1]][tip[2]] };
          delete next[tip[0]][tip[1]][tip[2]][name];
        }
        else {
          // удаляем ключ на уровне tip[0]
          delete next[tip[0]][name];
        }
      }

      return next;
    });}

// Иммутабельная версия TSK2
export const TSK2 = (tip, task, name, data, setData, dt, changeUrl, dataO, setDataO) => {
  console.log(tip, task, name, data, dt, changeUrl, dataO)
  if (task === 'Add') {
    handleAdd(tip, name, data, setData, changeUrl);
  } else if (task === 'Izm') {
    handleIzm(tip, name, dt, data, setData, changeUrl, dataO, setDataO);
  } else if (task === 'Del') {
    handleDel(tip, name, data, setData, changeUrl, dataO, setDataO);
  }
};

function handleAdd(tip, name, data, setData, changeUrl) {
  if (tip === 'Stations') {
    setData(prev => ({
      ...prev,
      Stations: {
        ...prev.Stations,
        [name]: {
          description: JSON.parse(JSON.stringify(prev.DefaultStation.description)),
          tracks: JSON.parse(JSON.stringify(prev.DefaultStation.tracks)),
          towards: JSON.parse(JSON.stringify(prev.DefaultStation.towards)),
          platforms: JSON.parse(JSON.stringify(prev.DefaultStation.platforms)),
        }
      }
    }));
  }

  if (['tracks', 'platforms', 'towards', 'Directs'].includes(tip)) {
    setData(prev => ({
      ...prev,
      [tip]: { ...prev[tip], [name]: {} }
    }));
  }

  if (tip === 'DirectsA') {
    setData(prev => ({ ...prev, [name]: { routs: {} } }));
    console.log(name)
    changeUrl(name);
  }

  if (tip === 'routs') {
    setData(prev => ({
      ...prev,
      routs: {
        ...prev.routs,
        [name]: {
          routs: [{ name, base: name, step: 1, number: 0, id: -1, direct: tip[1], rout: [0] }],
          time: new Date('2000-01-01T00:00:00')
        }
      }
    }));
  }

  if (tip === 'Schedule') {
    setData(prev => ({
      ...prev,
      Schedule: { ...prev.Schedule, [name]: { routs: [0], time: new Date('2000-01-01T00:00:00') } }
    }));
  }

  if (tip === 'Vehicle') {
    setData(prev => ({
      ...prev,
      Vehicle: {
        ...prev.Vehicle,
        [name]: { routs: [0], time: new Date().toISOString().slice(0, 19), otl: false }
      }
    }));
  }
}

function handleIzm(tip, name, dt, data, setData, changeUrl, dataO, setDataO) {
  if (tip === 'Stations') {
    // Обновляем ссылки на станцию во всех маршрутах
    let newRouts = []
    setDataO(prev => {
      const newDirects = Object.fromEntries(
        Object.entries(prev.Directs).map(([v1, nap]) => [
          v1,
          {
            ...nap,
            routs: Object.fromEntries(
              Object.entries(nap.routs).map(([v2, Rout]) => {
                const newRout = Rout.routs[0].rout.map(v3 =>
                  typeof v3 === 'object' && v3.name === dt
                    ? { ...v3, name }
                    : v3
                );
                newRouts.splice(0,0,[{ ...Rout.routs[0], rout: newRout }, ...Rout.routs.slice(1)])
                return [v2, {
                  ...Rout,
                  routs: [{ ...Rout.routs[0], rout: newRout }, ...Rout.routs.slice(1)]
                }];
              })
            )
          }
        ])
      );
      return { ...prev, Directs: newDirects };
    });
    for (let i in newRouts){
      ChRout(setDataO, newRouts[i])
    }
    

  }

  if (tip === 'Directs') {
    const nap = data[dt].routs[0].direct;
    ChRoutName(setDataO, name, dt, nap);
    setData(prev => {
      const entry = prev[dt];
      const newEntry = {
        ...entry,
        routs: [{ ...entry.routs[0], name, base: name }, ...entry.routs.slice(1)]
      };
      const { [dt]: _, ...rest } = prev;
      return { ...rest, [name]: newEntry };
    });
    changeUrl(name);
  }

  if (tip === 'DirectsA') {
    // Обновляем routs внутри data
    setData(prev => {
      const entry = prev[dt];
      const newRouts = Object.fromEntries(
        Object.entries(entry.routs).map(([k, body]) => [
          k,
          {
            ...body,
            routs: [
              {
                ...body.routs[0],
                direct: name,
                ...(body.routs[0].svzD ? { svzD: name } : {})
              },
              ...body.routs.slice(1)
            ]
          }
        ])
      );
      const { [dt]: _, ...rest } = prev;
      return { ...rest, [name]: { ...entry, routs: newRouts } };
    });

    // Обновляем ссылки в Vehicle и Schedule
    setDataO(prev => ({
      ...prev,
      Vehicle: Object.fromEntries(
        Object.entries(prev.Vehicle).map(([k, body]) => [
          k,
          {
            ...body,
            routs: body.routs.map(elm =>
              typeof elm === 'object' && elm.direct === dt
                ? { ...elm, direct: name }
                : elm
            )
          }
        ])
      ),
      Schedule: Object.fromEntries(
        Object.entries(prev.Schedule).map(([k, body]) => [
          k,
          {
            ...body,
            routs: body.routs.map(elm =>
              typeof elm === 'object' && elm.direct === dt
                ? { ...elm, direct: name }
                : elm
            )
          }
        ])
      )
    }));
    changeUrl(name);
  }

  if (tip === 'Vehicle') {
    setDataO(prev => ({
      ...prev,
      Exteral: {
        ...prev.Exteral,
        receiver: Object.fromEntries(
          Object.entries(prev.Exteral.receiver).map(([k, body]) => [
            k,
            body.Vehicle === dt ? { ...body, Vehicle: name } : body
          ])
        )
      }
    }));

    setData(prev => {
      
      const { [dt]: entry, ...rest } = prev;
      
      return { ...rest, [name]: entry };
    });
    changeUrl(name);
  }

  // Для Stations и Schedule — простое переименование ключа (если не обработано выше)
  if (tip === 'Stations' || tip === 'Schedule') {
    setData(prev => {
      const { [dt]: entry, ...rest } = prev;
      return { ...rest, [name]: entry };
    });
    changeUrl(name);
  }  
  if (tip === 'name') {
    setData(prev => {
      return { ...prev, 'name': name };
    });
  }

  // Для tracks/platforms/towards — просто перезаписываем значение
  if (['tracks', 'platforms', 'towards'].includes(tip)) {
    setData(prev => ({ ...prev, [tip]: name }));
  }
}

function handleDel(tip, name, data, setData, changeUrl, dataO, setDataO) {
  if (tip === 'Vehicle') {
    setDataO(prev => ({
      ...prev,
      Exteral: {
        ...prev.Exteral,
        receiver: Object.fromEntries(
          Object.entries(prev.Exteral.receiver).map(([k, body]) => {
            if (body.Vehicle === name) {
              const { Vehicle, ...rest } = body;
              return [k, rest];
            }
            return [k, body];
          })
        )
      }
    }));
  }

  if (tip === 'Directs') {
    const nap = data[name].routs[0].direct;
    ChRoutName(setDataO, '~D~E!E!E~L~', name, nap);
  }

  if (tip === 'DirectsA') {
    setDataO(prev => ({
      ...prev,
      Vehicle: Object.fromEntries(
        Object.entries(prev.Vehicle).map(([k, body]) => [
          k,
          {
            ...body,
            routs: body.routs.filter((elm, i, arr) => {
              if (typeof elm === 'object' && elm.direct === name) return false;
              // Удаляем также следующий элемент (splice(i, 2))
              if (i > 0 && typeof arr[i - 1] === 'object' && arr[i - 1].direct === name) return false;
              return true;
            })
          }
        ])
      ),
      Schedule: Object.fromEntries(
        Object.entries(prev.Schedule).map(([k, body]) => [
          k,
          {
            ...body,
            routs: body.routs.filter((elm, i, arr) => {
              if (typeof elm === 'object' && elm.direct === name) return false;
              if (i > 0 && typeof arr[i - 1] === 'object' && arr[i - 1].direct === name) return false;
              return true;
            })
          }
        ])
      )
    }));
    changeUrl('');
  }

  if (tip === 'Stations') {
    let newRouts = []
    setDataO(prev => {
      const newDirects = Object.fromEntries(
        Object.entries(prev.Directs).map(([v1, nap]) => [
          v1,
          {
            ...nap,
            routs: Object.fromEntries(
              Object.entries(nap.routs).map(([v2, Rout]) => {
                const newRout = Rout.routs[0].rout.filter((v3, ind, arr) => {
                  if (typeof v3 === 'object' && v3.name === name) return false;
                  // splice(ind, 2) — убираем и следующий
                  if (ind > 0 && typeof arr[ind - 1] === 'object' && arr[ind - 1].name === name) return false;
                  return true;
                });
                newRouts.splice(0,0,[{ ...Rout.routs[0], rout: newRout }, ...Rout.routs.slice(1)])
                return [v2, {
                  ...Rout,
                  routs: [{ ...Rout.routs[0], rout: newRout }, ...Rout.routs.slice(1)]
                }];
              })
            )
          }
        ])
      );
      return { ...prev, Directs: newDirects };
    });
        for (let i in newRouts){
      ChRout(setDataO, newRouts[i])
    }
    
  }

  // Удаление ключа
  if (['tracks', 'platforms', 'towards'].includes(tip)) {
    setData(prev => {
      const { [name]: _, ...rest } = prev[tip];
      return { ...prev, [tip]: rest };
    });
  } else {
    console.log(tip, name)
    setData(prev => {
      const { [name]: _, ...rest } = prev;
      return rest;
    });
  }
}

export function compareObjects(oldObj, newObj, userKey) {
    const deletePaths = [];   // строки: '{"7674","routs",0,"name"}'
    const updates = [];       // { '{"7674","routs",0,"name"}': "Новое имя" }

    function buildPgPath(parts) {
        return '{' + parts.map(p => `"${p}"`).join(',') + '}';
    }

    function deepEqual(a, b) {
        if (a === b) return true;
        if (a == null || b == null) return false;
        if (typeof a !== typeof b) return false;
        if (Array.isArray(a) !== Array.isArray(b)) return false;

        if (Array.isArray(a)) {
            if (a.length !== b.length) return false;
            return a.every((v, i) => deepEqual(v, b[i]));
        }

        if (typeof a === 'object') {
            const keysA = Object.keys(a);
            const keysB = Object.keys(b);
            if (keysA.length !== keysB.length) return false;
            return keysA.every(k => deepEqual(a[k], b[k]));
        }
        return false;
    }

    function compare(oldVal, newVal, path = []) {
        const fullPath = userKey ? [userKey, ...path] : path;

        // === Массивы ===
        if (Array.isArray(oldVal) && Array.isArray(newVal)) {
            const maxLen = Math.max(oldVal.length, newVal.length);

            for (let i = 0; i < maxLen; i++) {
                const idxPath = [...path, i.toString()];

                if (i >= oldVal.length) {
                    // Добавлен элемент
                    updates.splice(0,0, [buildPgPath([...fullPath, i.toString()]), newVal[i], fullPath])
                } else if (i >= newVal.length) {
                    // Удалён элемент
                    deletePaths.splice(0,0, [buildPgPath([...fullPath, i.toString()]), fullPath]);
                } else {
                    // Элемент существует — сравниваем содержимое
                    compare(oldVal[i], newVal[i], idxPath);
                }
            }
            return;
        }

        // === Объекты ===
        if (oldVal && typeof oldVal === 'object' && !Array.isArray(oldVal) &&
            newVal && typeof newVal === 'object' && !Array.isArray(newVal)) {

            const allKeys = new Set([...Object.keys(oldVal), ...Object.keys(newVal)]);

            for (const key of allKeys) {
                const keyPath = [...path, key];

                if (!(key in newVal)) {
                    deletePaths.splice(0,0, [buildPgPath([...fullPath, key]), fullPath]);
                } else if (!(key in oldVal)) {
                    updates.splice(0,0, [buildPgPath([...fullPath, key]), newVal[key], fullPath])
                } else if (!deepEqual(oldVal[key], newVal[key])) {
                    compare(oldVal[key], newVal[key], keyPath);
                }
            }
            return;
        }

        // === Примитивы или один null/undefined ===
        if (!deepEqual(oldVal, newVal)) {
            updates.splice(0,0, [buildPgPath(fullPath), newVal, fullPath])
        }
    }

    compare(oldObj, newObj);
    return { delete: sortPaths(deletePaths, 'desc') , set: sortPaths(updates, 'asc') };
}

function sortPaths(deleteItems, order) {
    if (!deleteItems || deleteItems.length <= 1) return deleteItems;

    const multiplier = order === 'desc' ? -1 : 1;

    const normalized = deleteItems.map(item => {
        let pathArray = [];
        let original = item;

        if (Array.isArray(item) && item.length >= 1) {
            const candidate = item[0];

            // 1. Первый элемент — строка вида '{"a","b",5}'
            if (typeof candidate === 'string' && candidate.startsWith('{') && candidate.endsWith('}')) {
                pathArray = candidate
                    .slice(1, -1)
                    .split('","')
                    .map(p => p.replace(/^"|"$/g, ''));
            }
            // 2. Первый элемент — уже массив (правильный формат)
            else if (Array.isArray(candidate)) {
                pathArray = candidate;
            }
            // 3. Если вдруг путь в другом месте — ищем первый массив или строку-путь
            else {
                for (let el of item) {
                    if (typeof el === 'string' && el.startsWith('{') && el.endsWith('}')) {
                        pathArray = el.slice(1, -1).split('","').map(p => p.replace(/^"|"$/g, ''));
                        break;
                    }
                    if (Array.isArray(el)) {
                        pathArray = el;
                        break;
                    }
                }
            }
        }

        return [pathArray, original];
    });

    // Сортировка по индексам в массивах
    normalized.sort(([pathA], [pathB]) => {
        const len = Math.min(pathA.length, pathB.length);
        for (let i = 0; i < len; i++) {
            if (pathA[i] !== pathB[i]) {
                const aIsNum = !isNaN(pathA[i]);
                const bIsNum = !isNaN(pathB[i]);
                const numA = Number(pathA[i]);
                const numB = Number(pathB[i]);

                if (aIsNum && bIsNum) {
                    return (numA - numB) * multiplier; // 6 → 5 при desc
                }
                if (aIsNum) return multiplier;
                if (bIsNum) return -multiplier;
                return pathA[i].localeCompare(pathB[i]);
            }
        }
        return (pathB.length - pathA.length) * multiplier;
    });

    return normalized.map(([, original]) => original);
}

export const LN = (lst, n) => {
  return lst[lst.length + n]
}