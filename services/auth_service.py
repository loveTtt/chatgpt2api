from __future__ import annotations

import hashlib
import hmac
import secrets
import uuid
from datetime import datetime, timezone
from threading import Lock
from typing import Literal

from services.config import config
from services.storage.base import StorageBackend

AuthRole = Literal["admin", "user"]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _hash_key(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


class AuthService:
    def __init__(self, storage: StorageBackend):
        self.storage = storage
        self._lock = Lock()
        self._items = self._load()
        self._last_used_flush_at: dict[str, datetime] = {}

    @staticmethod
    def _clean(value: object) -> str:
        return str(value or "").strip()

    @staticmethod
    def _safe_int(value: object, default: int = 0) -> int:
        if isinstance(value, bool):
            return int(value)
        if isinstance(value, (int, float, str)):
            try:
                return int(value)
            except ValueError:
                return default
        return default

    @staticmethod
    def _is_expired(value: object) -> bool:
        expires_at = str(value or "").strip()
        if not expires_at:
            return False
        try:
            expires = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
        except ValueError:
            return False
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        return expires <= datetime.now(timezone.utc)

    def _normalize_item(self, raw: object) -> dict[str, object] | None:
        if not isinstance(raw, dict):
            return None
        role = self._clean(raw.get("role")).lower()
        if role not in {"admin", "user"}:
            return None
        key_hash = self._clean(raw.get("key_hash"))
        if not key_hash:
            return None
        item_id = self._clean(raw.get("id")) or uuid.uuid4().hex[:12]
        scope = self._clean(raw.get("scope")).lower()
        if scope not in {"", "image_link"}:
            scope = ""
        name = self._clean(raw.get("name")) or ("管理员密钥" if role == "admin" else "授权画图链接" if scope == "image_link" else "普通用户")
        created_at = self._clean(raw.get("created_at")) or _now_iso()
        last_used_at = self._clean(raw.get("last_used_at")) or None
        item = {
            "id": item_id,
            "name": name,
            "role": role,
            "key_hash": key_hash,
            "enabled": bool(raw.get("enabled", True)),
            "created_at": created_at,
            "last_used_at": last_used_at,
        }
        if scope:
            quota_limit = max(0, self._safe_int(raw.get("quota_limit")))
            quota_used = min(quota_limit, max(0, self._safe_int(raw.get("quota_used"))))
            item.update(
                {
                    "scope": scope,
                    "quota_limit": quota_limit,
                    "quota_used": quota_used,
                    "expires_at": self._clean(raw.get("expires_at")) or None,
                    "created_by": self._clean(raw.get("created_by")) or None,
                }
            )
            raw_key = self._clean(raw.get("key"))
            if raw_key:
                item["key"] = raw_key
        return item

    def _load(self) -> list[dict[str, object]]:
        try:
            items = self.storage.load_auth_keys()
        except Exception:
            return []
        if not isinstance(items, list):
            return []
        return [normalized for item in items if (normalized := self._normalize_item(item)) is not None]

    def _save(self) -> None:
        self.storage.save_auth_keys(self._items)

    @staticmethod
    def _public_item(item: dict[str, object]) -> dict[str, object]:
        result = {
            "id": item.get("id"),
            "name": item.get("name"),
            "role": item.get("role"),
            "enabled": bool(item.get("enabled", True)),
            "created_at": item.get("created_at"),
            "last_used_at": item.get("last_used_at"),
        }
        if item.get("scope") == "image_link":
            quota_limit = AuthService._safe_int(item.get("quota_limit"))
            quota_used = AuthService._safe_int(item.get("quota_used"))
            result.update(
                {
                    "scope": "image_link",
                    "quota_limit": quota_limit,
                    "quota_used": quota_used,
                    "quota_remaining": max(0, quota_limit - quota_used),
                    "expires_at": item.get("expires_at"),
                    "created_by": item.get("created_by"),
                    "key": item.get("key"),
                }
            )
        return result

    def list_keys(self, role: AuthRole | None = None, *, scope: str | None = None) -> list[dict[str, object]]:
        with self._lock:
            items = [
                item
                for item in self._items
                if (role is None or item.get("role") == role) and (scope is None or item.get("scope", "") == scope)
            ]
            return [self._public_item(item) for item in items]

    def create_key(self, *, role: AuthRole, name: str = "") -> tuple[dict[str, object], str]:
        normalized_name = self._clean(name) or ("管理员密钥" if role == "admin" else "普通用户")
        raw_key = f"sk-{secrets.token_urlsafe(24)}"
        item = {
            "id": uuid.uuid4().hex[:12],
            "name": normalized_name,
            "role": role,
            "key_hash": _hash_key(raw_key),
            "enabled": True,
            "created_at": _now_iso(),
            "last_used_at": None,
        }
        with self._lock:
            self._items.append(item)
            self._save()
            return self._public_item(item), raw_key

    def create_image_link(
        self,
        *,
        name: str = "",
        quota_limit: int,
        expires_at: str | None = None,
        created_by: str | None = None,
    ) -> tuple[dict[str, object], str]:
        normalized_quota = int(quota_limit)
        if normalized_quota < 1:
            raise ValueError("quota_limit must be greater than 0")
        normalized_name = self._clean(name) or "授权画图链接"
        raw_key = f"sk-img-{secrets.token_urlsafe(24)}"
        item = {
            "id": uuid.uuid4().hex[:12],
            "name": normalized_name,
            "role": "user",
            "scope": "image_link",
            "key_hash": _hash_key(raw_key),
            "key": raw_key,
            "enabled": True,
            "quota_limit": normalized_quota,
            "quota_used": 0,
            "expires_at": self._clean(expires_at) or None,
            "created_by": self._clean(created_by) or None,
            "created_at": _now_iso(),
            "last_used_at": None,
        }
        with self._lock:
            self._items.append(item)
            self._save()
            return self._public_item(item), raw_key

    def update_key(
        self,
        key_id: str,
        updates: dict[str, object],
        role: AuthRole | None = None,
        *,
        scope: str | None = None,
    ) -> dict[str, object] | None:
        normalized_id = self._clean(key_id)
        if not normalized_id:
            return None
        with self._lock:
            for index, item in enumerate(self._items):
                if item.get("id") != normalized_id:
                    continue
                if role is not None and item.get("role") != role:
                    return None
                if scope is not None and item.get("scope", "") != scope:
                    return None
                next_item = dict(item)
                if "name" in updates and updates.get("name") is not None:
                    next_item["name"] = self._clean(updates.get("name")) or next_item.get("name") or "普通用户"
                if "enabled" in updates and updates.get("enabled") is not None:
                    next_item["enabled"] = bool(updates.get("enabled"))
                if next_item.get("scope") == "image_link":
                    if "expires_at" in updates:
                        next_item["expires_at"] = self._clean(updates.get("expires_at")) or None
                    if "quota_limit" in updates and updates.get("quota_limit") is not None:
                        next_limit = self._safe_int(updates.get("quota_limit"))
                        if next_limit < 1:
                            raise ValueError("quota_limit must be greater than 0")
                        next_item["quota_limit"] = next_limit
                        next_item["quota_used"] = min(self._safe_int(next_item.get("quota_used")), next_limit)
                self._items[index] = next_item
                self._save()
                return self._public_item(next_item)
        return None

    def delete_key(self, key_id: str, *, role: AuthRole | None = None, scope: str | None = None) -> bool:
        normalized_id = self._clean(key_id)
        if not normalized_id:
            return False
        with self._lock:
            before = len(self._items)
            self._items = [
                item
                for item in self._items
                if not (
                    item.get("id") == normalized_id
                    and (role is None or item.get("role") == role)
                    and (scope is None or item.get("scope", "") == scope)
                )
            ]
            if len(self._items) == before:
                return False
            self._save()
            return True

    def authenticate(self, raw_key: str) -> dict[str, object] | None:
        candidate = self._clean(raw_key)
        if not candidate:
            return None
        candidate_hash = _hash_key(candidate)
        with self._lock:
            for index, item in enumerate(self._items):
                if not bool(item.get("enabled", True)):
                    continue
                stored_hash = self._clean(item.get("key_hash"))
                if not stored_hash or not hmac.compare_digest(stored_hash, candidate_hash):
                    continue
                if item.get("scope") == "image_link" and self._is_expired(item.get("expires_at")):
                    continue
                next_item = dict(item)
                now = datetime.now(timezone.utc)
                next_item["last_used_at"] = now.isoformat()
                self._items[index] = next_item
                item_id = self._clean(next_item.get("id"))
                last_flush_at = self._last_used_flush_at.get(item_id)
                if last_flush_at is None or (now - last_flush_at).total_seconds() >= 60:
                    try:
                        self._save()
                        self._last_used_flush_at[item_id] = now
                    except Exception:
                        pass
                return self._public_item(next_item)

    def ensure_image_link_quota(self, identity: dict[str, object], count: int) -> None:
        if identity.get("scope") != "image_link":
            return
        item_id = self._clean(identity.get("id"))
        requested_count = int(count)
        if requested_count < 1:
            raise ValueError("count must be greater than 0")
        with self._lock:
            for item in self._items:
                if item.get("id") != item_id or item.get("scope") != "image_link":
                    continue
                if not bool(item.get("enabled", True)) or self._is_expired(item.get("expires_at")):
                    raise PermissionError("image link is unavailable")
                quota_limit = self._safe_int(item.get("quota_limit"))
                quota_used = self._safe_int(item.get("quota_used"))
                if quota_used + requested_count > quota_limit:
                    raise RuntimeError("image link quota exceeded")
                return
        raise PermissionError("image link is unavailable")

    def consume_image_link_quota(self, identity: dict[str, object], count: int) -> dict[str, object] | None:
        if identity.get("scope") != "image_link":
            return None
        item_id = self._clean(identity.get("id"))
        requested_count = int(count)
        if requested_count < 1:
            raise ValueError("count must be greater than 0")
        with self._lock:
            for index, item in enumerate(self._items):
                if item.get("id") != item_id or item.get("scope") != "image_link":
                    continue
                quota_limit = self._safe_int(item.get("quota_limit"))
                quota_used = self._safe_int(item.get("quota_used"))
                next_item = dict(item)
                next_item["quota_used"] = min(quota_limit, quota_used + requested_count)
                self._items[index] = next_item
                self._save()
                return self._public_item(next_item)
        return None


auth_service = AuthService(config.get_storage_backend())
