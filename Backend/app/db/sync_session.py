from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings


sync_database_url = settings.DATABASE_URL.replace(
    "sqlite+aiosqlite://", "sqlite://", 1
)

sync_engine_kwargs = {
    "pool_pre_ping": True,
    "echo": False,
    "future": True,
}

if sync_database_url.startswith("postgresql"):
    sync_engine_kwargs.update(
        {
            "connect_args": settings.database_connect_args,
            "pool_size": 5,
            "max_overflow": 10,
            "pool_recycle": 3600,
        }
    )

sync_engine = create_engine(sync_database_url, **sync_engine_kwargs)
SyncSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=sync_engine)


def get_sync_db():
    db = SyncSessionLocal()
    try:
        yield db
    finally:
        db.close()
