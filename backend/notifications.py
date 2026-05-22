from fastapi import APIRouter, Depends, Body, BackgroundTasks
from fastapi.websockets import WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
from jose import jwt
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv
import asyncio
import os

from models import (
    SessionLocal, User, SuperAdmin, Incident, EmailSchema,
    get_db, get_current_user, SECRET_KEY, ALGORITHM,
)

load_dotenv()

router = APIRouter()

RESEND_API_KEY   = os.getenv("RESEND_API_KEY")
RESEND_FROM      = os.getenv("RESEND_FROM", "no-reply@sendem.xyz")
RESEND_FROM_NAME = os.getenv("RESEND_FROM_NAME", "Accident Detector")
RESEND_API_URL   = "https://api.resend.com/emails"

TG_BOT_TOKEN    = os.getenv("TG_BOT_TOKEN")
TG_BOT_USERNAME = "@Accident_DetectorBot"
TG_BASE_URL     = f"https://api.telegram.org/bot{TG_BOT_TOKEN}"

_tg_chat_id_cache: dict[str, str] = {}
_tg_update_offset: int = 0


def _poll_telegram_updates():
    global _tg_update_offset
    import requests as req_lib
    try:
        resp = req_lib.get(
            f"{TG_BASE_URL}/getUpdates",
            params={"offset": _tg_update_offset, "limit": 100, "timeout": 0},
            timeout=15,
        ).json()
        if not resp.get("ok"):
            return
        updates = resp.get("result", [])
        if not updates:
            return
        db = SessionLocal()
        try:
            for upd in updates:
                _tg_update_offset = max(_tg_update_offset, upd["update_id"] + 1)
                msg = upd.get("message") or upd.get("edited_message")
                if not msg:
                    continue
                chat     = msg.get("chat", {})
                username = chat.get("username", "").lower()
                chat_id  = str(chat.get("id", ""))
                if not username or not chat_id:
                    continue

                _tg_chat_id_cache[username] = chat_id

                user = db.query(User).filter(User.telegram.ilike(username)).first()
                if user and user.telegram_chat_id != chat_id:
                    user.telegram_chat_id = chat_id
                    db.commit()
                    print(f"[telegram] chat_id сохранён для @{username}: {chat_id}")

                if msg.get("text", "").startswith("/start"):
                    reply = (
                        "✅ Привязка подтверждена! Вы будете получать Telegram-уведомления."
                        if user else
                        "⚠️ Ваш @username не найден в системе. "
                        "Сначала укажите его в настройках на сайте."
                    )
                    try:
                        req_lib.post(
                            f"{TG_BASE_URL}/sendMessage",
                            json={"chat_id": chat_id, "text": reply},
                            timeout=10,
                        )
                    except Exception:
                        pass
        finally:
            db.close()
    except Exception as e:
        print(f"[telegram] Ошибка поллинга: {e}")


async def _telegram_poll_loop():
    while True:
        try:
            await asyncio.get_event_loop().run_in_executor(None, _poll_telegram_updates)
        except Exception as e:
            print(f"[telegram] poll loop error: {e}")
        await asyncio.sleep(10)


def send_telegram(chat_id: str, text: str, photo_path: str | None = None) -> bool:
    import requests as req_lib
    if not chat_id:
        return False
    try:
        if photo_path and os.path.exists(photo_path):
            with open(photo_path, "rb") as f:
                resp = req_lib.post(
                    f"{TG_BASE_URL}/sendPhoto",
                    data={"chat_id": chat_id, "caption": text, "parse_mode": "HTML"},
                    files={"photo": f},
                    timeout=30,
                )
        else:
            resp = req_lib.post(
                f"{TG_BASE_URL}/sendMessage",
                json={"chat_id": chat_id, "text": text, "parse_mode": "HTML"},
                timeout=10,
            )
        ok = resp.json().get("ok", False)
        if not ok:
            print(f"[telegram] Ошибка: {resp.text}")
        return ok
    except Exception as e:
        print(f"[telegram] Исключение: {e}")
        return False


def send_email_sync(email: EmailSchema, photo_path: str | None = None):
    import requests as req_lib, base64 as _b64
    try:
        payload = {
            "from":    f"{RESEND_FROM_NAME} <{RESEND_FROM}>",
            "to":      [email.to],
            "subject": email.subject,
            "text":    email.body,
        }
        if photo_path and os.path.exists(photo_path):
            with open(photo_path, "rb") as f:
                payload["attachments"] = [{
                    "filename": os.path.basename(photo_path),
                    "content":  _b64.b64encode(f.read()).decode(),
                }]
        resp = req_lib.post(
            RESEND_API_URL,
            headers={
                "Authorization": f"Bearer {RESEND_API_KEY}",
                "Content-Type":  "application/json",
            },
            json=payload,
            timeout=15,
        )
        if resp.status_code == 200:
            print(f"[email] Отправлено на {email.to}")
        else:
            print(f"[email] Ошибка Resend {resp.status_code}: {resp.text}")
    except Exception as e:
        print(f"[email] Исключение: {e}")


def send_email_background(background_tasks: BackgroundTasks, email: EmailSchema):
    background_tasks.add_task(send_email_sync, email)


def notify_incident(camera_name: str, incident_type: str,
                    severity: int, date: datetime,
                    screenshot_path: str | None = None):
    db = SessionLocal()
    try:
        users = db.query(User).all()
        for user in users:
            notifs     = user.notifications or {}
            tg_subs    = notifs.get(f"tg:{camera_name}", None)
            email_subs = notifs.get(f"email:{camera_name}", None)

            want_email = (email_subs is not None and incident_type in email_subs)
            want_tg    = (user.telegram and tg_subs is not None
                          and incident_type in tg_subs)

            if not want_email and not want_tg:
                continue

            dt_str  = date.strftime("%d.%m.%Y %H:%M")
            subject = f"[Incident Detector] {incident_type} — {camera_name}"
            body    = (
                f"📷 Камера: {camera_name}\n"
                f"⚠️  Инцидент: {incident_type}\n"
                f"🔴 Тяжесть: {severity}\n"
                f"🕐 Время: {dt_str}"
            )
            tg_text = (
                f"<b>⚠️ {incident_type}</b>\n"
                f"📷 <i>{camera_name}</i>\n"
                f"🔴 Тяжесть: {severity}\n"
                f"🕐 {dt_str}"
            )

            if want_email:
                print('Попытка отправить письмо')
                try:
                    send_email_sync(
                        EmailSchema(to=user.email, subject=subject, body=body),
                        photo_path=screenshot_path,
                    )
                except Exception as e:
                    print(f"[notify] email error {user.email}: {e}")

            if want_tg:
                tg_chat_id = (user.telegram_chat_id
                              or _tg_chat_id_cache.get((user.telegram or "").lower()))
                if tg_chat_id:
                    send_telegram(tg_chat_id, tg_text, screenshot_path)
                else:
                    print(f"[notify] нет chat_id для @{user.telegram} — пользователь не запустил бота")

    except Exception as e:
        print(f"[notify_incident] Ошибка: {e}")
    finally:
        db.close()


async def notify_superadmins(subject: str, body: str):
    try:
        db = SessionLocal()
        admins = db.query(SuperAdmin).all()
        db.close()
    except Exception as e:
        print(f"[email] Ошибка получения суперадминов: {e}")
        return
    for admin in admins:
        send_email_sync(EmailSchema(to=admin.email, subject=subject, body=body))


# ── HTTP routes ───────────────────────────────────────────────────────────────

@router.get("/send-email")
async def send_verification_email(email, code, background_tasks: BackgroundTasks):
    email_data = EmailSchema(
        to=email,
        subject="Подтверждение почты",
        body=f"Ваш код подтверждения: {code}\n\nНе передавайте его никому!"
    )
    background_tasks.add_task(send_email_sync, email_data)
    return {"message": "Письмо отправлено (проверьте почту)"}


@router.post("/user/telegram")
async def set_telegram(
    data: dict = Body(...),
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not current_user:
        from fastapi import HTTPException
        raise HTTPException(status_code=401, detail="Не авторизован")
    username = data.get("telegram", "").strip().lstrip("@")
    user = db.query(User).filter(User.email == current_user).first()
    if not user:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    user.telegram = username or None
    db.commit()
    return {"ok": True, "telegram": user.telegram}


@router.post("/user/site-notifications")
async def save_site_notifications(
    data: dict = Body(...),
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not current_user:
        from fastapi import HTTPException
        raise HTTPException(status_code=401, detail="Не авторизован")
    camera_name   = data.get("camera")
    subscriptions = data.get("subscriptions", [])
    user = db.query(User).filter(User.email == current_user).first()
    if not user:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    notifs = dict(user.notifications or {})
    notifs[camera_name] = subscriptions
    user.notifications = notifs
    db.commit()
    return {"ok": True}


@router.get("/user/site-notifications")
async def get_site_notifications(
    camera: str,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not current_user:
        return {"subscriptions": [], "authenticated": False}
    user = db.query(User).filter(User.email == current_user).first()
    if not user:
        return {"subscriptions": [], "authenticated": False}
    notifs = user.notifications or {}
    return {
        "subscriptions": notifs.get(camera, []),
        "authenticated": True,
        "email": user.email,
    }


@router.post("/user/email-subscriptions")
async def save_email_subscriptions(
    data: dict = Body(...),
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not current_user:
        from fastapi import HTTPException
        raise HTTPException(status_code=401, detail="Не авторизован")
    camera_name   = data.get("camera")
    subscriptions = data.get("subscriptions", [])
    user = db.query(User).filter(User.email == current_user).first()
    if not user:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    notifs = dict(user.notifications or {})
    notifs[f"email:{camera_name}"] = subscriptions
    user.notifications = notifs
    flag_modified(user, "notifications")
    db.commit()
    return {"ok": True}


@router.post("/user/telegram-subscriptions")
async def save_telegram_subscriptions(
    data: dict = Body(...),
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not current_user:
        from fastapi import HTTPException
        raise HTTPException(status_code=401, detail="Не авторизован")
    camera_name   = data.get("camera")
    subscriptions = data.get("subscriptions", [])
    user = db.query(User).filter(User.email == current_user).first()
    if not user:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    notifs = dict(user.notifications or {})
    notifs[f"tg:{camera_name}"] = subscriptions
    user.notifications = notifs
    flag_modified(user, "notifications")
    db.commit()
    return {"ok": True}


# ── WebSocket /ws/notifications ───────────────────────────────────────────────

@router.websocket("/ws/notifications")
async def notifications_stream(ws: WebSocket, db: Session = Depends(get_db)):
    await ws.accept()
    print("[ws/notifications] Клиент подключился")

    TEXT_TO_TYPE = {
        "Затор":                                    "Затор",
        "Стоянка в неположенном месте":             "Стоянка в неположенном месте",
        "Пешеход на проезжей части вне перехода":   "Пешеход в неположенном месте",
    }

    try:
        data = await ws.receive_json()
        camera_name     = data.get("camera", "")
        _cams_init      = data.get("cameras")          # None если ключ не передан
        cameras_filter  = _cams_init if _cams_init is not None else []
        cameras_explicit = _cams_init is not None      # True — клиент явно задал список
        token           = data.get("token")
        time_range      = int(data.get("time_range", 3600))
        client_subs     = data.get("subscriptions", [])

        current_user = None
        user_subs    = None
        if token:
            try:
                payload      = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
                current_user = payload.get("sub")
            except Exception:
                pass

        tg_subs_init    = None
        email_subs_init = None
        if current_user:
            user = db.query(User).filter(User.email == current_user).first()
            if user and user.notifications:
                notifs = user.notifications
                if camera_name == '':
                    # Объединение подписок "На сайте" со всех камер (для "Персональные" на карте)
                    all_subs: set = set()
                    for k, v in notifs.items():
                        if not k.startswith('tg:') and not k.startswith('email:') and isinstance(v, list):
                            all_subs.update(v)
                    user_subs = list(all_subs) if all_subs else None
                else:
                    user_subs = notifs.get(camera_name)
                tg_subs_init    = notifs.get(f"tg:{camera_name}")
                email_subs_init = notifs.get(f"email:{camera_name}")

        subscriptions = user_subs if user_subs is not None else client_subs
        subs_explicit = user_subs is not None

        await ws.send_json({
            "type":                   "connected",
            "authenticated":          bool(current_user),
            "subscriptions":          subscriptions,
            "telegram_subscriptions": tg_subs_init,
            "email_subscriptions":    email_subs_init,
        })

        last_incident_id = 0

        def _filter_by_subs(incidents_list, subs, explicit=False):
            if not subs:
                return [] if explicit else incidents_list
            return [i for i in incidents_list
                    if TEXT_TO_TYPE.get(i.notification_text, i.notification_text) in subs]

        def _serialize(incidents_list):
            return [
                {
                    "id":                i.id,
                    "date":              i.date.isoformat() if i.date else None,
                    "camera":            i.camera,
                    "notification_text": i.notification_text,
                    "severity":          i.severity,
                    "screenshot_name":   i.screenshot_name,
                }
                for i in incidents_list
            ]

        def _build_query(since, last_id=None):
            q = db.query(Incident).filter(Incident.date >= since)
            if cameras_explicit:
                if cameras_filter:
                    q = q.filter(Incident.camera.in_(cameras_filter))
                else:
                    q = q.filter(Incident.id == -1)    # явно пустой список → ничего
            elif camera_name:
                q = q.filter(Incident.camera == camera_name)
            if last_id is not None:
                q = q.filter(Incident.id > last_id)
            return q.order_by(Incident.id.asc())

        try:
            since_init = datetime.now(timezone.utc) - timedelta(seconds=time_range)
            history = _build_query(since_init).all()

            if history:
                last_incident_id = history[-1].id
                filtered_history = _filter_by_subs(history, subscriptions, subs_explicit)
                if filtered_history:
                    await ws.send_json({"type": "incidents", "incidents": _serialize(filtered_history)})
        except Exception as e:
            print(f"[ws/notifications] Ошибка при отправке истории: {e}")

        while True:
            try:
                try:
                    msg = await asyncio.wait_for(ws.receive_json(), timeout=0.05)
                    if msg.get("type") == "update_subscriptions":
                        new_subs      = msg.get("subscriptions", [])
                        subscriptions = new_subs
                        subs_explicit = True
                        if current_user:
                            try:
                                user = db.query(User).filter(User.email == current_user).first()
                                if user:
                                    notifs = dict(user.notifications or {})
                                    notifs[camera_name] = new_subs
                                    user.notifications  = notifs
                                    flag_modified(user, "notifications")
                                    db.commit()
                                    print(f"[ws/notifications] Подписки сохранены: {current_user} → {new_subs}")
                            except Exception as e:
                                print(f"[ws/notifications] Ошибка сохранения подписок: {e}")
                                db.rollback()
                        try:
                            since_upd = datetime.now(timezone.utc) - timedelta(seconds=time_range)
                            hist_upd  = _build_query(since_upd).all()
                            if hist_upd:
                                last_incident_id = hist_upd[-1].id
                            filtered_upd = _filter_by_subs(hist_upd, subscriptions, subs_explicit)
                            await ws.send_json({"type": "incidents", "reset": True,
                                                "incidents": _serialize(filtered_upd)})
                        except Exception as e:
                            print(f"[ws/notifications] Ошибка переотправки истории: {e}")
                        await ws.send_json({"type": "subscriptions_saved"})

                    elif msg.get("type") == "update_time_range":
                        time_range       = int(msg.get("time_range", time_range))
                        last_incident_id = 0
                        since_new        = datetime.now(timezone.utc) - timedelta(seconds=time_range)
                        history          = _build_query(since_new).all()
                        if history:
                            last_incident_id = history[-1].id
                        filtered = _filter_by_subs(history, subscriptions, subs_explicit)
                        await ws.send_json({"type": "incidents", "reset": True,
                                            "incidents": _serialize(filtered)})

                    elif msg.get("type") == "update_display_filter":
                        # Фильтр из Настройки ленты — в памяти, не в БД; пустой = ничего не показывать
                        subscriptions    = msg.get("subscriptions", [])
                        cameras_filter   = msg.get("cameras", [])
                        cameras_explicit = True
                        subs_explicit    = True
                        last_incident_id = 0
                        since_df = datetime.now(timezone.utc) - timedelta(seconds=time_range)
                        hist_df  = _build_query(since_df).all()
                        if hist_df:
                            last_incident_id = hist_df[-1].id
                        filtered_df = _filter_by_subs(hist_df, subscriptions, subs_explicit)
                        await ws.send_json({"type": "incidents", "reset": True,
                                            "incidents": _serialize(filtered_df)})

                except asyncio.TimeoutError:
                    pass

                since         = datetime.now(timezone.utc) - timedelta(seconds=time_range)
                new_incidents = _build_query(since, last_id=last_incident_id).all()

                if new_incidents:
                    last_incident_id = new_incidents[-1].id
                    filtered_new     = _filter_by_subs(new_incidents, subscriptions, subs_explicit)
                    if filtered_new:
                        await ws.send_json({"type": "incidents", "incidents": _serialize(filtered_new)})

            except WebSocketDisconnect:
                break
            except Exception as e:
                print(f"[ws/notifications] Ошибка: {e}")

            await asyncio.sleep(5)

    except WebSocketDisconnect:
        print("[ws/notifications] Клиент отключился")
    except Exception as e:
        print(f"[ws/notifications] Необработанная ошибка: {e}")
