from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime, Float, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import sessionmaker, Session
from pydantic import BaseModel, EmailStr
from passlib.context import CryptContext
from argon2 import PasswordHasher
from jose import jwt, JWTError
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv
import os

load_dotenv()

ph = PasswordHasher()

INCIDENT_SAVE_COOLDOWN       = 5 * 60
CAMERA_ZONES_REFRESH_INTERVAL = 10
INCIDENTS_PHOTOS_DIR          = "incidents"
SAVE_INCIDENT_SCREENSHOTS     = True

DATABASE_URL = "postgresql://postgres:1234@localhost:5432/apd"

engine       = create_engine(DATABASE_URL, pool_pre_ping=True, pool_recycle=300)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base         = declarative_base()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

SECRET_KEY                  = "t4567u8iujyhtrge"
ALGORITHM                   = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 1440


class Counter(Base):
    __tablename__ = "counter"
    id    = Column(Integer, primary_key=True, index=True)
    value = Column(Integer, default=0)


class Data(Base):
    __tablename__ = "data"
    id       = Column(Integer, primary_key=True, autoincrement=True)
    name     = Column(String(255), nullable=False, unique=True)
    data     = Column(JSONB)
    requests = Column(JSONB)


class User(Base):
    __tablename__ = "users"
    id               = Column(Integer, primary_key=True, index=True)
    name             = Column(String, nullable=False)
    email            = Column(String, unique=True, nullable=False, index=True)
    password_hash    = Column(String, nullable=False)
    self_cams        = Column(JSONB, default=dict)
    notifications    = Column(JSONB, default=dict)
    telegram         = Column(String(255), nullable=True)
    telegram_chat_id = Column(String(255), nullable=True)
    email_verified   = Column(String(64), nullable=True)   # 'true' | None
    email_verify_code = Column(String(64), nullable=True)

    def __repr__(self):
        return f"<User email={self.email}>"


class Camera(Base):
    __tablename__ = "cameras"
    id              = Column(Integer, primary_key=True, autoincrement=True)
    name            = Column(String(255), nullable=False, unique=True)
    coord           = Column(JSONB, nullable=False)
    url             = Column(String(255), nullable=False)
    road_zones      = Column(JSONB, nullable=False, server_default='[]')
    stop_zones      = Column(JSONB, nullable=False, server_default='[]')
    crosswalk_zones = Column(JSONB, nullable=False, server_default='[]')
    lane_lines      = Column(JSONB, nullable=False, server_default='[]')
    speed_limit     = Column(Float, nullable=False, server_default='60')


class Incident(Base):
    __tablename__ = "incidents"
    id                = Column(Integer, primary_key=True, autoincrement=True)
    date              = Column(DateTime(timezone=True), default=datetime.utcnow)
    camera            = Column(String(255), nullable=False)
    notification_text = Column(Text, nullable=False)
    screenshot_name   = Column(String(255))
    severity          = Column(Integer, nullable=False)
    mistake           = Column(JSONB, nullable=False, server_default='[]')


class SuperAdmin(Base):
    __tablename__ = "superadmins"
    id    = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String(255), nullable=False, unique=True)


class AppSettings(Base):
    __tablename__ = "app_settings"
    id       = Column(Integer, primary_key=True, autoincrement=True)
    settings = Column(JSONB, nullable=False, server_default='{}')


class EmailSchema(BaseModel):
    to: EmailStr
    subject: str
    body: str


class CounterResponse(BaseModel):
    value: int


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _get_camera_incidents(camera_id):
    """Читает столбец incidents из cameras через raw SQL."""
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
    """Записывает столбец incidents через raw SQL."""
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


def run_migrations():
    db = SessionLocal()
    try:
        from sqlalchemy import text as _text
        Base.metadata.create_all(engine)
        for sql in [
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified VARCHAR(64)",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verify_code VARCHAR(64)",
            "ALTER TABLE cameras ADD COLUMN IF NOT EXISTS speed_limit FLOAT NOT NULL DEFAULT 60",
            "SELECT setval('cameras_id_seq', GREATEST((SELECT COALESCE(MAX(id),0) FROM cameras), 1))",
            "SELECT setval('users_id_seq',   GREATEST((SELECT COALESCE(MAX(id),0) FROM users),   1))",
            "SELECT setval('data_id_seq',    GREATEST((SELECT COALESCE(MAX(id),0) FROM data),    1))",
        ]:
            db.execute(_text(sql))
        # Seed default app_settings row if missing
        existing = db.execute(_text("SELECT COUNT(*) FROM app_settings")).scalar()
        if existing == 0:
            import json as _j
            defaults = _j.dumps({
                "incident_save_cooldown": 300,
                "camera_zones_refresh_interval": 10,
                "save_incident_screenshots": True,
                "default_speed_limit_kmh": 60.0,
                "base_px_per_meter": 7.5,
                "acc_display_frames": 270,
                "watchdog_interval": 30,
            })
            db.execute(_text(f"INSERT INTO app_settings (settings) VALUES ('{defaults}'::jsonb)"))
        db.commit()
    except Exception as e:
        print(f"[migrations] {e}")
        db.rollback()
    finally:
        db.close()


def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
