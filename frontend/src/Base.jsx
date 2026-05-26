import { BrowserRouter, Routes, Route, useNavigate, useParams } from 'react-router-dom';
import Enter from './Enter.jsx';
import YandexMapDirect from './map2.jsx';
import App from './App.jsx';
//import Camera from './camera.jsx';
import Camera from './camera3.jsx';
import CameraEditor from "./CameraEditor";
import Statistics   from './Statistics.jsx';
import IncidentPage from './IncidentPage.jsx';
import Photos       from './Photos.jsx';
import { useEffect, useState } from 'react';
/*

cd frontend
$env:PATH="D:\AccidentPanelDetector\frontend\node-v24.12.0-win-x64;$env:PATH"
npm.cmd run dev -- --host

*/
function Base() {
  const [param, setParam] = useState({})
  return (
    <BrowserRouter >
      <Routes>
        <Route path="/camera/:name" element={<Camera />} />
        <Route path="/" element={<YandexMapDirect />} />
        <Route path="/camera/:name/zones" element={<CameraEditor />} />
        <Route path="/statistics"         element={<Statistics />} />
        <Route path="/statistics/:camera" element={<Statistics />} />
        <Route path="/incident/:id"       element={<IncidentPage />} />
        <Route path="/photos"             element={<Photos />} />
        {/*
        <Route path="/:direct" element={<DirectSchedule />} />
        <Route path="/:direct/:rout" element={<SredstvoDetail />} />
        <Route path="/station/:name" element={<Station />} />
        <Route path="/rbase" element={<Rbase />} />
        <Route path="*" element={<NotFound />} />*/}
      </Routes>
    </BrowserRouter>
  );
}

export default Base;
