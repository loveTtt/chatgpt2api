from __future__ import annotations

import os
from pathlib import Path

from services.storage.base import StorageBackend
from services.storage.database_storage import DatabaseStorageBackend
from services.storage.json_storage import JSONStorageBackend


SUPPORTED_STORAGE_BACKENDS = "json, sqlite, postgres"


def create_storage_backend(data_dir: Path) -> StorageBackend:
    """
    根据环境变量创建存储后端

    环境变量：
    - STORAGE_BACKEND: json|sqlite|postgres (默认 json)
    - DATABASE_URL: 数据库连接字符串 (用于 sqlite/postgres)
    """
    backend_type = os.getenv("STORAGE_BACKEND", "json").lower().strip()

    print(f"[storage] Initializing storage backend: {backend_type}")

    if backend_type == "json":
        file_path = data_dir / "accounts.json"
        auth_keys_path = data_dir / "auth_keys.json"
        public_works_path = data_dir / "public_works.json"
        print(f"[storage] Using JSON storage: {file_path}")
        return JSONStorageBackend(file_path, auth_keys_path, public_works_path)

    if backend_type in ("sqlite", "postgres", "postgresql", "mysql", "database"):
        database_url = os.getenv("DATABASE_URL", "").strip()

        if not database_url:
            database_url = f"sqlite:///{data_dir / 'accounts.db'}"
            print(f"[storage] No DATABASE_URL provided, using local SQLite: {database_url}")
        else:
            print(f"[storage] Using database storage: {_mask_password(database_url)}")

        return DatabaseStorageBackend(database_url)

    raise ValueError(
        f"Unknown storage backend: {backend_type}. "
        f"Supported backends: {SUPPORTED_STORAGE_BACKENDS}"
    )


def _mask_password(url: str) -> str:
    """隐藏数据库连接字符串中的密码"""
    if "://" not in url:
        return url
    try:
        protocol, rest = url.split("://", 1)
        if "@" in rest:
            credentials, host = rest.split("@", 1)
            if ":" in credentials:
                username, _ = credentials.split(":", 1)
                return f"{protocol}://{username}:****@{host}"
        return url
    except Exception:
        return url
