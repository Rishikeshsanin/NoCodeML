from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.core.config import settings
from app.models import Base


config = context.config
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _configure_context(**kwargs) -> None:
    context.configure(
        target_metadata=target_metadata,
        version_table="alembic_version",
        version_table_schema=settings.DB_SCHEMA if settings.is_postgres else None,
        include_schemas=settings.is_postgres,
        compare_type=True,
        **kwargs,
    )


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    _configure_context(
        url=url,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        if settings.is_postgres:
            context.execute(f'SET search_path TO "{settings.DB_SCHEMA}"')
        context.run_migrations()


def run_migrations_online() -> None:
    section = config.get_section(config.config_ini_section, {})
    connect_args = settings.database_connect_args if settings.is_postgres else {}

    connectable = engine_from_config(
        section,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        connect_args=connect_args,
    )

    with connectable.connect() as connection:
        if settings.is_postgres:
            connection.exec_driver_sql(f'SET search_path TO "{settings.DB_SCHEMA}"')
            connection.commit()

        _configure_context(connection=connection)

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
