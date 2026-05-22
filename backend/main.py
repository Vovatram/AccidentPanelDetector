import logging
import traceback
import asyncio

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from models import SessionLocal, User, Camera, _get_camera_incidents, run_migrations
from cameras import (
    camera_states, _running_camera_ids,
    _start_camera_worker, _camera_watchdog,
)
from notifications import _tg_chat_id_cache, _telegram_poll_loop

import cameras as cameras_module
import routers as routers_module
import notifications as notifications_module

# ── Логирование ошибок в файл ─────────────────────────────────────────────────
_error_logger = logging.getLogger("apd.errors")
_error_logger.setLevel(logging.ERROR)
_file_handler = logging.FileHandler("error.log", encoding="utf-8")
_file_handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
_error_logger.addHandler(_file_handler)


def _log_exception(exc: BaseException):
    tb = traceback.extract_tb(exc.__traceback__)
    last = tb[-1] if tb else None
    location = f"[{last.filename}:{last.lineno}]" if last else "[unknown]"
    _error_logger.error(
        f"{location} {type(exc).__name__}: {exc}\n"
        + "".join(traceback.format_tb(exc.__traceback__))
    )


# ── FastAPI app ───────────────────────────────────────────────────────────────
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://accidentpaneldetector-8fd2c1.gitlab.io",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def error_logging_middleware(request: Request, call_next):
    try:
        return await call_next(request)
    except Exception as exc:
        _log_exception(exc)
        raise


# ── Роутеры ───────────────────────────────────────────────────────────────────
app.include_router(cameras_module.router)
app.include_router(notifications_module.router)
app.include_router(routers_module.router)


# ── Startup ───────────────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup():
    global camera_tasks_started

    run_migrations()

    db = SessionLocal()
    try:
        cameras = db.query(Camera).all()
        started = skipped = 0
        for cam in cameras:
            inc = _get_camera_incidents(cam.id)
            if inc is False:
                print(f"[startup] Камера {cam.id} ({cam.name}): отключена, пропускаю")
                skipped += 1
                continue
            _start_camera_worker(cam)
            started += 1
        cameras_module.camera_tasks_started = True
        print(f"[startup] Запущено воркеров: {started}, пропущено: {skipped}")
    except Exception as exc:
        _log_exception(exc)
    finally:
        db.close()

    asyncio.create_task(_camera_watchdog())

    db2 = SessionLocal()
    try:
        tg_users = db2.query(User).filter(
            User.telegram != None, User.telegram_chat_id != None
        ).all()
        for u in tg_users:
            _tg_chat_id_cache[u.telegram.lower()] = u.telegram_chat_id
        if tg_users:
            print(f"[startup] Загружено {len(tg_users)} Telegram chat_id из БД")
    except Exception as exc:
        _log_exception(exc)
        print(f"[startup] Ошибка загрузки Telegram chat_id: {exc}")
    finally:
        db2.close()

    asyncio.create_task(_telegram_poll_loop())
    print("[startup] Telegram polling запущен")
