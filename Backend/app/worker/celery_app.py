from celery import Celery

from app.core.config import settings


celery_app = Celery(
    "worker",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=[
        "app.worker.tasks",
        "app.worker.training_tasks",  # V2 job compatibility
        "app.worker.run_tasks",       # active V3 run architecture
    ],
    broker_connection_retry_on_startup=True,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_soft_time_limit=3300,
    task_time_limit=3600,
    task_default_retry_delay=300,
    task_max_retries=1,
    result_expires=86400,
    task_track_started=True,
    task_send_sent_event=True,
    worker_prefetch_multiplier=1,
    worker_max_tasks_per_child=5,
    worker_disable_rate_limits=True,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
)
