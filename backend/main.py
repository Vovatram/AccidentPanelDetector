from fastapi import FastAPI,Query, HTTPException, Depends, WebSocket, WebSocketDisconnect
from fastapi.security import OAuth2PasswordBearer
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import sessionmaker
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm.attributes import flag_modified
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from fastapi import BackgroundTasks, Body
from pydantic import BaseModel, EmailStr
from dotenv import load_dotenv
from passlib.context import CryptContext
from jose import jwt
from datetime import datetime, timedelta, timezone
from typing import Dict, Any
import numpy as np
import cv2
import imageio_ffmpeg
import subprocess
import base64
from argon2 import PasswordHasher
import asyncio
from sqlalchemy.orm import Session
from collections import defaultdict
import time
import math
from ultralytics import YOLO
from jose import JWTError 
import os
from dotenv import load_dotenv

ph = PasswordHasher()


'''
psql -U postgres

psql -U postgres -p 5433
\c apd
CREATE TABLE cameras (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    coord JSONB,
    url VARCHAR(255) NOT NULL,
    data JSONB
);
DROP TABLE cameras;

CREATE TABLE superadmins (
    id    SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE
);

-- Новые столбцы:
ALTER TABLE users     ADD COLUMN IF NOT EXISTS telegram         VARCHAR(255);
ALTER TABLE users     ADD COLUMN IF NOT EXISTS telegram_chat_id VARCHAR(255);
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS mistake  JSONB NOT NULL DEFAULT '[]';

git add .
git commit --amend --no-edit  
git push --force-with-lease origin main

git add .
git commit -m "work version 1"
git push

cd frontend
$env:PATH="E:\AccidentPanelDetector\frontend\node-v24.12.0-win-x64;$env:PATH"
npm.cmd run dev -- --host
npm run dev

cd backend
PortablePython\python.exe -m uvicorn main:app --reload  

npm.cmd install react-map-gl@7.1.2 maplibre-gl@4.1.0
npm.cmd install maplibre-gl


'''

# =============================================================================
# КОНСТАНТЫ — меняй здесь, не трогая остальной код
# =============================================================================

# Управление камерами теперь через столбец incidents в таблице cameras:
#   null  = все типы детекции активны
#   false = камера выключена
#   [..] = конкретные типы
# ACTIVE_CAMERA_IDS больше не используется.

# Cooldown между сохранениями одного типа инцидента на одной камере (секунд)
INCIDENT_SAVE_COOLDOWN = 5 * 60

# Как часто (в секундах) перечитывать зоны камеры из БД
CAMERA_ZONES_REFRESH_INTERVAL = 10

# Папка для скриншотов инцидентов
INCIDENTS_PHOTOS_DIR = "incidents"

# Сохранять ли скриншоты на диск (False = только запись в БД)
SAVE_INCIDENT_SCREENSHOTS = True

# =============================================================================


# ← Замени на свои данные подключения
DATABASE_URL = "postgresql://neondb_owner:npg_5WKnbBGXJhv0@ep-red-term-agdi5ngi-pooler.c-2.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
DATABASE_URL = "postgresql://neondb_owner:npg_5WKnbBGXJhv0@ep-red-term-agdi5ngi.c-2.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
DATABASE_URL = "postgresql://postgres:Metro1935)@localhost:5433/apd"


engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=300
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

Base = declarative_base()
#Base.metadata.create_all(bind=engine)
app = FastAPI()

def _start_camera_worker(cam):
    """Запускает camera_worker для одной камеры и регистрирует её id."""
    _running_camera_ids.add(cam.id)
    asyncio.create_task(camera_worker(cam))


async def _camera_watchdog():
    """Каждые 30 сек проверяет камеры: если incidents != false и воркер ещё не запущен — стартует."""
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


@app.on_event("startup")
async def start_camera_workers():
    """
    Запускает camera_worker только для активных камер (incidents != false).
    Камеры с incidents=false пропускаются; watchdog включит их когда они будут re-enabled.
    """
    global camera_tasks_started
    db = SessionLocal()
    try:
        cameras = db.query(Camera).all()
        started = 0
        skipped = 0
        for cam in cameras:
            inc = _get_camera_incidents(cam.id)
            if inc is False:
                print(f"[startup] Камера {cam.id} ({cam.name}): отключена (incidents=false), пропускаю")
                skipped += 1
                continue
            _start_camera_worker(cam)
            started += 1
        camera_tasks_started = True
        print(f"[startup] Запущено воркеров: {started}, пропущено (отключены): {skipped}")
    finally:
        db.close()

    asyncio.create_task(_camera_watchdog())

    # Предзаполняем кэш chat_id из БД (пользователи, ранее запустившие бота)
    db2 = SessionLocal()
    try:
        tg_users = db2.query(User).filter(
            User.telegram != None, User.telegram_chat_id != None
        ).all()
        for u in tg_users:
            _tg_chat_id_cache[u.telegram.lower()] = u.telegram_chat_id
        if tg_users:
            print(f"[startup] Загружено {len(tg_users)} Telegram chat_id из БД")
    except Exception as e:
        print(f"[startup] Ошибка загрузки Telegram chat_id: {e}")
    finally:
        db2.close()

    asyncio.create_task(_telegram_poll_loop())
    print("[startup] Telegram polling запущен")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",                    # твой dev-фронт (Vite по умолчанию 5173)
        "https://accidentpaneldetector-8fd2c1.gitlab.io",  # прод-фронт
        # можно добавить "http://localhost:3000" если тестируешь на другом порту
    ],
    allow_credentials=True,          # обязательно True, если используешь токены/cookies
    allow_methods=["*"],
    allow_headers=["*"],
)

SECRET_KEY = "t4567u8iujyhtrge"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 1440

class Counter(Base):
    __tablename__ = "counter"
    id = Column(Integer, primary_key=True, index=True)
    value = Column(Integer, default=0)

class Data(Base):
    __tablename__ = "data"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name     = Column(String(255), nullable=False, unique=True)
    data     = Column(JSONB)
    requests = Column(JSONB)

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    self_cams     = Column(JSONB, default=dict)     # []
    notifications = Column(JSONB, default=dict)    # {}
    telegram         = Column(String(255), nullable=True)
    telegram_chat_id = Column(String(255), nullable=True)

    def __repr__(self):
        return f"<User email={self.email}>"

class Camera(Base):
    __tablename__ = "cameras"
 
    id              = Column(Integer, primary_key=True, autoincrement=True)
    name            = Column(String(255), nullable=False, unique=True)
    coord           = Column(JSONB, nullable=False)
    url             = Column(String(255), nullable=False)
 
    # Зоны (массивы полигонов, каждый полигон — список [x, y] точек)
    road_zones      = Column(JSONB, nullable=False, server_default='[]')
    stop_zones      = Column(JSONB, nullable=False, server_default='[]')
    crosswalk_zones = Column(JSONB, nullable=False, server_default='[]')
    lane_lines      = Column(JSONB, nullable=False, server_default='[]')
    # incidents управляется через raw SQL (не в ORM), чтобы не ломать SELECT * при отсутствии столбца


class Incident(Base):
    __tablename__ = "incidents"

    id                = Column(Integer, primary_key=True, autoincrement=True)
    date              = Column(DateTime(timezone=True), default=datetime.utcnow)
    camera            = Column(String(255), nullable=False)
    notification_text = Column(Text, nullable=False)
    screenshot_name   = Column(String(255))
    severity          = Column(Integer, nullable=False)
    mistake           = Column(JSONB, nullable=False, server_default='[]')
    # mistake: [{"text": "...", "date": "ISO"}, ...]


class SuperAdmin(Base):
    __tablename__ = "superadmins"
    id    = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String(255), nullable=False, unique=True)


def _get_camera_incidents(camera_id):
    """Читает столбец incidents из cameras через raw SQL. Возвращает None если столбца нет."""
    db = SessionLocal()
    try:
        row = db.execute(
            text("SELECT incidents FROM cameras WHERE id = :id"),
            {"id": camera_id}
        ).fetchone()
        return row[0] if row else None
    except Exception:
        return None
    finally:
        db.close()


def _set_camera_incidents(camera_id, incidents):
    """Записывает столбец incidents через raw SQL. Кидает исключение при ошибке."""
    import json as _j
    db = SessionLocal()
    try:
        if incidents is None:
            db.execute(
                text("UPDATE cameras SET incidents = NULL WHERE id = :id"),
                {"id": camera_id}
            )
        else:
            db.execute(
                text("UPDATE cameras SET incidents = CAST(:v AS jsonb) WHERE id = :id"),
                {"v": _j.dumps(incidents), "id": camera_id}
            )
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"[_set_camera_incidents] Ошибка camera_id={camera_id}: {e}")
        raise
    finally:
        db.close()


class CounterResponse(BaseModel):
    value: int
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.get("/counter")
def get_counter(numb, db: Session = Depends(get_db)):
    print(numb)
    return {"value": 1}
    try:
        data = db.query(Data).filter(Data.name == numb).first()
        if not data:
            raise HTTPException(status_code=404, detail="Счётчик не найден")
        print(data.data)
        return {"value": data.data['counter']}
    finally:
        db.close()
        
@app.get("/cameras")
def get_counter(numb, db: Session = Depends(get_db)):
    a = {}
    for i in db.query(Camera):
        a[i.name] = [i.coord, i.url]
    return a
    try:
        data = db.query(Data).filter(Data.name == numb).first()
        if not data:
            raise HTTPException(status_code=404, detail="Счётчик не найден")
        print(data.data)
        return {"value": data.data['counter']}
    finally:
        db.close()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/login", auto_error=False)

async def get_current_user(token: str = Depends(oauth2_scheme)):
    if not token:
        return False
        
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email:
            return email
        return False
    except (JWTError, AttributeError, Exception):
        return False


@app.patch("/counter")
def increment_counter(form_data: Dict[str, Any] = Body(...), current_user: str = Depends(get_current_user), db: Session = Depends(get_db)):
    return {"value": 1}
    try:
        user = db.query(User).filter(User.email == current_user).first()
        if user.numbs.count(form_data['numb']):
            data = db.query(Data).filter(Data.name == form_data['numb']).first()
            if not data:
                raise HTTPException(status_code=404, detail="Счётчик не найден")
            data.data['counter'] += 1
            flag_modified(data, "data")
            db.commit()
            db.refresh(data)
            return {"value": data.data['counter']}
        return {'err': 'нет прав', "value": data.data['counter']}
    finally:
        db.close()

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

@app.post("/login")
async def login(form_data: dict = Body(...), db: Session = Depends(get_db)):
    # Ищем пользователя по email (form_data.username — это email в OAuth2PasswordRequestForm)
    print(form_data)
    user = db.query(User).filter(User.email == form_data['email']).first()
    
    if not user:
        return {"error" : 'Неверный email'}

    # Проверяем пароль
    print(str(form_data['password']), str(user.password_hash),str(form_data['password']) == str(user.password_hash))
    try:
        access_token = create_access_token(data={"sub": form_data['email']})
        if str(form_data['password']) == str(user.password_hash):
            print(32)
            return {"access_token": access_token, 'url' : 'map'}
        ph.verify(user.password_hash, form_data['password'])
        print(22)
        # Создаём токен
        access_token = create_access_token(data={"sub": user.email})
        print(user.numbs[0])
        return {"access_token": access_token, 'url' : 'map'}
    except:
        return {"error" : 'Неверный email или пароль_'}

@app.post("/register")
async def register_user(data: dict = Body(...), db: Session = Depends(get_db)):
    name = data.get("name")
    email = data.get("email")
    password = data.get("password")
    print(name,email, password)
    # Хешируем пароль
    hashed_password = ph.hash(password)
    print(hashed_password)
    # Создаём пользователя
    db_user = User(
        name=name,
        email=email,
        password_hash=hashed_password,
        numbs = [email]
    )
    db.add(db_user)    
    db_data = Data(
        name     = email,
        data     = {'counter' : 0},
        requests = {}
    )
    db.add(db_user)
    db.add(db_data) 
    db.commit()
    db.refresh(db_user)
    db.refresh(db_data)
    

@app.get("/check-email")
async def check_email_availability(
    email: str = Query(..., description="Email для проверки"), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == email).first()
    try:
        EmailStr._validate(email)
        return {"available": user is None}
    except:
        return {"available": 'Некорректная почта'}


@app.get("/newcam")
async def newcam(Nname, coord, url, current_user: str = Depends(get_current_user), db: Session = Depends(get_db)):
    print(334)

    db_data = Camera(
        name = Nname,
        coord   = [float(x) for x in coord.split(', ')],
        url = url,
        data     = {}
    )
    db.add(db_data) 
    db.commit()
    db.refresh(db_data)

@app.get("/notifications")
async def notifi(cameras,time,paramU, current_user: str | bool = Depends(get_current_user)):
    

    cams = ['Шоссе Энтузиастов Пересечение с 3-м кольцом', 'Волгоградский проспект Метро Кузьминки', 'Улица Люблинская Пересечение с улицей Шкулева']
    #notifications = generate_incidents(50, cams, 3600)
    notifications = [ { "time": "2026:04:19T22:44:01", "camera": "Улица Люблинская Пересечение с улицей Шкулева", "incident": "Остановка запрещена", "seriousness": 3 }, { "time": "2026:04:19T22:45:08", "camera": "Улица Люблинская Пересечение с улицей Шкулева", "incident": "ДТП", "seriousness": 1 }, { "time": "2026:04:19T22:47:09", "camera": "Волгоградский проспект Метро Кузьминки", "incident": "ДТП", "seriousness": 4 }, { "time": "2026:04:19T22:52:27", "camera": "Волгоградский проспект Метро Кузьминки", "incident": "Остановка запрещена", "seriousness": 2 }, { "time": "2026:04:19T22:53:49", "camera": "Волгоградский проспект Метро Кузьминки", "incident": "ДТП", "seriousness": 3 }, { "time": "2026:04:19T22:54:41", "camera": "Волгоградский проспект Метро Кузьминки", "incident": "Превышение скорости", "seriousness": 1 }, { "time": "2026:04:19T22:58:26", "camera": "Улица Люблинская Пересечение с улицей Шкулева", "incident": "ДТП", "seriousness": 5 }, { "time": "2026:04:19T22:59:04", "camera": "Волгоградский проспект Метро Кузьминки", "incident": "Превышение скорости", "seriousness": 5 }, { "time": "2026:04:19T22:59:17", "camera": "Улица Люблинская Пересечение с улицей Шкулева", "incident": "Превышение скорости", "seriousness": 5 }, { "time": "2026:04:19T23:02:33", "camera": "Волгоградский проспект Метро Кузьминки", "incident": "Остановка запрещена", "seriousness": 1 }, { "time": "2026:04:19T23:03:21", "camera": "Улица Люблинская Пересечение с улицей Шкулева", "incident": "Превышение скорости", "seriousness": 3 }, { "time": "2026:04:19T23:05:16", "camera": "Волгоградский проспект Метро Кузьминки", "incident": "Нарушение разметки", "seriousness": 3 }, { "time": "2026:04:19T23:06:01", "camera": "Волгоградский проспект Метро Кузьминки", "incident": "Остановка запрещена", "seriousness": 4 }, { "time": "2026:04:19T23:06:06", "camera": "Шоссе Энтузиастов Пересечение с 3-м кольцом", "incident": "Остановка запрещена", "seriousness": 4 }, { "time": "2026:04:19T23:06:36", "camera": "Волгоградский проспект Метро Кузьминки", "incident": "Нарушение разметки", "seriousness": 5 }, { "time": "2026:04:19T23:06:57", "camera": "Улица Люблинская Пересечение с улицей Шкулева", "incident": "Превышение скорости", "seriousness": 4 }, { "time": "2026:04:19T23:07:26", "camera": "Улица Люблинская Пересечение с улицей Шкулева", "incident": "ДТП", "seriousness": 4 }, { "time": "2026:04:19T23:07:29", "camera": "Улица Люблинская Пересечение с улицей Шкулева", "incident": "Нарушение разметки", "seriousness": 2 }, { "time": "2026:04:19T23:08:05", "camera": "Улица Люблинская Пересечение с улицей Шкулева", "incident": "Остановка запрещена", "seriousness": 4 }, { "time": "2026:04:19T23:08:35", "camera": "Улица Люблинская Пересечение с улицей Шкулева", "incident": "Нарушение разметки", "seriousness": 3 }, { "time": "2026:04:19T23:11:50", "camera": "Волгоградский проспект Метро Кузьминки", "incident": "Превышение скорости", "seriousness": 5 }, { "time": "2026:04:19T23:12:04", "camera": "Волгоградский проспект Метро Кузьминки", "incident": "Остановка запрещена", "seriousness": 2 }, { "time": "2026:04:19T23:14:44", "camera": "Улица Люблинская Пересечение с улицей Шкулева", "incident": "Остановка запрещена", "seriousness": 5 }, { "time": "2026:04:19T23:14:51", "camera": "Волгоградский проспект Метро Кузьминки", "incident": "Остановка запрещена", "seriousness": 4 }, { "time": "2026:04:19T23:15:29", "camera": "Волгоградский проспект Метро Кузьминки", "incident": "Нарушение разметки", "seriousness": 3 }, { "time": "2026:04:19T23:16:44", "camera": "Волгоградский проспект Метро Кузьминки", "incident": "Нарушение разметки", "seriousness": 1 }, { "time": "2026:04:19T23:17:09", "camera": "Улица Люблинская Пересечение с улицей Шкулева", "incident": "Остановка запрещена", "seriousness": 4 }, { "time": "2026:04:19T23:17:24", "camera": "Улица Люблинская Пересечение с улицей Шкулева", "incident": "Остановка запрещена", "seriousness": 3 }, { "time": "2026:04:19T23:19:50", "camera": "Улица Люблинская Пересечение с улицей Шкулева", "incident": "Остановка запрещена", "seriousness": 3 }, { "time": "2026:04:19T23:21:04", "camera": "Волгоградский проспект Метро Кузьминки", "incident": "Остановка запрещена", "seriousness": 4 }, { "time": "2026:04:19T23:21:04", "camera": "Улица Люблинская Пересечение с улицей Шкулева", "incident": "Остановка запрещена", "seriousness": 4 }, { "time": "2026:04:19T23:23:06", "camera": "Шоссе Энтузиастов Пересечение с 3-м кольцом", "incident": "Превышение скорости", "seriousness": 2 }, { "time": "2026:04:19T23:24:44", "camera": "Волгоградский проспект Метро Кузьминки", "incident": "Нарушение разметки", "seriousness": 5 }, { "time": "2026:04:19T23:25:32", "camera": "Шоссе Энтузиастов Пересечение с 3-м кольцом", "incident": "Превышение скорости", "seriousness": 4 }, { "time": "2026:04:19T23:26:11", "camera": "Волгоградский проспект Метро Кузьминки", "incident": "Нарушение разметки", "seriousness": 1 }, { "time": "2026:04:19T23:26:24", "camera": "Шоссе Энтузиастов Пересечение с 3-м кольцом", "incident": "Превышение скорости", "seriousness": 5 }, { "time": "2026:04:19T23:26:29", "camera": "Волгоградский проспект Метро Кузьминки", "incident": "Превышение скорости", "seriousness": 5 }, { "time": "2026:04:19T23:27:04", "camera": "Волгоградский проспект Метро Кузьминки", "incident": "Превышение скорости", "seriousness": 5 }, { "time": "2026:04:19T23:27:47", "camera": "Волгоградский проспект Метро Кузьминки", "incident": "ДТП", "seriousness": 5 }, { "time": "2026:04:19T23:29:46", "camera": "Шоссе Энтузиастов Пересечение с 3-м кольцом", "incident": "Нарушение разметки", "seriousness": 5 }, { "time": "2026:04:19T23:30:22", "camera": "Волгоградский проспект Метро Кузьминки", "incident": "ДТП", "seriousness": 5 }, { "time": "2026:04:19T23:31:36", "camera": "Волгоградский проспект Метро Кузьминки", "incident": "Превышение скорости", "seriousness": 3 }, { "time": "2026:04:19T23:33:23", "camera": "Шоссе Энтузиастов Пересечение с 3-м кольцом", "incident": "ДТП", "seriousness": 4 }, { "time": "2026:04:19T23:36:28", "camera": "Улица Люблинская Пересечение с улицей Шкулева", "incident": "Превышение скорости", "seriousness": 1 }, { "time": "2026:04:19T23:37:01", "camera": "Шоссе Энтузиастов Пересечение с 3-м кольцом", "incident": "Превышение скорости", "seriousness": 2 }, { "time": "2026:04:19T23:37:39", "camera": "Волгоградский проспект Метро Кузьминки", "incident": "Остановка запрещена", "seriousness": 2 }, { "time": "2026:04:19T23:39:34", "camera": "Улица Люблинская Пересечение с улицей Шкулева", "incident": "Нарушение разметки", "seriousness": 4 }, { "time": "2026:04:19T23:39:52", "camera": "Шоссе Энтузиастов Пересечение с 3-м кольцом", "incident": "Нарушение разметки", "seriousness": 4 }, { "time": "2026:04:19T23:41:15", "camera": "Шоссе Энтузиастов Пересечение с 3-м кольцом", "incident": "ДТП", "seriousness": 5 }, { "time": "2026:04:19T23:41:42", "camera": "Улица Люблинская Пересечение с улицей Шкулева", "incident": "Нарушение разметки", "seriousness": 5 } ]
    #print(notifications)
    return {'user' : current_user, 'notifications' : notifications}

class EmailSchema(BaseModel):
    to: EmailStr
    subject: str
    body: str  # простой текст; можно сделать HTML позже

@app.get("/send-email")
async def send_verification_email(
    email, code, background_tasks: BackgroundTasks):
    # Здесь можно сгенерировать код подтверждения
 # ← в реальности генерируй случайно

    email_data = EmailSchema(
        to=email,
        subject="Подтверждение почты",
        body=f"Ваш код подтверждения: {code}\n\nНе передавайте его никому!"
    )

    background_tasks.add_task(
            send_email_sync, 
            email_data
        )
    return {"message": "Письмо отправлено (проверьте почту)"}




load_dotenv()

# =============================================================================
# EMAIL — Resend API
# =============================================================================
import httpx

# ── MailerSend ──────────────────────────────────────────────────────────────
MAILERSEND_API_TOKEN = os.getenv("MAILERSEND_API_TOKEN")
MAILERSEND_FROM      = os.getenv("MAILERSEND_FROM")
MAILERSEND_FROM_NAME = os.getenv("MAILERSEND_FROM_NAME")
MAILERSEND_API_URL   = "https://api.mailersend.com/v1/email"

# ── Telegram Bot ─────────────────────────────────────────────────────────────
TG_BOT_TOKEN = os.getenv("TG_BOT_TOKEN")
TG_BOT_USERNAME = "@Accident_DetectorBot"
TG_BASE_URL  = f"https://api.telegram.org/bot{TG_BOT_TOKEN}"


# username (lowercase, без @) → chat_id; живёт в памяти, наполняется поллингом
_tg_chat_id_cache: dict[str, str] = {}
_tg_update_offset: int = 0


def _poll_telegram_updates():
    """Читает новые апдейты из Telegram, сохраняет chat_id в кэш и БД."""
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

                # Сохраняем в БД если этот username привязан к пользователю
                user = db.query(User).filter(
                    User.telegram.ilike(username)
                ).first()
                if user and user.telegram_chat_id != chat_id:
                    user.telegram_chat_id = chat_id
                    db.commit()
                    print(f"[telegram] chat_id сохранён для @{username}: {chat_id}")

                # Отвечаем на /start
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
    """Запускается при старте сервера, опрашивает бота каждые 10 секунд."""
    while True:
        try:
            await asyncio.get_event_loop().run_in_executor(None, _poll_telegram_updates)
        except Exception as e:
            print(f"[telegram] poll loop error: {e}")
        await asyncio.sleep(10)


def send_telegram(chat_id: str, text: str,
                  photo_path: str | None = None) -> bool:
    """Отправляет сообщение или фото в Telegram по chat_id."""
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


def send_email_sync(email: EmailSchema):
    """Отправка письма через MailerSend API."""
    import requests as req_lib
    try:
        resp = req_lib.post(
            MAILERSEND_API_URL,
            headers={
                "Authorization": f"Bearer {MAILERSEND_API_TOKEN}",
                "Content-Type":  "application/json",
            },
            json={
                "from": {"email": MAILERSEND_FROM, "name": MAILERSEND_FROM_NAME},
                "to":   [{"email": email.to}],
                "subject": email.subject,
                "text":    email.body,
            },
            timeout=15,
        )
        if resp.status_code == 202:
            print(f"[email] Отправлено на {email.to}")
        else:
            print(f"[email] Ошибка MailerSend {resp.status_code}: {resp.text}")
    except Exception as e:
        print(f"[email] Исключение: {e}")


def notify_incident(camera_name: str, incident_type: str,
                    severity: int, date: datetime,
                    screenshot_path: str | None = None):
    """
    Рассылает уведомление об инциденте всем пользователям.
    Email — по site-подпискам (notifications[camera]).
    Telegram — по отдельным Telegram-подпискам (notifications[tg:camera]).
    """
    db = SessionLocal()
    try:
        users = db.query(User).all()
        for user in users:
            notifs    = user.notifications or {}
            site_subs  = notifs.get(camera_name, [])
            tg_subs    = notifs.get(f"tg:{camera_name}", None)    # None = не настроено
            email_subs = notifs.get(f"email:{camera_name}", None)  # None = не настроено

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
                    send_email_sync(EmailSchema(to=user.email, subject=subject, body=body))
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


def send_email_background(background_tasks: BackgroundTasks, email: EmailSchema):
    background_tasks.add_task(send_email_sync, email)


async def notify_superadmins(subject: str, body: str):
    """Рассылает письмо всем суперадминам из таблицы superadmins (async-обёртка)."""
    try:
        db = SessionLocal()
        admins = db.query(SuperAdmin).all()
        db.close()
    except Exception as e:
        print(f"[email] Ошибка получения суперадминов: {e}")
        return
    for admin in admins:
        send_email_sync(EmailSchema(to=admin.email, subject=subject, body=body))


# ─── Управление суперадминами ─────────────────────────────────────────────────

@app.post("/superadmins")
async def add_superadmin(data: dict = Body(...), db: Session = Depends(get_db)):
    email = data.get("email", "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="email обязателен")
    if db.query(SuperAdmin).filter(SuperAdmin.email == email).first():
        raise HTTPException(status_code=409, detail="Уже существует")
    db.add(SuperAdmin(email=email))
    db.commit()
    return {"ok": True, "email": email}


@app.delete("/superadmins/{email}")
async def remove_superadmin(email: str, db: Session = Depends(get_db)):
    admin = db.query(SuperAdmin).filter(SuperAdmin.email == email).first()
    if not admin:
        raise HTTPException(status_code=404, detail="Не найден")
    db.delete(admin)
    db.commit()
    return {"ok": True}


@app.get("/superadmins")
async def list_superadmins(db: Session = Depends(get_db)):
    return [a.email for a in db.query(SuperAdmin).all()]


@app.post("/user/telegram")
async def set_telegram(
    data: dict = Body(...),
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Сохраняет Telegram username пользователя."""
    if not current_user:
        raise HTTPException(status_code=401, detail="Не авторизован")
    username = data.get("telegram", "").strip().lstrip("@")
    user = db.query(User).filter(User.email == current_user).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    user.telegram = username or None
    db.commit()
    return {"ok": True, "telegram": user.telegram}


@app.get("/user/profile")
async def get_profile(
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Возвращает профиль текущего пользователя."""
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



@app.websocket("/ws")
async def video_stream(ws: WebSocket, db: Session = Depends(get_db)):
    global camera_tasks_started

    await ws.accept()
    print("Клиент подключился")

    try:
        # клиент отправляет:
        # { camera: "name", filters: ["speeding"] }

        data = await ws.receive_json()

        camera_name     = data.get("camera")
        filters         = data.get("filters", ["all"])        # что детектировать
        display_filters = data.get("display_filters", ["all"]) # что рисовать на видео

        camera = db.query(Camera).filter(Camera.name == camera_name).first()

        if not camera:
            await ws.send_text("ERROR: Камера не найдена")
            return

        # 🚀 запускаем workers один раз при первом подключении
        if not camera_tasks_started:
            cameras = db.query(Camera).all()
            for cam in cameras:
                asyncio.create_task(camera_worker(cam))
            camera_tasks_started = True

        # ждём первого кадра от нужной камеры
        while camera_states.get(camera.id, {}).get("frame") is None:
            await asyncio.sleep(0.1)

        h, w = camera_states[camera.id]["frame"].shape[:2]
        await ws.send_text(f"RES:{w}x{h}")

        # 🔁 основной цикл
        while True:
            # Клиент может прислать {"type":"set_display_filters","display_filters":[...]}
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

            # --- отрисовка инцидентов ---
            # Закомментируй draw_incidents чтобы отправлять чистый кадр,
            # или передай нужный список filters из клиентского запроса.
            frame = draw_incidents(state["frame"].copy(), state["incidents"], display_filters)

            ret, buffer = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 75])

            if ret:
                await ws.send_bytes(buffer.tobytes())

            await asyncio.sleep(0.03)

    except WebSocketDisconnect:
        print("Клиент отключился")
    except Exception as e:
        print(f"[ws] Ошибка: {e}")  # не пытаемся слать после закрытия

# =============================================================================
# ГЛОБАЛЬНОЕ СОСТОЯНИЕ КАМЕР
# =============================================================================


# camera_states[camera_id] = {
#     "frame": np.ndarray,           # последний сырой кадр (BGR)
#     "results": ultralytics Results, # последний результат model.track
#     "incidents": {
#         "traffic_jam":  {...} | None,   # данные о пробках
#         "illegal_stop": {...} | None,   # данные о стоянке
#         "pedestrian":   {...} | None,   # данные о пешеходах
#     }
# }
camera_states: dict[int, dict] = {}
camera_tasks_started = False
_running_camera_ids: set = set()  # id камер, для которых уже запущен camera_worker


@app.post("/camera-incidents")
async def set_camera_incidents(
    data: dict = Body(...),
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Суперадмин управляет детекцией камеры.
    data.incidents = false (камера выключена) | ["traffic_jam", ...] (конкретные типы)
    """
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


@app.post("/user/site-notifications")
async def save_site_notifications(
    data: dict = Body(...),
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Сохраняет подписки пользователя на уведомления сайта.
    data = { "camera": "Имя камеры", "subscriptions": ["Затор", "ДТП", ...] }
    Хранится в User.notifications как { "Имя камеры": ["Затор", "ДТП"] }
    """
    if not current_user:
        raise HTTPException(status_code=401, detail="Не авторизован")

    camera_name = data.get("camera")
    subscriptions = data.get("subscriptions", [])

    user = db.query(User).filter(User.email == current_user).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    notifs = dict(user.notifications or {})
    notifs[camera_name] = subscriptions
    user.notifications = notifs
    db.commit()
    return {"ok": True}


@app.get("/user/site-notifications")
async def get_site_notifications(
    camera: str,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Возвращает подписки пользователя для конкретной камеры."""
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
        "phone": user.numbs[0] if user.numbs else None
    }


@app.post("/user/telegram-subscriptions")
async def save_telegram_subscriptions(
    data: dict = Body(...),
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Сохраняет Telegram-подписки пользователя для камеры (независимо от email/site)."""
    if not current_user:
        raise HTTPException(status_code=401, detail="Не авторизован")
    camera_name   = data.get("camera")
    subscriptions = data.get("subscriptions", [])
    user = db.query(User).filter(User.email == current_user).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    notifs = dict(user.notifications or {})
    notifs[f"tg:{camera_name}"] = subscriptions
    user.notifications = notifs
    flag_modified(user, "notifications")
    db.commit()
    return {"ok": True}


@app.websocket("/ws/notifications")
async def notifications_stream(ws: WebSocket, db: Session = Depends(get_db)):
    """
    WebSocket для потока уведомлений об инцидентах.
    Клиент подключается и отправляет:
      { camera: "Имя", token: "jwt", time_range: 3600, subscriptions: ["Затор", "ДТП"] }

    Бэк каждые 5 секунд присылает новые инциденты из БД:
      { incidents: [{ id, date, camera, notification_text, severity }, ...] }

    Если пользователь авторизован — берём subscriptions из User.notifications[camera].
    Если нет — берём subscriptions из запроса клиента.
    """
    await ws.accept()
    print("[ws/notifications] Клиент подключился")

    # Маппинг notification_text → тип инцидента для фильтрации
    TEXT_TO_TYPE = {
        "Затор":                                    "Затор",
        "Стоянка в неположенном месте":             "Стоянка в неположенном месте",
        "Пешеход на проезжей части вне перехода":   "Пешеход в неположенном месте",
    }

    try:
        data = await ws.receive_json()
        camera_name   = data.get("camera", "")
        token         = data.get("token")
        time_range    = int(data.get("time_range", 3600))   # секунд в прошлое
        client_subs   = data.get("subscriptions", [])       # от неавторизованного клиента

        # Определяем пользователя по токену
        current_user = None
        user_subs    = None
        if token:
            try:
                payload      = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
                current_user = payload.get("sub")
            except Exception:
                pass

        tg_subs_init = None
        if current_user:
            user = db.query(User).filter(User.email == current_user).first()
            if user and user.notifications:
                user_subs    = user.notifications.get(camera_name)
                tg_subs_init = user.notifications.get(f"tg:{camera_name}")

        # Финальный список подписок: приоритет у пользовательских настроек из БД
        subscriptions = user_subs if user_subs is not None else client_subs
        # subs_explicit=True когда пользователь явно настроил подписки (даже пустой список)
        subs_explicit = user_subs is not None

        # Подтверждаем подключение
        await ws.send_json({
            "type":                  "connected",
            "authenticated":         bool(current_user),
            "subscriptions":         subscriptions,
            "telegram_subscriptions": tg_subs_init,  # None если не настроено
        })

        # last_incident_id = 0 означает «пришли историю с нуля»
        last_incident_id = 0

        def _filter_by_subs(incidents_list, subs, explicit=False):
            """Фильтрует по подпискам.
            explicit=True + subs=[] → вернуть пустой список (явно снял все подписки).
            explicit=False + subs=[] → вернуть всё (не настраивал подписки / гость).
            """
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

        # ── При подключении сразу шлём историю за time_range ────────────────
        try:
            since_init = datetime.now(timezone.utc) - timedelta(seconds=time_range)
            history = db.query(Incident).filter(
                Incident.camera == camera_name,
                Incident.date   >= since_init,
            ).order_by(Incident.id.asc()).all()

            if history:
                last_incident_id = history[-1].id
                filtered_history = _filter_by_subs(history, subscriptions, subs_explicit)
                if filtered_history:
                    await ws.send_json({
                        "type": "incidents",
                        "incidents": _serialize(filtered_history)
                    })
        except Exception as e:
            print(f"[ws/notifications] Ошибка при отправке истории: {e}")

        while True:
            try:
                # Проверяем, не обновил ли клиент подписки или time_range
                try:
                    msg = await asyncio.wait_for(ws.receive_json(), timeout=0.05)
                    if msg.get("type") == "update_subscriptions":
                        new_subs = msg.get("subscriptions", [])
                        subscriptions = new_subs
                        subs_explicit = True   # пользователь явно выбрал (даже пустой список)
                        if current_user:
                            try:
                                user = db.query(User).filter(User.email == current_user).first()
                                if user:
                                    notifs = dict(user.notifications or {})
                                    notifs[camera_name] = new_subs
                                    user.notifications = notifs
                                    from sqlalchemy.orm.attributes import flag_modified
                                    flag_modified(user, "notifications")
                                    db.commit()
                                    print(f"[ws/notifications] Подписки сохранены: {current_user} → {new_subs}")
                            except Exception as e:
                                print(f"[ws/notifications] Ошибка сохранения подписок: {e}")
                                db.rollback()
                        # Сразу переотправляем историю с новым фильтром (reset=True → фронт заменит список)
                        try:
                            since_upd = datetime.now(timezone.utc) - timedelta(seconds=time_range)
                            hist_upd = db.query(Incident).filter(
                                Incident.camera == camera_name,
                                Incident.date   >= since_upd,
                            ).order_by(Incident.id.asc()).all()
                            if hist_upd:
                                last_incident_id = hist_upd[-1].id
                            filtered_upd = _filter_by_subs(hist_upd, subscriptions, subs_explicit)
                            await ws.send_json({
                                "type": "incidents",
                                "reset": True,
                                "incidents": _serialize(filtered_upd),
                            })
                        except Exception as e:
                            print(f"[ws/notifications] Ошибка переотправки истории: {e}")
                        await ws.send_json({"type": "subscriptions_saved"})

                    elif msg.get("type") == "update_time_range":
                        # Клиент сменил промежуток — переотправляем историю
                        time_range = int(msg.get("time_range", time_range))
                        last_incident_id = 0
                        since_new = datetime.now(timezone.utc) - timedelta(seconds=time_range)
                        history = db.query(Incident).filter(
                            Incident.camera == camera_name,
                            Incident.date   >= since_new,
                        ).order_by(Incident.id.asc()).all()
                        if history:
                            last_incident_id = history[-1].id
                        filtered = _filter_by_subs(history, subscriptions, subs_explicit)
                        await ws.send_json({
                            "type": "incidents",
                            "reset": True,
                            "incidents": _serialize(filtered),
                        })

                except asyncio.TimeoutError:
                    pass

                # Границы времени (для новых)
                since = datetime.now(timezone.utc) - timedelta(seconds=time_range)

                # Только новые инциденты (id > last_incident_id)
                query = db.query(Incident).filter(
                    Incident.camera == camera_name,
                    Incident.date   >= since,
                    Incident.id     >  last_incident_id,
                )
                new_incidents = query.order_by(Incident.id.asc()).all()

                if new_incidents:
                    last_incident_id = new_incidents[-1].id
                    filtered_new = _filter_by_subs(new_incidents, subscriptions, subs_explicit)

                    if filtered_new:
                        await ws.send_json({
                            "type": "incidents",
                            "incidents": _serialize(filtered_new)
                        })

            except WebSocketDisconnect:
                break
            except Exception as e:
                print(f"[ws/notifications] Ошибка: {e}")

            await asyncio.sleep(5)

    except WebSocketDisconnect:
        print("[ws/notifications] Клиент отключился")
    except Exception as e:
        print(f"[ws/notifications] Необработанная ошибка: {e}")


@app.websocket("/ws/stats")
async def stats_stream(ws: WebSocket, db: Session = Depends(get_db)):
    """
    WebSocket для статистики инцидентов.
    Клиент подключается и шлёт параметры:
      {
        camera:     "Имя камеры" | null,   # null = все камеры
        types:      ["Затор", ...] | null,  # null = все типы
        step:       3600,                   # секунд в одном столбце
        time_from:  "2026-05-01T00:00:00Z",
        time_to:    "2026-05-02T00:00:00Z",
      }

    Отвечает:
      {
        type: "stats",
        step: 3600,
        time_from: "...",
        time_to:   "...",
        cameras:   ["Камера 1", ...],
        types:     ["Затор", ...],
        buckets: [
          {
            label:  "10:00",
            ts_from: "...", ts_to: "...",
            data: { "Камера 1": { "Затор": 3, "ДТП": 1 }, ... }
          }, ...
        ]
      }

    Повторно отправляет данные каждые 30 секунд (для live-обновления).
    Клиент может прислать новые параметры в любой момент — пересчитает.
    """
    await ws.accept()
    print("[ws/stats] Клиент подключился")

    TEXT_TO_TYPE = {
        "Затор":                                  "Затор",
        "Стоянка в неположенном месте":           "Стоянка в неположенном месте",
        "Пешеход на проезжей части вне перехода": "Пешеход в неположенном месте",
    }

    async def compute_and_send(params):
        # cameras (массив) имеет приоритет над camera (строка, легаси)
        cameras_param = params.get("cameras")  # list | null
        camera_param  = params.get("camera")   # string | null
        if cameras_param and isinstance(cameras_param, list) and len(cameras_param) > 0:
            camera_filter_list = cameras_param
        elif camera_param:
            camera_filter_list = [camera_param]
        else:
            camera_filter_list = None  # все камеры

        types_filter = params.get("types") or None
        step         = max(int(params.get("step", 3600)), 60)
        try:
            time_from = datetime.fromisoformat(params["time_from"].replace("Z", "+00:00"))
        except Exception:
            time_from = datetime.now(timezone.utc) - timedelta(hours=24)

        MAX_BUCKETS = 300
        time_to = time_from + timedelta(seconds=step * MAX_BUCKETS)

        # Запрос инцидентов — только нужный диапазон
        q = db.query(Incident).filter(
            Incident.date >= time_from,
            Incident.date <  time_to,
        )
        if camera_filter_list:
            q = q.filter(Incident.camera.in_(camera_filter_list))
        incidents = q.order_by(Incident.date.asc()).all()

        def norm_type(t):
            return TEXT_TO_TYPE.get(t, t)

        all_cameras = sorted(set(i.camera for i in incidents))
        all_types   = sorted(set(norm_type(i.notification_text) for i in incidents))
        if types_filter:
            all_types = [t for t in all_types if t in types_filter]

        # Быстрое разбиение: один проход по инцидентам O(n)
        # Вычисляем индекс бакета для каждого инцидента
        step_sec = step
        t0 = time_from.timestamp()
        n_buckets = MAX_BUCKETS

        # Инициализируем бакеты
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

        # Формируем бакеты, обрезаем хвост пустых
        fmt = "%H:%M" if step < 86400 else "%d.%m"
        buckets = []
        last_nonempty = -1
        for i, data in enumerate(buckets_data):
            ts_i = time_from + timedelta(seconds=step * i)
            total = sum(v for cam in data.values() for v in cam.values())
            if total > 0:
                last_nonempty = i
            buckets.append({
                "label":   ts_i.strftime(fmt),
                "ts_from": ts_i.isoformat(),
                "ts_to":   (ts_i + timedelta(seconds=step)).isoformat(),
                "data":    data,
            })

        # Отправляем только до последнего непустого + 1 страница вперёд
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
                params = new_params
                await compute_and_send(params)
            except asyncio.TimeoutError:
                pass  # просто держим соединение живым

    except WebSocketDisconnect:
        print("[ws/stats] Клиент отключился")
    except Exception as e:
        print(f"[ws/stats] Ошибка: {e}")


@app.get("/stats/cameras")
async def list_cameras_for_stats(db: Session = Depends(get_db)):
    """Список камер у которых есть инциденты."""
    rows = db.query(Incident.camera).distinct().all()
    return [r[0] for r in rows]

@app.get("/incidents/{incident_id}")
async def get_incident(incident_id: int, db: Session = Depends(get_db)):
    """Данные одного инцидента + URL фото."""
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

@app.post("/incidents/{incident_id}/report_error")
async def report_incident_error(
    incident_id: int,
    data: dict = Body(...),
    db: Session = Depends(get_db)
):
    """
    Добавляет комментарий об ошибке детекции в Incident.mistake.
    data = {"text": "Комментарий пользователя"}
    """
    inc = db.query(Incident).filter(Incident.id == incident_id).first()
    if not inc:
        raise HTTPException(status_code=404, detail="Не найден")

    comment = {
        "text": data.get("text", "").strip(),
        "date": datetime.now(timezone.utc).isoformat(),
    }
    mistakes = list(inc.mistake or [])
    mistakes.append(comment)
    inc.mistake = mistakes

    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(inc, "mistake")
    db.commit()

    return {"ok": True, "mistake_count": len(mistakes)}

@app.get("/incidents/photo/{filename}")
async def serve_incident_photo(filename: str):
    """Отдаёт скриншот инцидента."""
    from fastapi.responses import FileResponse
    import pathlib
    path = pathlib.Path(INCIDENTS_PHOTOS_DIR) / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="Файл не найден")
    return FileResponse(str(path), media_type="image/jpeg")





# =============================================================================
# ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ РИСОВАНИЯ
# =============================================================================

from PIL import ImageFont, ImageDraw, Image as PILImage

# Шрифт для кириллических надписей
try:
    _FONT = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 16)
except OSError:
    _FONT = ImageFont.load_default()


def _put_text(frame: np.ndarray, text: str, pos: tuple, color_bgr: tuple) -> np.ndarray:
    """Рисует текст с кириллицей через Pillow. Возвращает изменённый кадр."""
    img_pil = PILImage.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
    draw    = ImageDraw.Draw(img_pil)
    color_rgb = (color_bgr[2], color_bgr[1], color_bgr[0])
    draw.text(pos, text, font=_FONT, fill=color_rgb)
    return cv2.cvtColor(np.array(img_pil), cv2.COLOR_RGB2BGR)


def _label_box(frame: np.ndarray, text: str, x1: int, y1: int,
               box_color: tuple, text_color: tuple = (255, 255, 255)) -> np.ndarray:
    """Рисует цветную плашку с кириллическим текстом над bbox."""
    bbox = _FONT.getbbox(text)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    cv2.rectangle(frame, (x1, y1 - th - 8), (x1 + tw + 4, y1), box_color, -1)
    return _put_text(frame, text, (x1 + 2, y1 - th - 6), text_color)


def _fill_zones(frame: np.ndarray, zones: list, color_bgr: tuple, alpha: float = 0.15,
                border: int = 2) -> np.ndarray:
    """Рисует полупрозрачные полигоны зон на кадре."""
    for zone in zones:
        pts = np.array(zone, dtype=np.int32)
        overlay = frame.copy()
        cv2.fillPoly(overlay, [pts], color_bgr)
        cv2.addWeighted(overlay, alpha, frame, 1 - alpha, 0, frame)
        cv2.polylines(frame, [pts], True, color_bgr, border)
    return frame


def _compute_forbidden_zone(road_zones: list, exclude_zones: list) -> np.ndarray | None:
    """
    Вычисляет маску запретной зоны = road_zones минус exclude_zones.
    Возвращает бинарную маску (np.uint8) или None если road_zones пуст.
    Размер маски не известен заранее — определяется по максимальным координатам.
    """
    if not road_zones:
        return None
    # определяем максимальный размер из координат
    all_pts = [pt for zone in road_zones + exclude_zones for pt in zone]
    if not all_pts:
        return None
    max_x = max(p[0] for p in all_pts) + 1
    max_y = max(p[1] for p in all_pts) + 1
    road_mask    = np.zeros((max_y, max_x), dtype=np.uint8)
    exclude_mask = np.zeros((max_y, max_x), dtype=np.uint8)
    for zone in road_zones:
        cv2.fillPoly(road_mask,    [np.array(zone, dtype=np.int32)], 255)
    for zone in exclude_zones:
        cv2.fillPoly(exclude_mask, [np.array(zone, dtype=np.int32)], 255)
    return cv2.bitwise_and(road_mask, cv2.bitwise_not(exclude_mask))


# =============================================================================
# ДЕТЕКТОРЫ — только вычисляют, ничего не рисуют
# Возвращают dict с данными
# =============================================================================

def _detect_traffic_jam(frame: np.ndarray, results, camera, state: dict) -> dict:
    """
    Пробки. Зона поиска — road_zones.
    Возвращает {"jams": [...], "road_zones": [...]}
    """
    import math

    vehicles: dict         = state.setdefault("_tj_vehicles", {})
    frame_count: int       = state.get("_tj_frame_count", 0)
    last_valid_boxes: dict = state.get("_tj_last_boxes", {})

    FPS                   = state.get("_fps", 25)
    POSITIONS_HISTORY     = 15
    BASE_PIXELS_PER_METER = 7.5
    JAM_SPEED_MAX         = 15    # км/ч
    JAM_DISTANCE          = 100   # пикселей между центрами
    JAM_MIN_VEHICLES      = 3

    road_zones = getattr(camera, "road_zones", None) or []

    # строим маску дороги для фильтрации машин вне зоны
    h, w = frame.shape[:2]
    road_mask = np.zeros((h, w), dtype=np.uint8)
    for zone in road_zones:
        cv2.fillPoly(road_mask, [np.array(zone, dtype=np.int32)], 255)

    # обновляем трекинг каждые 2 кадра
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

                # пропускаем машины вне road_zones
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
                    veh["last_seen"]  = 0
                    veh["last_box"]   = (x1, y1, x2, y2)
                    if len(veh["positions"]) > POSITIONS_HISTORY:
                        veh["positions"].pop(0)

                    if len(veh["positions"]) >= 4:
                        speeds = []
                        pos = veh["positions"]
                        for i in range(1, len(pos)):
                            dx = pos[i][0] - pos[i-1][0]
                            dy = pos[i][1] - pos[i-1][1]
                            d  = math.sqrt(dx*dx + dy*dy)
                            s  = (d / (1.0 / FPS) / BASE_PIXELS_PER_METER) * 3.6
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
                bx1 = min(v["box"][0] for v in group)
                by1 = min(v["box"][1] for v in group)
                bx2 = max(v["box"][2] for v in group)
                by2 = max(v["box"][3] for v in group)
                avg_spd = sum(v["speed"] for v in group) / len(group)
                jams.append({"box": (bx1, by1, bx2, by2),
                              "vehicle_count": len(group),
                              "avg_speed": avg_spd})

    return {"jams": jams, "road_zones": road_zones}


def _detect_illegal_stop(frame: np.ndarray, results, camera, state: dict) -> dict:
    """
    Незаконная стоянка.
    Запретная зона = road_zones МИНУС stop_zones (разрешённые парковки).
    Возвращает {"violations": [...], "road_zones": [...], "stop_zones": [...]}
    """
    road_zones = getattr(camera, "road_zones",  None) or []
    stop_zones = getattr(camera, "stop_zones",  None) or []

    # маска запретной зоны
    h, w = frame.shape[:2]
    forbidden_mask = np.zeros((h, w), dtype=np.uint8)
    for zone in road_zones:
        cv2.fillPoly(forbidden_mask, [np.array(zone, dtype=np.int32)], 255)
    for zone in stop_zones:
        cv2.fillPoly(forbidden_mask, [np.array(zone, dtype=np.int32)], 0)   # вычитаем разрешённые

    fps: float      = state.get("_fps", 25)
    frame_num: int  = state.get("_is_frame_num", 0)
    current_time    = frame_num / fps

    last_positions  : dict = state.setdefault("_is_last_pos",    {})
    stop_start_time : dict = state.setdefault("_is_stop_start",  {})
    statuses        : dict = state.setdefault("_is_statuses",    {})
    violation_fixed : dict = state.setdefault("_is_viol_fixed",  {})

    STOP_THRESHOLD = 1   # секунд до нарушения
    MOVE_THRESHOLD = 2   # пикселей

    violations = []

    CAR_CLASSES = {2, 3, 5, 7}  # car, motorcycle, bus, truck — только транспорт

    if results is not None and results.boxes is not None and results.boxes.id is not None:
        boxes     = results.boxes.xyxy.cpu().numpy()
        track_ids = results.boxes.id.cpu().numpy().astype(int)
        cls_ids   = results.boxes.cls.cpu().numpy().astype(int)

        for box, tid, cls in zip(boxes, track_ids, cls_ids):
            if cls not in CAR_CLASSES:
                continue
            cx = int((box[0] + box[2]) / 2)
            cy = int((box[1] + box[3]) / 2)
            center = (float(cx), float(cy))

            # проверяем по маске (не pointPolygonTest — зона составная)
            cy_c = min(cy, h - 1); cx_c = min(cx, w - 1)
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
    """
    Пешеходы на проезжей части вне пешеходного перехода.
    Опасная зона = road_zones МИНУС crosswalk_zones.
    Возвращает {"pedestrians": [...], "road_zones": [...], "crosswalk_zones": [...]}
    """
    road_zones      = getattr(camera, "road_zones",      None) or []
    crosswalk_zones = getattr(camera, "crosswalk_zones", None) or []

    h, w = frame.shape[:2]
    danger_mask = np.zeros((h, w), dtype=np.uint8)
    for zone in road_zones:
        cv2.fillPoly(danger_mask, [np.array(zone, dtype=np.int32)], 255)
    for zone in crosswalk_zones:
        cv2.fillPoly(danger_mask, [np.array(zone, dtype=np.int32)], 0)   # вычитаем переходы

    violated_ids: set = state.setdefault("_ped_violated", set())
    pedestrians = []

    if results is not None and results.boxes is not None:
        boxes   = results.boxes.xyxy.cpu().numpy()
        cls_ids = results.boxes.cls.cpu().numpy().astype(int)
        confs   = results.boxes.conf.cpu().numpy()
        for box, cls, conf in zip(boxes, cls_ids, confs):
            if cls != 0:       # только person (class 0)
                continue
            if conf < 0.35:    # conf=0.35 как в оригинальном детект_пешехода.py
                continue
            x1, y1, x2, y2 = map(int, box)
            foot_x = (x1 + x2) // 2
            foot_y = y2
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


# =============================================================================
# CAMERA WORKER — запускается при старте, работает всегда независимо от WS
# =============================================================================

# =============================================================================
# НАСТРОЙКИ ВОРКЕРА
# =============================================================================

os.makedirs(INCIDENTS_PHOTOS_DIR, exist_ok=True)


def _reset_detector_state(worker_state: dict):
    """
    Сбрасывает накопленное состояние всех детекторов.
    Вызывается при изменении зон камеры — иначе старые violation_fixed и
    stop_start_time остаются актуальными для зон, которых уже нет.
    """
    keys_to_clear = [
        # illegal_stop
        "_is_last_pos", "_is_stop_start", "_is_statuses", "_is_viol_fixed", "_is_frame_num",
        # pedestrian
        "_ped_violated",
        # traffic_jam — треки машин сбрасываем тоже
        "_tj_vehicles", "_tj_last_boxes", "_tj_frame_count",
    ]
    for k in keys_to_clear:
        worker_state.pop(k, None)
    print("[camera_worker] Состояние детекторов сброшено (изменились зоны)")


def _save_incident(camera, incident_type: str, frame: np.ndarray,
                   boxes: list, label: str, box_color: tuple,
                   last_saved: dict):
    """
    Сохраняет инцидент в БД и (опционально) скриншот на диск.
    Пропускает если не истёк INCIDENT_SAVE_COOLDOWN.

    boxes      — список bbox нарушителей [(x1,y1,x2,y2), ...]
    last_saved — worker_state["_last_saved"]
    """
    key = (camera.id, incident_type)
    now = time.time()

    if now - last_saved.get(key, 0) < INCIDENT_SAVE_COOLDOWN:
        return

    last_saved[key] = now

    # --- скриншот ---
    filename = None
    if SAVE_INCIDENT_SCREENSHOTS:
        screenshot = frame.copy()
        for (x1, y1, x2, y2) in boxes:
            cv2.rectangle(screenshot, (x1, y1), (x2, y2), box_color, 2)
            bbox_f = _FONT.getbbox(label)
            tw, th = bbox_f[2] - bbox_f[0], bbox_f[3] - bbox_f[1]
            cv2.rectangle(screenshot, (x1, y1 - th - 8), (x1 + tw + 4, y1), box_color, -1)
            screenshot = _put_text(screenshot, label, (x1 + 2, y1 - th - 6), (0, 0, 0))

        ts = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        filename = f"{camera.id}_{incident_type}_{ts}.jpg"
        try:
            cv2.imwrite(os.path.join(INCIDENTS_PHOTOS_DIR, filename), screenshot)
        except Exception as e:
            print(f"[incident] Ошибка сохранения скриншота: {e}")
            filename = None

    # --- запись в БД ---
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

        # Рассылаем уведомления подписчикам (в фоне)
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


async def camera_worker(camera):
    """
    Бесконечно читает поток camera.url.
    Один раз вызывает model.track на кадр, передаёт results во все детекторы.

    Каждые CAMERA_ZONES_REFRESH_INTERVAL секунд перечитывает зоны из БД.
    При изменении зон — сбрасывает состояние детекторов (_reset_detector_state),
    чтобы старые нарушения не «залипали» в новой разметке.

    ДЕТЕКТОРЫ (закомментируй строку чтобы выключить):
        _detect_traffic_jam   — пробки              (зона: road_zones)
        _detect_illegal_stop  — незаконная стоянка   (зона: road_zones − stop_zones)
        _detect_pedestrian    — пешеходы на дороге   (зона: road_zones − crosswalk_zones)
    """
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
        "incidents": {
            "traffic_jam":  None,
            "illegal_stop": None,
            "pedestrian":   None,
        },
    }

    CAR_CLASSES = [2, 3, 5, 7]
    PED_CLASSES = [0]
    ALL_CLASSES = list(set(CAR_CLASSES + PED_CLASSES))

    error_count        = 0
    MAX_ERRORS         = 10
    last_zones_refresh = 0.0
    _current_incidents = None  # читается из DB каждые CAMERA_ZONES_REFRESH_INTERVAL сек

    # Снимок зон на момент последней проверки — для сравнения
    _prev_zones = {
        "road_zones":      list(camera.road_zones      or []),
        "stop_zones":      list(camera.stop_zones      or []),
        "crosswalk_zones": list(camera.crosswalk_zones or []),
    }

    while True:
        try:
            # ── обновляем зоны из БД ────────────────────────────────────────
            now = time.time()
            if now - last_zones_refresh >= CAMERA_ZONES_REFRESH_INTERVAL:
                try:
                    db = SessionLocal()
                    fresh = db.query(Camera).filter(Camera.id == camera.id).first()
                    if fresh:
                        # Читаем incidents через raw SQL (не в ORM)
                        _current_incidents = _get_camera_incidents(camera.id)

                        new_zones = {
                            "road_zones":      list(fresh.road_zones      or []),
                            "stop_zones":      list(fresh.stop_zones      or []),
                            "crosswalk_zones": list(fresh.crosswalk_zones or []),
                        }
                        if new_zones != _prev_zones:
                            # зоны изменились — применяем и сбрасываем детекторы
                            camera.road_zones      = fresh.road_zones      or []
                            camera.stop_zones      = fresh.stop_zones      or []
                            camera.crosswalk_zones = fresh.crosswalk_zones or []
                            camera.lane_lines      = fresh.lane_lines      or []
                            _reset_detector_state(worker_state)
                            _prev_zones = new_zones
                finally:
                    db.close()
                last_zones_refresh = now

            # ── проверяем управление детекцией (из столбца incidents в БД) ──
            # None  → все типы активны
            # False → камера отключена — завершаем воркер (watchdog перезапустит при re-enable)
            # [..]  → только указанные типы
            if _current_incidents is False:
                print(f"[camera_worker] Камера {camera.id} ({camera.name}): отключена, завершаю воркер")
                cap.release()
                _running_camera_ids.discard(camera.id)
                return

            # ── читаем кадр ─────────────────────────────────────────────────
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

            # ── model.track — один вызов на кадр ────────────────────────────
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

            # Определяем какие детекторы запускать
            _inc = _current_incidents   # None | list
            if _inc is None:
                run_tj = run_is = run_ped = True
            else:
                run_tj  = "traffic_jam"  in _inc
                run_is  = "illegal_stop" in _inc
                run_ped = "pedestrian"   in _inc

            # ── детекторы ────────────────────────────────────────────────────
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
# =============================================================================
# ОТРИСОВКА ИНЦИДЕНТОВ — вызывается в WebSocket для каждого клиента
# =============================================================================

def draw_incidents(frame: np.ndarray, incidents: dict, filters: list[str]) -> np.ndarray:
    """
    Рисует инциденты на копии кадра.
    filters — список ключей или ["all"].

    Закомментируй if-блок конкретного инцидента чтобы не отрисовывать его клиенту.
    Чтобы совсем убрать детекцию — иди в camera_worker.
    """
    result = frame.copy()
    keys   = list(incidents.keys()) if "all" in filters else filters

    for key in keys:
        data = incidents.get(key)
        if not data:
            continue

        # ── пробки ── цвет (26, 165, 246) оранжево-жёлтый ──────────────────
        if key == "traffic_jam":
            COLOR = (26, 165, 246)   # BGR — оранжевый
            _fill_zones(result, data.get("road_zones", []), COLOR, alpha=0.08, border=1)
            for jam in data.get("jams", []):
                x1, y1, x2, y2 = jam["box"]
                overlay = result.copy()
                cv2.rectangle(overlay, (x1, y1), (x2, y2), COLOR, -1)
                cv2.addWeighted(overlay, 0.3, result, 0.7, 0, result)
                cv2.rectangle(result, (x1, y1), (x2, y2), COLOR, 2)
                label = f"Затор  {jam['avg_speed']:.0f} км/ч  ({jam['vehicle_count']} авт.)"
                result = _label_box(result, label, x1, y1, COLOR)

        # ── незаконная стоянка ── красный ────────────────────────────────────
        elif key == "illegal_stop":
            ROAD_COLOR = (200, 200, 200)  # серый — проезжая часть
            STOP_COLOR = (0, 200, 0)      # зелёный — разрешённые парковки
            VIOL_COLOR = (0, 0, 255)      # красный — нарушитель
            _fill_zones(result, data.get("road_zones",  []), ROAD_COLOR, alpha=0.10, border=1)
            _fill_zones(result, data.get("stop_zones",  []), STOP_COLOR, alpha=0.15, border=2)
            for v in data.get("violations", []):
                x1, y1, x2, y2 = v["box"]
                cv2.rectangle(result, (x1, y1), (x2, y2), VIOL_COLOR, 2)
                result = _label_box(result, "Стоянка в неположенном месте", x1, y1, VIOL_COLOR)

        # ── пешеходы ── оранжевый (246, 130, 50) ────────────────────────────
        elif key == "pedestrian":
            ROAD_COLOR  = (200, 200, 200)   # серый — проезжая часть
            CROSS_COLOR = (0, 200, 100)     # зелёный — переходы (безопасно)
            PED_COLOR   = (50, 130, 246)    # BGR — оранжевый из оригинала
            _fill_zones(result, data.get("road_zones",      []), ROAD_COLOR,  alpha=0.08, border=1)
            _fill_zones(result, data.get("crosswalk_zones", []), CROSS_COLOR, alpha=0.15, border=2)
            for p in data.get("pedestrians", []):
                x1, y1, x2, y2 = p["box"]
                cv2.rectangle(result, (x1, y1), (x2, y2), PED_COLOR, 2)
                result = _label_box(result, "Пешеход на проезжей части вне перехода", x1, y1, PED_COLOR)

    return result
def generate_incidents(count, cameras, seconds_back):
    incidents_list = []
    types = ['ДТП', 'Превышение скорости', 'Нарушение разметки', 'Остановка запрещена']
    now = datetime.now()
    start_date = now - timedelta(seconds=seconds_back)

    for _ in range(count):
        # Генерируем случайное время в заданном диапазоне
        random_delta = random.uniform(0, seconds_back)
        incident_time = start_date + timedelta(seconds=random_delta)
        
        incidents_list.append({
            'time': incident_time.strftime('%Y:%m:%dT%H:%M:%S'),
            'camera': random.choice(cameras),
            'incident': random.choice(types),
            'seriousness': random.randint(1, 5)
        })

    # Сортируем по ключу time
    return sorted(incidents_list, key=lambda x: x['time'])

@app.get("/notifications")
async def notifi(cameras,time,paramU, current_user: str | bool = Depends(get_current_user)):
    

    cams = ['Шоссе Энтузиастов Пересечение с 3-м кольцом', 'Волгоградский проспект Метро Кузьминки', 'Улица Люблинская Пересечение с улицей Шкулева']
    #notifications = generate_incidents(50, cams, 3600)
    notifications = [ { "time": "2026:04:19T22:44:01", "camera": "Улица Люблинская Пересечение с улицей Шкулева", "incident": "Остановка запрещена", "seriousness": 3 }, { "time": "2026:04:19T22:45:08", "camera": "Улица Люблинская Пересечение с улицей Шкулева", "incident": "ДТП", "seriousness": 1 }, { "time": "2026:04:19T22:47:09", "camera": "Волгоградский проспект Метро Кузьминки", "incident": "ДТП", "seriousness": 4 }, { "time": "2026:04:19T22:52:27", "camera": "Волгоградский проспект Метро Кузьминки", "incident": "Остановка запрещена", "seriousness": 2 }, { "time": "2026:04:19T22:53:49", "camera": "Волгоградский проспект Метро Кузьминки", "incident": "ДТП", "seriousness": 3 }, { "time": "2026:04:19T22:54:41", "camera": "Волгоградский проспект Метро Кузьминки", "incident": "Превышение скорости", "seriousness": 1 }, { "time": "2026:04:19T22:58:26", "camera": "Улица Люблинская Пересечение с улицей Шкулева", "incident": "ДТП", "seriousness": 5 }, { "time": "2026:04:19T22:59:04", "camera": "Волгоградский проспект Метро Кузьминки", "incident": "Превышение скорости", "seriousness": 5 }, { "time": "2026:04:19T22:59:17", "camera": "Улица Люблинская Пересечение с улицей Шкулева", "incident": "Превышение скорости", "seriousness": 5 }, { "time": "2026:04:19T23:02:33", "camera": "Волгоградский проспект Метро Кузьминки", "incident": "Остановка запрещена", "seriousness": 1 }, { "time": "2026:04:19T23:03:21", "camera": "Улица Люблинская Пересечение с улицей Шкулева", "incident": "Превышение скорости", "seriousness": 3 }, { "time": "2026:04:19T23:05:16", "camera": "Волгоградский проспект Метро Кузьминки", "incident": "Нарушение разметки", "seriousness": 3 }, { "time": "2026:04:19T23:06:01", "camera": "Волгоградский проспект Метро Кузьминки", "incident": "Остановка запрещена", "seriousness": 4 }, { "time": "2026:04:19T23:06:06", "camera": "Шоссе Энтузиастов Пересечение с 3-м кольцом", "incident": "Остановка запрещена", "seriousness": 4 }, { "time": "2026:04:19T23:06:36", "camera": "Волгоградский проспект Метро Кузьминки", "incident": "Нарушение разметки", "seriousness": 5 }, { "time": "2026:04:19T23:06:57", "camera": "Улица Люблинская Пересечение с улицей Шкулева", "incident": "Превышение скорости", "seriousness": 4 }, { "time": "2026:04:19T23:07:26", "camera": "Улица Люблинская Пересечение с улицей Шкулева", "incident": "ДТП", "seriousness": 4 }, { "time": "2026:04:19T23:07:29", "camera": "Улица Люблинская Пересечение с улицей Шкулева", "incident": "Нарушение разметки", "seriousness": 2 }, { "time": "2026:04:19T23:08:05", "camera": "Улица Люблинская Пересечение с улицей Шкулева", "incident": "Остановка запрещена", "seriousness": 4 }, { "time": "2026:04:19T23:08:35", "camera": "Улица Люблинская Пересечение с улицей Шкулева", "incident": "Нарушение разметки", "seriousness": 3 }, { "time": "2026:04:19T23:11:50", "camera": "Волгоградский проспект Метро Кузьминки", "incident": "Превышение скорости", "seriousness": 5 }, { "time": "2026:04:19T23:12:04", "camera": "Волгоградский проспект Метро Кузьминки", "incident": "Остановка запрещена", "seriousness": 2 }, { "time": "2026:04:19T23:14:44", "camera": "Улица Люблинская Пересечение с улицей Шкулева", "incident": "Остановка запрещена", "seriousness": 5 }, { "time": "2026:04:19T23:14:51", "camera": "Волгоградский проспект Метро Кузьминки", "incident": "Остановка запрещена", "seriousness": 4 }, { "time": "2026:04:19T23:15:29", "camera": "Волгоградский проспект Метро Кузьминки", "incident": "Нарушение разметки", "seriousness": 3 }, { "time": "2026:04:19T23:16:44", "camera": "Волгоградский проспект Метро Кузьминки", "incident": "Нарушение разметки", "seriousness": 1 }, { "time": "2026:04:19T23:17:09", "camera": "Улица Люблинская Пересечение с улицей Шкулева", "incident": "Остановка запрещена", "seriousness": 4 }, { "time": "2026:04:19T23:17:24", "camera": "Улица Люблинская Пересечение с улицей Шкулева", "incident": "Остановка запрещена", "seriousness": 3 }, { "time": "2026:04:19T23:19:50", "camera": "Улица Люблинская Пересечение с улицей Шкулева", "incident": "Остановка запрещена", "seriousness": 3 }, { "time": "2026:04:19T23:21:04", "camera": "Волгоградский проспект Метро Кузьминки", "incident": "Остановка запрещена", "seriousness": 4 }, { "time": "2026:04:19T23:21:04", "camera": "Улица Люблинская Пересечение с улицей Шкулева", "incident": "Остановка запрещена", "seriousness": 4 }, { "time": "2026:04:19T23:23:06", "camera": "Шоссе Энтузиастов Пересечение с 3-м кольцом", "incident": "Превышение скорости", "seriousness": 2 }, { "time": "2026:04:19T23:24:44", "camera": "Волгоградский проспект Метро Кузьминки", "incident": "Нарушение разметки", "seriousness": 5 }, { "time": "2026:04:19T23:25:32", "camera": "Шоссе Энтузиастов Пересечение с 3-м кольцом", "incident": "Превышение скорости", "seriousness": 4 }, { "time": "2026:04:19T23:26:11", "camera": "Волгоградский проспект Метро Кузьминки", "incident": "Нарушение разметки", "seriousness": 1 }, { "time": "2026:04:19T23:26:24", "camera": "Шоссе Энтузиастов Пересечение с 3-м кольцом", "incident": "Превышение скорости", "seriousness": 5 }, { "time": "2026:04:19T23:26:29", "camera": "Волгоградский проспект Метро Кузьминки", "incident": "Превышение скорости", "seriousness": 5 }, { "time": "2026:04:19T23:27:04", "camera": "Волгоградский проспект Метро Кузьминки", "incident": "Превышение скорости", "seriousness": 5 }, { "time": "2026:04:19T23:27:47", "camera": "Волгоградский проспект Метро Кузьминки", "incident": "ДТП", "seriousness": 5 }, { "time": "2026:04:19T23:29:46", "camera": "Шоссе Энтузиастов Пересечение с 3-м кольцом", "incident": "Нарушение разметки", "seriousness": 5 }, { "time": "2026:04:19T23:30:22", "camera": "Волгоградский проспект Метро Кузьминки", "incident": "ДТП", "seriousness": 5 }, { "time": "2026:04:19T23:31:36", "camera": "Волгоградский проспект Метро Кузьминки", "incident": "Превышение скорости", "seriousness": 3 }, { "time": "2026:04:19T23:33:23", "camera": "Шоссе Энтузиастов Пересечение с 3-м кольцом", "incident": "ДТП", "seriousness": 4 }, { "time": "2026:04:19T23:36:28", "camera": "Улица Люблинская Пересечение с улицей Шкулева", "incident": "Превышение скорости", "seriousness": 1 }, { "time": "2026:04:19T23:37:01", "camera": "Шоссе Энтузиастов Пересечение с 3-м кольцом", "incident": "Превышение скорости", "seriousness": 2 }, { "time": "2026:04:19T23:37:39", "camera": "Волгоградский проспект Метро Кузьминки", "incident": "Остановка запрещена", "seriousness": 2 }, { "time": "2026:04:19T23:39:34", "camera": "Улица Люблинская Пересечение с улицей Шкулева", "incident": "Нарушение разметки", "seriousness": 4 }, { "time": "2026:04:19T23:39:52", "camera": "Шоссе Энтузиастов Пересечение с 3-м кольцом", "incident": "Нарушение разметки", "seriousness": 4 }, { "time": "2026:04:19T23:41:15", "camera": "Шоссе Энтузиастов Пересечение с 3-м кольцом", "incident": "ДТП", "seriousness": 5 }, { "time": "2026:04:19T23:41:42", "camera": "Улица Люблинская Пересечение с улицей Шкулева", "incident": "Нарушение разметки", "seriousness": 5 } ]
    #print(notifications)
    return {'user' : current_user, 'notifications' : notifications}


@app.get("/camera-zones")
async def get_camera_zones(
    name: str = Query(...),
    db: Session = Depends(get_db)
):

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
 
 
@app.post("/camera-zones")
async def save_camera_zones(
    data: dict = Body(...),
    current_user: str | bool = Depends(get_current_user),
    db: Session = Depends(get_db)
):


    #if not current_user:
     #   raise HTTPException(status_code=401, detail="Не авторизован")
 
    camera_name = data.get("name")
    zones = data.get("zones", {})
 
    camera = db.query(Camera).filter(Camera.name == camera_name).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Камера не найдена")
 
    # Валидация: каждый полигон должен содержать >= 3 точки,
    # каждая точка — [x, y] с числовыми координатами
    for zone_key in ["road_zones", "stop_zones", "crosswalk_zones", "lane_lines"]:
        polygons = zones.get(zone_key, [])
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