from fastapi import APIRouter, Depends, Body
from fastapi.websockets import WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
from PIL import ImageFont, ImageDraw, Image as PILImage
from ultralytics import YOLO
from datetime import datetime, timezone
import numpy as np
import cv2
import asyncio
import math
import time
import os

from models import (
    SessionLocal, Camera, Incident, SuperAdmin,
    get_db, get_current_user,
    _get_camera_incidents, _set_camera_incidents,
    INCIDENTS_PHOTOS_DIR, INCIDENT_SAVE_COOLDOWN,
    CAMERA_ZONES_REFRESH_INTERVAL, SAVE_INCIDENT_SCREENSHOTS,
)
from notifications import notify_incident

router = APIRouter()

# ── Шрифт для кириллицы ───────────────────────────────────────────────────────
try:
    _FONT = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 16)
except OSError:
    _FONT = ImageFont.load_default()

# ── Глобальное состояние камер ────────────────────────────────────────────────
camera_states: dict[int, dict] = {}
camera_tasks_started = False
_running_camera_ids: set = set()

os.makedirs(INCIDENTS_PHOTOS_DIR, exist_ok=True)


# ── Вспомогательные функции рисования ────────────────────────────────────────

def _put_text(frame: np.ndarray, text: str, pos: tuple, color_bgr: tuple) -> np.ndarray:
    img_pil   = PILImage.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
    draw      = ImageDraw.Draw(img_pil)
    color_rgb = (color_bgr[2], color_bgr[1], color_bgr[0])
    draw.text(pos, text, font=_FONT, fill=color_rgb)
    return cv2.cvtColor(np.array(img_pil), cv2.COLOR_RGB2BGR)


def _label_box(frame: np.ndarray, text: str, x1: int, y1: int,
               box_color: tuple, text_color: tuple = (255, 255, 255)) -> np.ndarray:
    bbox = _FONT.getbbox(text)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    cv2.rectangle(frame, (x1, y1 - th - 8), (x1 + tw + 4, y1), box_color, -1)
    return _put_text(frame, text, (x1 + 2, y1 - th - 6), text_color)


def _fill_zones(frame: np.ndarray, zones: list, color_bgr: tuple,
                alpha: float = 0.15, border: int = 2) -> np.ndarray:
    for zone in zones:
        pts     = np.array(zone, dtype=np.int32)
        overlay = frame.copy()
        cv2.fillPoly(overlay, [pts], color_bgr)
        cv2.addWeighted(overlay, alpha, frame, 1 - alpha, 0, frame)
        cv2.polylines(frame, [pts], True, color_bgr, border)
    return frame


# ── Детекторы ─────────────────────────────────────────────────────────────────

def _detect_traffic_jam(frame: np.ndarray, results, camera, state: dict) -> dict:
    vehicles: dict         = state.setdefault("_tj_vehicles", {})
    frame_count: int       = state.get("_tj_frame_count", 0)
    last_valid_boxes: dict = state.get("_tj_last_boxes", {})

    FPS               = state.get("_fps", 25)
    POSITIONS_HISTORY = 15
    BASE_PX_PER_METER = 7.5
    JAM_SPEED_MAX     = 15
    JAM_DISTANCE      = 100
    JAM_MIN_VEHICLES  = 3

    road_zones = getattr(camera, "road_zones", None) or []

    h, w      = frame.shape[:2]
    road_mask = np.zeros((h, w), dtype=np.uint8)
    for zone in road_zones:
        cv2.fillPoly(road_mask, [np.array(zone, dtype=np.int32)], 255)

    if frame_count % 2 == 0:
        current_frame_ids:   set  = set()
        current_valid_boxes: dict = {}

        if results is not None and results.boxes is not None and results.boxes.id is not None:
            boxes       = results.boxes.xyxy.cpu().numpy()
            track_ids   = results.boxes.id.cpu().numpy().astype(int)
            confidences = results.boxes.conf.cpu().numpy()

            for box, tid, conf in zip(boxes, track_ids, confidences):
                x1, y1, x2, y2 = box.astype(int)
                cx, cy = (x1 + x2) // 2, (y1 + y2) // 2

                if road_mask.size > 0:
                    cy_c = min(cy, h - 1); cx_c = min(cx, w - 1)
                    if road_mask[cy_c, cx_c] == 0:
                        continue

                center = (cx, cy)
                current_frame_ids.add(tid)
                current_valid_boxes[tid] = (x1, y1, x2, y2, center, conf)

                if tid not in vehicles:
                    vehicles[tid] = {
                        "positions": [center], "last_seen": 0,
                        "current_speed": 0, "speed_history": [],
                        "last_box": (x1, y1, x2, y2),
                    }
                else:
                    veh = vehicles[tid]
                    if veh["positions"]:
                        lc = veh["positions"][-1]
                        if abs(center[0]-lc[0]) + abs(center[1]-lc[1]) > 100:
                            continue
                    veh["positions"].append(center)
                    veh["last_seen"] = 0
                    veh["last_box"]  = (x1, y1, x2, y2)
                    if len(veh["positions"]) > POSITIONS_HISTORY:
                        veh["positions"].pop(0)

                    if len(veh["positions"]) >= 4:
                        speeds = []
                        pos    = veh["positions"]
                        for i in range(1, len(pos)):
                            dx = pos[i][0] - pos[i-1][0]
                            dy = pos[i][1] - pos[i-1][1]
                            d  = math.sqrt(dx*dx + dy*dy)
                            s  = (d / (1.0 / FPS) / BASE_PX_PER_METER) * 3.6
                            if s > 0.1:
                                speeds.append(s)
                        if len(speeds) >= 3:
                            veh["speed_history"].append(float(np.median(speeds)))
                            if len(veh["speed_history"]) > 5:
                                veh["speed_history"].pop(0)
                            veh["current_speed"] = float(np.median(veh["speed_history"]))

        last_valid_boxes = current_valid_boxes
        for tid in list(vehicles.keys()):
            if tid not in current_frame_ids:
                vehicles[tid]["last_seen"] += 1
                if vehicles[tid]["last_seen"] > 15:
                    del vehicles[tid]

        state["_tj_last_boxes"] = last_valid_boxes

    state["_tj_frame_count"] = frame_count + 1

    slow = [
        {"tid": tid,
         "box": veh["last_box"],
         "center": ((veh["last_box"][0]+veh["last_box"][2])//2,
                    (veh["last_box"][1]+veh["last_box"][3])//2),
         "speed": veh["current_speed"]}
        for tid, veh in vehicles.items()
        if veh["current_speed"] <= JAM_SPEED_MAX and tid in last_valid_boxes
    ]

    jams = []
    if len(slow) >= JAM_MIN_VEHICLES:
        used: set = set()
        for i, v1 in enumerate(slow):
            if i in used:
                continue
            group = [v1]; used.add(i)
            for j, v2 in enumerate(slow):
                if j in used:
                    continue
                dist = math.sqrt((v1["center"][0]-v2["center"][0])**2 +
                                 (v1["center"][1]-v2["center"][1])**2)
                if dist < JAM_DISTANCE:
                    group.append(v2); used.add(j)
            if len(group) >= JAM_MIN_VEHICLES:
                bx1     = min(v["box"][0] for v in group)
                by1     = min(v["box"][1] for v in group)
                bx2     = max(v["box"][2] for v in group)
                by2     = max(v["box"][3] for v in group)
                avg_spd = sum(v["speed"] for v in group) / len(group)
                jams.append({"box": (bx1, by1, bx2, by2),
                              "vehicle_count": len(group),
                              "avg_speed": avg_spd})

    return {"jams": jams, "road_zones": road_zones}


def _detect_illegal_stop(frame: np.ndarray, results, camera, state: dict) -> dict:
    road_zones = getattr(camera, "road_zones", None) or []
    stop_zones = getattr(camera, "stop_zones", None) or []

    h, w           = frame.shape[:2]
    forbidden_mask = np.zeros((h, w), dtype=np.uint8)
    for zone in road_zones:
        cv2.fillPoly(forbidden_mask, [np.array(zone, dtype=np.int32)], 255)
    for zone in stop_zones:
        cv2.fillPoly(forbidden_mask, [np.array(zone, dtype=np.int32)], 0)

    fps: float     = state.get("_fps", 25)
    frame_num: int = state.get("_is_frame_num", 0)
    current_time   = frame_num / fps

    last_positions  : dict = state.setdefault("_is_last_pos",   {})
    stop_start_time : dict = state.setdefault("_is_stop_start", {})
    statuses        : dict = state.setdefault("_is_statuses",   {})
    violation_fixed : dict = state.setdefault("_is_viol_fixed", {})

    STOP_THRESHOLD = 1
    MOVE_THRESHOLD = 2
    CAR_CLASSES    = {2, 3, 5, 7}

    violations = []

    if results is not None and results.boxes is not None and results.boxes.id is not None:
        boxes     = results.boxes.xyxy.cpu().numpy()
        track_ids = results.boxes.id.cpu().numpy().astype(int)
        cls_ids   = results.boxes.cls.cpu().numpy().astype(int)

        for box, tid, cls in zip(boxes, track_ids, cls_ids):
            if cls not in CAR_CLASSES:
                continue
            cx     = int((box[0] + box[2]) / 2)
            cy     = int((box[1] + box[3]) / 2)
            center = (float(cx), float(cy))

            cy_c         = min(cy, h - 1); cx_c = min(cx, w - 1)
            in_forbidden = bool(forbidden_mask[cy_c, cx_c] == 255)

            if tid not in statuses:
                statuses[tid]        = "moving"
                last_positions[tid]  = center
                stop_start_time[tid] = None
                violation_fixed[tid] = False

            if violation_fixed[tid]:
                violations.append({"box": tuple(map(int, box)), "track_id": int(tid)})
                continue

            disp      = np.linalg.norm(np.array(center) - np.array(last_positions[tid]))
            last_positions[tid] = center
            is_moving = disp >= MOVE_THRESHOLD

            if is_moving:
                statuses[tid]        = "moving"
                stop_start_time[tid] = None
            elif in_forbidden:
                if stop_start_time[tid] is None:
                    stop_start_time[tid] = current_time
                stop_duration = current_time - stop_start_time[tid]
                if stop_duration >= STOP_THRESHOLD:
                    statuses[tid]        = "violation"
                    violation_fixed[tid] = True
                    print(f"[cam {camera.id}] НАРУШЕНИЕ стоянки! track_id={tid}, стоит {stop_duration:.1f}с")
                    violations.append({"box": tuple(map(int, box)), "track_id": int(tid)})
                else:
                    statuses[tid] = "stopped"
            else:
                statuses[tid]        = "stopped"
                stop_start_time[tid] = None

    state["_is_frame_num"] = frame_num + 1
    return {"violations": violations, "road_zones": road_zones, "stop_zones": stop_zones}


def _detect_pedestrian(frame: np.ndarray, results, camera, state: dict) -> dict:
    road_zones      = getattr(camera, "road_zones",      None) or []
    crosswalk_zones = getattr(camera, "crosswalk_zones", None) or []

    h, w        = frame.shape[:2]
    danger_mask = np.zeros((h, w), dtype=np.uint8)
    for zone in road_zones:
        cv2.fillPoly(danger_mask, [np.array(zone, dtype=np.int32)], 255)
    for zone in crosswalk_zones:
        cv2.fillPoly(danger_mask, [np.array(zone, dtype=np.int32)], 0)

    violated_ids: set = state.setdefault("_ped_violated", set())
    pedestrians = []

    if results is not None and results.boxes is not None:
        boxes   = results.boxes.xyxy.cpu().numpy()
        cls_ids = results.boxes.cls.cpu().numpy().astype(int)
        confs   = results.boxes.conf.cpu().numpy()
        for box, cls, conf in zip(boxes, cls_ids, confs):
            if cls != 0:
                continue
            if conf < 0.35:
                continue
            x1, y1, x2, y2 = map(int, box)
            foot_x   = (x1 + x2) // 2
            foot_y   = y2
            foot_y_c = min(foot_y, h - 1)
            foot_x_c = min(foot_x, w - 1)
            on_danger = bool(danger_mask[foot_y_c, foot_x_c] == 255)
            if on_danger:
                key = (x1, y1, x2, y2)
                if key not in violated_ids:
                    violated_ids.add(key)
                    print(f"[cam {camera.id}] Пешеход на проезжей части вне перехода!")
                pedestrians.append({"box": (x1, y1, x2, y2)})

    return {"pedestrians": pedestrians, "road_zones": road_zones, "crosswalk_zones": crosswalk_zones}


# ── Отрисовка инцидентов ──────────────────────────────────────────────────────

def draw_incidents(frame: np.ndarray, incidents: dict, filters: list[str]) -> np.ndarray:
    result = frame.copy()
    keys   = list(incidents.keys()) if "all" in filters else filters

    for key in keys:
        data = incidents.get(key)
        if not data:
            continue

        if key == "traffic_jam":
            COLOR = (26, 165, 246)
            _fill_zones(result, data.get("road_zones", []), COLOR, alpha=0.08, border=1)
            for jam in data.get("jams", []):
                x1, y1, x2, y2 = jam["box"]
                overlay = result.copy()
                cv2.rectangle(overlay, (x1, y1), (x2, y2), COLOR, -1)
                cv2.addWeighted(overlay, 0.3, result, 0.7, 0, result)
                cv2.rectangle(result, (x1, y1), (x2, y2), COLOR, 2)
                label  = f"Затор  {jam['avg_speed']:.0f} км/ч  ({jam['vehicle_count']} авт.)"
                result = _label_box(result, label, x1, y1, COLOR)

        elif key == "illegal_stop":
            ROAD_COLOR = (200, 200, 200)
            STOP_COLOR = (0, 200, 0)
            VIOL_COLOR = (0, 0, 255)
            _fill_zones(result, data.get("road_zones", []), ROAD_COLOR, alpha=0.10, border=1)
            _fill_zones(result, data.get("stop_zones", []), STOP_COLOR, alpha=0.15, border=2)
            for v in data.get("violations", []):
                x1, y1, x2, y2 = v["box"]
                cv2.rectangle(result, (x1, y1), (x2, y2), VIOL_COLOR, 2)
                result = _label_box(result, "Стоянка в неположенном месте", x1, y1, VIOL_COLOR)

        elif key == "pedestrian":
            ROAD_COLOR  = (200, 200, 200)
            CROSS_COLOR = (0, 200, 100)
            PED_COLOR   = (50, 130, 246)
            _fill_zones(result, data.get("road_zones",      []), ROAD_COLOR,  alpha=0.08, border=1)
            _fill_zones(result, data.get("crosswalk_zones", []), CROSS_COLOR, alpha=0.15, border=2)
            for p in data.get("pedestrians", []):
                x1, y1, x2, y2 = p["box"]
                cv2.rectangle(result, (x1, y1), (x2, y2), PED_COLOR, 2)
                result = _label_box(result, "Пешеход на проезжей части вне перехода", x1, y1, PED_COLOR)

    return result


# ── Сохранение инцидента ──────────────────────────────────────────────────────

def _save_incident(camera, incident_type: str, frame: np.ndarray,
                   boxes: list, label: str, box_color: tuple,
                   last_saved: dict):
    key = (camera.id, incident_type)
    now = time.time()

    if now - last_saved.get(key, 0) < INCIDENT_SAVE_COOLDOWN:
        return

    last_saved[key] = now

    filename = None
    if SAVE_INCIDENT_SCREENSHOTS:
        screenshot = frame.copy()
        for (x1, y1, x2, y2) in boxes:
            cv2.rectangle(screenshot, (x1, y1), (x2, y2), box_color, 2)
            bbox_f  = _FONT.getbbox(label)
            tw, th  = bbox_f[2] - bbox_f[0], bbox_f[3] - bbox_f[1]
            cv2.rectangle(screenshot, (x1, y1 - th - 8), (x1 + tw + 4, y1), box_color, -1)
            screenshot = _put_text(screenshot, label, (x1 + 2, y1 - th - 6), (0, 0, 0))

        ts       = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        filename = f"{camera.id}_{incident_type}_{ts}.jpg"
        try:
            cv2.imwrite(os.path.join(INCIDENTS_PHOTOS_DIR, filename), screenshot)
        except Exception as e:
            print(f"[incident] Ошибка сохранения скриншота: {e}")
            filename = None

    try:
        db = SessionLocal()
        db.add(Incident(
            date              = datetime.now(timezone.utc),
            camera            = camera.name,
            notification_text = label,
            screenshot_name   = filename,
            severity          = 1,
        ))
        db.commit()
        print(f"[incident] камера={camera.name} тип={incident_type} файл={filename}")

        import threading
        inc_date = datetime.now(timezone.utc)
        photo_fp = os.path.join(INCIDENTS_PHOTOS_DIR, filename) if filename else None
        threading.Thread(
            target=notify_incident,
            args=(camera.name, label, 1, inc_date, photo_fp),
            daemon=True
        ).start()

    except Exception as e:
        print(f"[incident] Ошибка записи в БД: {e}")
    finally:
        db.close()


# ── Сброс состояния детекторов ────────────────────────────────────────────────

def _reset_detector_state(worker_state: dict):
    keys_to_clear = [
        "_is_last_pos", "_is_stop_start", "_is_statuses", "_is_viol_fixed", "_is_frame_num",
        "_ped_violated",
        "_tj_vehicles", "_tj_last_boxes", "_tj_frame_count",
    ]
    for k in keys_to_clear:
        worker_state.pop(k, None)
    print("[camera_worker] Состояние детекторов сброшено (изменились зоны)")


# ── Camera worker ─────────────────────────────────────────────────────────────

async def camera_worker(camera):
    print(f"[camera_worker] Камера {camera.id} ({camera.name}) запускается...")

    cap = cv2.VideoCapture(camera.url)
    fps = cap.get(cv2.CAP_PROP_FPS)
    if fps <= 0 or fps > 120:
        fps = 25

    model = YOLO("yolov8n.pt")

    worker_state: dict = {
        "_model":      model,
        "_fps":        fps,
        "_last_saved": {},
    }

    camera_states[camera.id] = {
        "frame":     None,
        "incidents": {"traffic_jam": None, "illegal_stop": None, "pedestrian": None},
    }

    CAR_CLASSES = [2, 3, 5, 7]
    PED_CLASSES = [0]
    ALL_CLASSES = list(set(CAR_CLASSES + PED_CLASSES))

    error_count        = 0
    MAX_ERRORS         = 10
    last_zones_refresh = 0.0
    _current_incidents = None

    _prev_zones = {
        "road_zones":      list(camera.road_zones      or []),
        "stop_zones":      list(camera.stop_zones      or []),
        "crosswalk_zones": list(camera.crosswalk_zones or []),
    }

    while True:
        try:
            now = time.time()
            if now - last_zones_refresh >= CAMERA_ZONES_REFRESH_INTERVAL:
                try:
                    db    = SessionLocal()
                    fresh = db.query(Camera).filter(Camera.id == camera.id).first()
                    if fresh:
                        _current_incidents = _get_camera_incidents(camera.id)
                        new_zones = {
                            "road_zones":      list(fresh.road_zones      or []),
                            "stop_zones":      list(fresh.stop_zones      or []),
                            "crosswalk_zones": list(fresh.crosswalk_zones or []),
                        }
                        if new_zones != _prev_zones:
                            camera.road_zones      = fresh.road_zones      or []
                            camera.stop_zones      = fresh.stop_zones      or []
                            camera.crosswalk_zones = fresh.crosswalk_zones or []
                            camera.lane_lines      = fresh.lane_lines      or []
                            _reset_detector_state(worker_state)
                            _prev_zones = new_zones
                finally:
                    db.close()
                last_zones_refresh = now

            if _current_incidents is False:
                print(f"[camera_worker] Камера {camera.id} ({camera.name}): отключена, завершаю воркер")
                cap.release()
                _running_camera_ids.discard(camera.id)
                return

            ret, frame = cap.read()
            if not ret:
                error_count += 1
                print(f"[camera_worker] Камера {camera.id}: не удалось прочитать кадр (ошибка #{error_count})")
                if error_count >= MAX_ERRORS:
                    print(f"[camera_worker] Камера {camera.id}: переподключение...")
                    cap.release()
                    await asyncio.sleep(3)
                    cap = cv2.VideoCapture(camera.url)
                    error_count = 0
                await asyncio.sleep(1)
                continue

            error_count = 0

            try:
                results = model.track(
                    frame, persist=True, verbose=False,
                    classes=ALL_CLASSES, conf=0.25, iou=0.45
                )[0]
            except Exception as e:
                print(f"[camera_worker] Камера {camera.id}: ошибка model.track — {e}")
                await asyncio.sleep(0.1)
                continue

            last_saved = worker_state["_last_saved"]

            _inc    = _current_incidents
            run_tj  = run_is = run_ped = True
            if _inc is not None:
                run_tj  = "traffic_jam"  in _inc
                run_is  = "illegal_stop" in _inc
                run_ped = "pedestrian"   in _inc

            tj_data = None
            if run_tj:
                try:
                    tj_data = _detect_traffic_jam(frame, results, camera, worker_state)
                    if tj_data and tj_data.get("jams"):
                        _save_incident(camera, "traffic_jam", frame,
                                       [j["box"] for j in tj_data["jams"]],
                                       "Затор", (26, 165, 246), last_saved)
                except Exception as e:
                    print(f"[camera_worker] Камера {camera.id}: ошибка _detect_traffic_jam — {e}")
                    tj_data = None

            is_data = None
            if run_is:
                try:
                    is_data = _detect_illegal_stop(frame, results, camera, worker_state)
                    if is_data and is_data.get("violations"):
                        _save_incident(camera, "illegal_stop", frame,
                                       [v["box"] for v in is_data["violations"]],
                                       "Стоянка в неположенном месте", (0, 0, 255), last_saved)
                except Exception as e:
                    print(f"[camera_worker] Камера {camera.id}: ошибка _detect_illegal_stop — {e}")
                    is_data = None

            ped_data = None
            if run_ped:
                try:
                    ped_data = _detect_pedestrian(frame, results, camera, worker_state)
                    if ped_data and ped_data.get("pedestrians"):
                        _save_incident(camera, "pedestrian", frame,
                                       [p["box"] for p in ped_data["pedestrians"]],
                                       "Пешеход на проезжей части вне перехода",
                                       (50, 130, 246), last_saved)
                except Exception as e:
                    print(f"[camera_worker] Камера {camera.id}: ошибка _detect_pedestrian — {e}")
                    ped_data = None

            camera_states[camera.id] = {
                "frame": frame,
                "incidents": {
                    "traffic_jam":  tj_data,
                    "illegal_stop": is_data,
                    "pedestrian":   ped_data,
                },
            }

        except Exception as e:
            print(f"[camera_worker] Камера {camera.id}: необработанная ошибка — {e}")

        await asyncio.sleep(0.03)


def _start_camera_worker(cam):
    _running_camera_ids.add(cam.id)
    asyncio.create_task(camera_worker(cam))


async def _camera_watchdog():
    while True:
        await asyncio.sleep(30)
        db = SessionLocal()
        try:
            cameras = db.query(Camera).all()
            for cam in cameras:
                if cam.id in _running_camera_ids:
                    continue
                inc = _get_camera_incidents(cam.id)
                if inc is not False:
                    print(f"[watchdog] Камера {cam.id} ({cam.name}): запускаю воркер")
                    _start_camera_worker(cam)
        except Exception as e:
            print(f"[watchdog] Ошибка: {e}")
        finally:
            db.close()


# ── API routes ────────────────────────────────────────────────────────────────

@router.get("/cameras/status")
def get_cameras_status(db: Session = Depends(get_db)):
    result = {}
    for cam in db.query(Camera):
        result[cam.name] = cam.id in _running_camera_ids
    return result


@router.websocket("/ws")
async def video_stream(ws: WebSocket, db: Session = Depends(get_db)):
    global camera_tasks_started

    await ws.accept()
    print("Клиент подключился")

    try:
        data = await ws.receive_json()

        camera_name     = data.get("camera")
        filters         = data.get("filters", ["all"])
        display_filters = data.get("display_filters", ["all"])

        camera = db.query(Camera).filter(Camera.name == camera_name).first()

        if not camera:
            await ws.send_text("ERROR: Камера не найдена")
            return

        if not camera_tasks_started:
            cameras = db.query(Camera).all()
            for cam in cameras:
                asyncio.create_task(camera_worker(cam))
            camera_tasks_started = True

        while camera_states.get(camera.id, {}).get("frame") is None:
            await asyncio.sleep(0.1)

        h, w = camera_states[camera.id]["frame"].shape[:2]
        await ws.send_text(f"RES:{w}x{h}")

        while True:
            try:
                upd = await asyncio.wait_for(ws.receive_json(), timeout=0.01)
                if isinstance(upd, dict) and upd.get("type") == "set_display_filters":
                    display_filters = upd.get("display_filters", ["all"])
                elif isinstance(upd, dict) and upd.get("type") == "set_filters":
                    filters = upd.get("filters", ["all"])
            except (asyncio.TimeoutError, Exception):
                pass

            state = camera_states.get(camera.id)

            if not state or state["frame"] is None:
                await asyncio.sleep(0.05)
                continue

            frame = draw_incidents(state["frame"].copy(), state["incidents"], display_filters)
            ret, buffer = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 75])

            if ret:
                await ws.send_bytes(buffer.tobytes())

            await asyncio.sleep(0.03)

    except WebSocketDisconnect:
        print("Клиент отключился")
    except Exception as e:
        print(f"[ws] Ошибка: {e}")


@router.post("/camera-incidents")
async def set_camera_incidents(
    data: dict = Body(...),
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    from fastapi import HTTPException
    if not current_user:
        raise HTTPException(status_code=401, detail="Не авторизован")
    admin = db.query(SuperAdmin).filter(SuperAdmin.email == current_user).first()
    if not admin:
        raise HTTPException(status_code=403, detail="Нет прав")
    cam = db.query(Camera).filter(Camera.name == data.get("name", "")).first()
    if not cam:
        raise HTTPException(status_code=404, detail="Камера не найдена")
    try:
        _set_camera_incidents(cam.id, data.get("incidents"))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"ok": True}


@router.get("/camera-zones")
async def get_camera_zones(
    name: str,
    db: Session = Depends(get_db)
):
    from fastapi import HTTPException
    camera = db.query(Camera).filter(Camera.name == name).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Камера не найдена")
    return {
        "name":            camera.name,
        "road_zones":      camera.road_zones or [],
        "stop_zones":      camera.stop_zones or [],
        "crosswalk_zones": camera.crosswalk_zones or [],
        "lane_lines":      camera.lane_lines or [],
        "incidents":       _get_camera_incidents(camera.id),
    }


@router.post("/camera-zones")
async def save_camera_zones(
    data: dict = Body(...),
    current_user: str | bool = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    from fastapi import HTTPException
    camera_name = data.get("name")
    zones       = data.get("zones", {})

    camera = db.query(Camera).filter(Camera.name == camera_name).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Камера не найдена")

    for zone_key in ["road_zones", "stop_zones", "crosswalk_zones", "lane_lines"]:
        polygons  = zones.get(zone_key, [])
        validated = []
        for poly in polygons:
            if not isinstance(poly, list) or len(poly) < 3:
                continue
            clean_poly = []
            for point in poly:
                if isinstance(point, (list, tuple)) and len(point) == 2:
                    try:
                        clean_poly.append([int(point[0]), int(point[1])])
                    except (ValueError, TypeError):
                        continue
            if len(clean_poly) >= 3:
                validated.append(clean_poly)

        setattr(camera, zone_key, validated)
        flag_modified(camera, zone_key)

    db.commit()
    db.refresh(camera)
    return {"ok": True, "message": f"Зоны камеры '{camera_name}' сохранены"}
