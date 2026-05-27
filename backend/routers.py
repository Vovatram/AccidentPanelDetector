from fastapi import APIRouter, Depends, Body, Query, HTTPException
from fastapi.websockets import WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
from sqlalchemy import func, or_, and_
from pydantic import EmailStr
from datetime import datetime, timedelta, timezone
from typing import Dict, Any
import asyncio
import pathlib
import random
import string

from models import (
    SessionLocal, User, Camera, Incident, SuperAdmin, Data, AppSettings,
    EmailSchema, get_db, get_current_user, create_access_token,
    ph, INCIDENTS_PHOTOS_DIR, _get_camera_incidents,
)
from notifications import send_email_sync

router = APIRouter()


@router.get("/counter")
def get_counter(numb, db: Session = Depends(get_db)):
    print(numb)
    return {"value": 1}


@router.get("/cameras")
def get_cameras(db: Session = Depends(get_db)):
    a = {}
    for i in db.query(Camera):
        a[i.name] = [i.coord, i.url]
    return a


@router.patch("/counter")
def increment_counter(
    form_data: Dict[str, Any] = Body(...),
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return {"value": 1}


@router.post("/login")
async def login(form_data: dict = Body(...), db: Session = Depends(get_db)):
    print(form_data)
    user = db.query(User).filter(User.email == form_data['email']).first()

    if not user:
        return {"error": 'Неверный email'}

    print(str(form_data['password']), str(user.password_hash),
          str(form_data['password']) == str(user.password_hash))
    try:
        access_token = create_access_token(data={"sub": form_data['email']})
        if str(form_data['password']) == str(user.password_hash):
            print(32)
            return {"access_token": access_token, 'url': 'map'}
        ph.verify(user.password_hash, form_data['password'])
        print(22)
        access_token = create_access_token(data={"sub": user.email})
        return {"access_token": access_token, 'url': 'map'}
    except Exception:
        return {"error": 'Неверный email или пароль_'}


@router.post("/register")
async def register_user(data: dict = Body(...), db: Session = Depends(get_db)):
    name     = data.get("name")
    email    = data.get("email")
    password = data.get("password")

    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=409, detail="Пользователь с таким email уже существует")

    hashed_password = ph.hash(password)
    verify_code = ''.join(random.choices(string.digits, k=6))
    db_user = User(
        name=name,
        email=email,
        password_hash=hashed_password,
        email_verify_code=verify_code,
    )
    db_data = Data(
        name     = email,
        data     = {'counter': 0},
        requests = {}
    )
    try:
        db.add(db_user)
        db.add(db_data)
        db.commit()
        db.refresh(db_user)
        db.refresh(db_data)
    except Exception as e:
        db.rollback()
        print(f"[register] Ошибка записи в БД: {e}")
        raise HTTPException(status_code=500, detail="Ошибка регистрации")
    try:
        send_email_sync(EmailSchema(
            to=email,
            subject="Подтверждение почты — Accident Detector",
            body=(
                f"Здравствуйте, {name}!\n\n"
                f"Ваш код подтверждения: {verify_code}\n\n"
                "Введите его на сайте для активации аккаунта.\n"
                "Если вы не регистрировались — проигнорируйте письмо."
            ),
        ))
    except Exception as e:
        print(f"[register] Ошибка отправки кода: {e}")


@router.post("/verify-email")
async def verify_email(data: dict = Body(...), db: Session = Depends(get_db)):
    email = data.get("email", "").strip().lower()
    code  = data.get("code", "").strip()
    user  = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    if not user.email_verify_code or user.email_verify_code != code:
        return {"ok": False, "error": "Неверный код"}
    user.email_verified    = "true"
    user.email_verify_code = None
    db.commit()
    return {"ok": True}


@router.get("/check-email")
async def check_email_availability(
    email: str = Query(...),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.email == email).first()
    try:
        EmailStr._validate(email)
        return {"available": user is None}
    except Exception:
        return {"available": 'Некорректная почта'}


@router.get("/newcam")
async def newcam(
    Nname, coord, url,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    db_data = Camera(
        name  = Nname,
        coord = [float(x) for x in coord.split(', ')],
        url   = url,
    )
    db.add(db_data)
    db.commit()
    db.refresh(db_data)


@router.delete("/cameras/{name}")
async def delete_camera(
    name: str,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    cam = db.query(Camera).filter(Camera.name == name).first()
    if not cam:
        raise HTTPException(status_code=404, detail="Камера не найдена")
    db.delete(cam)
    db.commit()
    return {"ok": True}


@router.get("/user/profile")
async def get_profile(
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not current_user:
        raise HTTPException(status_code=401, detail="Не авторизован")
    user = db.query(User).filter(User.email == current_user).first()
    if not user:
        raise HTTPException(status_code=404, detail="Не найден")
    return {
        "email":    user.email,
        "name":     user.name,
        "telegram": user.telegram,
    }


@router.post("/superadmins")
async def add_superadmin(data: dict = Body(...), db: Session = Depends(get_db)):
    email = data.get("email", "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="email обязателен")
    if db.query(SuperAdmin).filter(SuperAdmin.email == email).first():
        raise HTTPException(status_code=409, detail="Уже существует")
    db.add(SuperAdmin(email=email))
    db.commit()
    return {"ok": True, "email": email}


@router.delete("/superadmins/{email}")
async def remove_superadmin(email: str, db: Session = Depends(get_db)):
    admin = db.query(SuperAdmin).filter(SuperAdmin.email == email).first()
    if not admin:
        raise HTTPException(status_code=404, detail="Не найден")
    db.delete(admin)
    db.commit()
    return {"ok": True}


@router.get("/superadmins")
async def list_superadmins(db: Session = Depends(get_db)):
    return [a.email for a in db.query(SuperAdmin).all()]


@router.get("/incidents/feed")
async def list_incidents_feed(
    cameras:   str  = Query(None),
    types:     str  = Query(None),
    time_from: str  = Query(None),
    page:      int  = Query(1, ge=1),
    page_size: int  = Query(12, ge=1, le=100),
    has_photo:    bool = Query(False),
    has_mistakes: bool = Query(False),
    db: Session = Depends(get_db)
):
    q = db.query(Incident)
    if has_photo:
        q = q.filter(Incident.screenshot_name != None)
    if has_mistakes:
        q = q.filter(func.jsonb_array_length(Incident.mistake) > 0)
    if cameras:
        cam_list = [c.strip() for c in cameras.split(',') if c.strip()]
        if cam_list:
            q = q.filter(Incident.camera.in_(cam_list))
    if types:
        type_list = [t.strip() for t in types.split(',') if t.strip()]
        if type_list:
            q = q.filter(Incident.notification_text.in_(type_list))
    if time_from:
        try:
            dt = datetime.fromisoformat(time_from.replace("Z", "+00:00"))
            q  = q.filter(Incident.date >= dt)
        except Exception:
            pass
    total = q.count()
    items = q.order_by(Incident.date.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {
        "total":     total,
        "page":      page,
        "page_size": page_size,
        "items": [
            {
                "id":                inc.id,
                "date":              inc.date.isoformat() if inc.date else None,
                "camera":            inc.camera,
                "notification_text": inc.notification_text,
                "severity":          inc.severity,
                "screenshot_name":   inc.screenshot_name,
                "mistake":           inc.mistake or [],
            }
            for inc in items
        ],
    }


@router.get("/incidents/{incident_id}/adjacent")
async def get_adjacent_incidents(
    incident_id: int,
    cameras:      str  = Query(None),
    types:        str  = Query(None),
    time_from:    str  = Query(None),
    has_photo:    bool = Query(False),
    has_mistakes: bool = Query(False),
    db: Session = Depends(get_db)
):
    inc = db.query(Incident).filter(Incident.id == incident_id).first()
    if not inc:
        raise HTTPException(status_code=404, detail="Не найден")

    def base_q():
        q = db.query(Incident.id, Incident.date)
        if has_photo:
            q = q.filter(Incident.screenshot_name != None)
        if has_mistakes:
            q = q.filter(func.jsonb_array_length(Incident.mistake) > 0)
        if cameras:
            cam_list = [c.strip() for c in cameras.split(',') if c.strip()]
            if cam_list:
                q = q.filter(Incident.camera.in_(cam_list))
        if types:
            type_list = [t.strip() for t in types.split(',') if t.strip()]
            if type_list:
                q = q.filter(Incident.notification_text.in_(type_list))
        if time_from:
            try:
                dt = datetime.fromisoformat(time_from.replace("Z", "+00:00"))
                q = q.filter(Incident.date >= dt)
            except Exception:
                pass
        return q

    # Список отсортирован date DESC, id DESC → «пред» = старее, «след» = новее
    prev_row = base_q().filter(
        or_(Incident.date < inc.date,
            and_(Incident.date == inc.date, Incident.id < inc.id))
    ).order_by(Incident.date.desc(), Incident.id.desc()).first()

    next_row = base_q().filter(
        or_(Incident.date > inc.date,
            and_(Incident.date == inc.date, Incident.id > inc.id))
    ).order_by(Incident.date.asc(), Incident.id.asc()).first()

    return {
        "prev_id": prev_row[0] if prev_row else None,
        "next_id": next_row[0] if next_row else None,
    }


@router.get("/incidents/{incident_id}")
async def get_incident(incident_id: int, db: Session = Depends(get_db)):
    inc = db.query(Incident).filter(Incident.id == incident_id).first()
    if not inc:
        raise HTTPException(status_code=404, detail="Не найден")
    return {
        "id":                inc.id,
        "date":              inc.date.isoformat() if inc.date else None,
        "camera":            inc.camera,
        "notification_text": inc.notification_text,
        "severity":          inc.severity,
        "screenshot_name":   inc.screenshot_name,
        "screenshot_url":    f"/incidents/photo/{inc.screenshot_name}" if inc.screenshot_name else None,
        "mistake":           inc.mistake or [],
    }


@router.post("/incidents/{incident_id}/report_error")
async def report_incident_error(
    incident_id: int,
    data: dict = Body(...),
    db: Session = Depends(get_db)
):
    inc = db.query(Incident).filter(Incident.id == incident_id).first()
    if not inc:
        raise HTTPException(status_code=404, detail="Не найден")

    comment  = {"text": data.get("text", "").strip(), "date": datetime.now(timezone.utc).isoformat()}
    mistakes = list(inc.mistake or [])
    mistakes.append(comment)
    inc.mistake = mistakes
    flag_modified(inc, "mistake")
    db.commit()
    return {"ok": True, "mistake_count": len(mistakes)}


@router.get("/incidents/photo/{filename}")
async def serve_incident_photo(filename: str):
    path = pathlib.Path(INCIDENTS_PHOTOS_DIR) / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="Файл не найден")
    return FileResponse(str(path), media_type="image/jpeg")


@router.get("/stats/cameras")
async def list_cameras_for_stats(db: Session = Depends(get_db)):
    rows = db.query(Incident.camera).distinct().all()
    return [r[0] for r in rows]


@router.websocket("/ws/stats")
async def stats_stream(ws: WebSocket, db: Session = Depends(get_db)):
    await ws.accept()
    print("[ws/stats] Клиент подключился")

    TEXT_TO_TYPE = {
        "Затор":                                  "Затор",
        "Стоянка в неположенном месте":           "Стоянка в неположенном месте",
        "Пешеход на проезжей части вне перехода": "Пешеход на проезжей части вне перехода",
    }

    async def compute_and_send(params):
        cameras_param = params.get("cameras")
        camera_param  = params.get("camera")
        if cameras_param and isinstance(cameras_param, list) and len(cameras_param) > 0:
            camera_filter_list = cameras_param
        elif camera_param:
            camera_filter_list = [camera_param]
        else:
            camera_filter_list = None

        types_filter = params.get("types") or None
        step         = max(int(params.get("step", 3600)), 60)
        try:
            time_from = datetime.fromisoformat(params["time_from"].replace("Z", "+00:00"))
        except Exception:
            time_from = datetime.now(timezone.utc) - timedelta(hours=24)

        MAX_BUCKETS = 300
        time_to     = time_from + timedelta(seconds=step * MAX_BUCKETS)

        q = db.query(Incident).filter(Incident.date >= time_from, Incident.date < time_to)
        if camera_filter_list:
            q = q.filter(Incident.camera.in_(camera_filter_list))
        incidents = q.order_by(Incident.date.asc()).all()

        def norm_type(t):
            return TEXT_TO_TYPE.get(t, t)

        all_cameras = sorted(set(i.camera for i in incidents))
        all_types   = sorted(set(norm_type(i.notification_text) for i in incidents))
        if types_filter:
            all_types = [t for t in all_types if t in types_filter]

        step_sec    = step
        t0          = time_from.timestamp()
        n_buckets   = MAX_BUCKETS
        buckets_data = [
            {cam: {t: 0 for t in all_types} for cam in all_cameras}
            for _ in range(n_buckets)
        ]

        for inc in incidents:
            idx = int((inc.date.timestamp() - t0) / step_sec)
            if 0 <= idx < n_buckets:
                nt = norm_type(inc.notification_text)
                if nt in all_types and inc.camera in all_cameras:
                    buckets_data[idx][inc.camera][nt] += 1

        fmt     = "%H:%M" if step < 86400 else "%d.%m"
        buckets = []
        last_nonempty = -1
        for i, data in enumerate(buckets_data):
            ts_i  = time_from + timedelta(seconds=step * i)
            total = sum(v for cam in data.values() for v in cam.values())
            if total > 0:
                last_nonempty = i
            buckets.append({
                "label":   ts_i.strftime(fmt),
                "ts_from": ts_i.isoformat(),
                "ts_to":   (ts_i + timedelta(seconds=step)).isoformat(),
                "data":    data,
            })

        trim_to = min(last_nonempty + 25, len(buckets))
        buckets = buckets[:max(trim_to, 1)]

        await ws.send_json({
            "type":      "stats",
            "step":      step,
            "time_from": time_from.isoformat(),
            "cameras":   all_cameras,
            "types":     all_types,
            "buckets":   buckets,
        })

    try:
        params = await ws.receive_json()
        await compute_and_send(params)

        while True:
            try:
                new_params = await asyncio.wait_for(ws.receive_json(), timeout=60)
                params     = new_params
                await compute_and_send(params)
            except asyncio.TimeoutError:
                pass

    except WebSocketDisconnect:
        print("[ws/stats] Клиент отключился")
    except Exception as e:
        print(f"[ws/stats] Ошибка: {e}")


@router.get("/admin/settings")
async def get_settings(
    current_user: str | bool = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user:
        raise HTTPException(status_code=401, detail="Не авторизован")
    if not db.query(SuperAdmin).filter(SuperAdmin.email == current_user).first():
        raise HTTPException(status_code=403, detail="Нет прав")
    row = db.query(AppSettings).order_by(AppSettings.id).first()
    return row.settings if row else {}


@router.patch("/admin/settings")
async def update_settings(
    data: dict = Body(...),
    current_user: str | bool = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user:
        raise HTTPException(status_code=401, detail="Не авторизован")
    if not db.query(SuperAdmin).filter(SuperAdmin.email == current_user).first():
        raise HTTPException(status_code=403, detail="Нет прав")
    from sqlalchemy.orm.attributes import flag_modified
    ALLOWED = {
        "incident_save_cooldown", "camera_zones_refresh_interval",
        "save_incident_screenshots", "default_speed_limit_kmh",
        "base_px_per_meter", "acc_display_frames", "watchdog_interval",
    }
    row = db.query(AppSettings).order_by(AppSettings.id).first()
    if not row:
        row = AppSettings(settings={})
        db.add(row)
    current = dict(row.settings or {})
    for k, v in data.items():
        if k in ALLOWED:
            current[k] = v
    row.settings = current
    flag_modified(row, "settings")
    db.commit()
    return {"ok": True, "settings": row.settings}


@router.get("/notifications")
async def notifi(
    cameras, time, paramU,
    current_user: str | bool = Depends(get_current_user)
):
    notifications = []
    return {'user': current_user, 'notifications': notifications}
