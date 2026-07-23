"""Dataset database model."""
import uuid
from sqlalchemy import BigInteger, Column, DateTime, ForeignKey, Integer, JSON, String, Text, Uuid, func
from app.models.base import Base


class Dataset(Base):
    __tablename__ = "datasets"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    storage_path = Column(String(1024), nullable=False, unique=True)
    file_name = Column(String(255), nullable=False)
    file_size_bytes = Column(BigInteger, nullable=False)
    row_count = Column(Integer, nullable=False)
    column_count = Column(Integer, nullable=False)
    column_info = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
