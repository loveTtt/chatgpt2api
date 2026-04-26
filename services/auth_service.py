from __future__ import annotations

import hashlib
import hmac
import secrets
import uuid
from datetime import UTC, datetime
from threading import Lock
from typing import Literal

from services.config import config
from services.storage.base import StorageBackend

AuthRole = Literal["admin", "user"]
ImageLinkQuotaMode = Literal["one_time", "daily"]
DEFAULT_PUBLIC_FREE_LIMIT = 20


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _current_reset_date() -> str:
    return datetime.now(UTC).date().isoformat()


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
    def _normalize_quota_mode(value: object) -> ImageLinkQuotaMode:
        return "daily" if str(value or "").strip().lower() == "daily" else "one_time"

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
            expires = expires.replace(tzinfo=UTC)
        return expires <= datetime.now(UTC)

    def _normalize_image_link_item(self, item: dict[str, object]) -> tuple[dict[str, object], bool]:
        changed = False
        quota_limit = max(0, self._safe_int(item.get("quota_limit")))
        quota_used = min(quota_limit, max(0, self._safe_int(item.get("quota_used"))))
        quota_mode = self._normalize_quota_mode(item.get("quota_mode"))
        public_free_limit = max(0, self._safe_int(item.get("public_free_limit"), DEFAULT_PUBLIC_FREE_LIMIT))
        public_free_used = min(public_free_limit, max(0, self._safe_int(item.get("public_free_used"))))
        quota_reset_date = self._clean(item.get("quota_reset_date")) or _current_reset_date()
        if quota_mode == "daily" and quota_reset_date != _current_reset_date():
            quota_used = 0
            public_free_used = 0
            quota_reset_date = _current_reset_date()
            changed = True
        normalized = dict(item)
        normalized.update(
            {
                "quota_limit": quota_limit,
                "quota_used": quota_used,
                "quota_mode": quota_mode,
                "public_free_limit": public_free_limit,
                "public_free_used": public_free_used,
                "quota_reset_date": quota_reset_date,
            }
        )
        if any(
            item.get(key) != normalized.get(key)
            for key in ("quota_limit", "quota_used", "quota_mode", "public_free_limit", "public_free_used", "quota_reset_date")
        ):
            changed = True
        return normalized, changed

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
            item.update(
                {
                    "scope": scope,
                    "expires_at": self._clean(raw.get("expires_at")) or None,
                    "created_by": self._clean(raw.get("created_by")) or None,
                }
            )
            item, _ = self._normalize_image_link_item(item | raw)
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
        normalized_items = [normalized for item in items if (normalized := self._normalize_item(item)) is not None]
        return normalized_items

    def _save(self) -> None:
        self.storage.save_auth_keys(self._items)

    def _ensure_daily_reset(self, item: dict[str, object]) -> tuple[dict[str, object], bool]:
        if item.get("scope") != "image_link":
            return item, False
        normalized_item, changed = self._normalize_image_link_item(item)
        return normalized_item, changed

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
            public_free_limit = AuthService._safe_int(item.get("public_free_limit"), DEFAULT_PUBLIC_FREE_LIMIT)
            public_free_used = AuthService._safe_int(item.get("public_free_used"))
            result.update(
                {
                    "scope": "image_link",
                    "quota_limit": quota_limit,
                    "quota_used": quota_used,
                    "quota_remaining": max(0, quota_limit - quota_used),
                    "quota_mode": AuthService._normalize_quota_mode(item.get("quota_mode")),
                    "public_free_limit": public_free_limit,
                    "public_free_used": public_free_used,
                    "public_free_remaining": max(0, public_free_limit - public_free_used),
                    "quota_reset_date": item.get("quota_reset_date"),
                    "expires_at": item.get("expires_at"),
                    "created_by": item.get("created_by"),
                    "key": item.get("key"),
                }
            )
        return result

    def list_keys(self, role: AuthRole | None = None, *, scope: str | None = None) -> list[dict[str, object]]:
        with self._lock:
            changed = False
            next_items: list[dict[str, object]] = []
            for item in self._items:
                normalized_item, item_changed = self._ensure_daily_reset(item)
                next_items.append(normalized_item)
                changed = changed or item_changed
            if changed:
                self._items = next_items
                self._save()
            items = [
                item
                for item in next_items
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
        quota_mode: ImageLinkQuotaMode = "one_time",
        public_free_limit: int = DEFAULT_PUBLIC_FREE_LIMIT,
    ) -> tuple[dict[str, object], str]:
        normalized_quota = int(quota_limit)
        if normalized_quota < 1:
            raise ValueError("quota_limit must be greater than 0")
        normalized_public_free_limit = int(public_free_limit)
        if normalized_public_free_limit < 0:
            raise ValueError("public_free_limit must be greater than or equal to 0")
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
            "quota_mode": self._normalize_quota_mode(quota_mode),
            "public_free_limit": normalized_public_free_limit,
            "public_free_used": 0,
            "quota_reset_date": _current_reset_date(),
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
                next_item, changed = self._ensure_daily_reset(item)
                if "name" in updates and updates.get("name") is not None:
                    next_item["name"] = self._clean(updates.get("name")) or next_item.get("name") or "普通用户"
                    changed = True
                if "enabled" in updates and updates.get("enabled") is not None:
                    next_item["enabled"] = bool(updates.get("enabled"))
                    changed = True
                if next_item.get("scope") == "image_link":
                    if "expires_at" in updates:
                        next_item["expires_at"] = self._clean(updates.get("expires_at")) or None
                        changed = True
                    if "quota_limit" in updates and updates.get("quota_limit") is not None:
                        next_limit = self._safe_int(updates.get("quota_limit"))
                        if next_limit < 1:
                            raise ValueError("quota_limit must be greater than 0")
                        next_item["quota_limit"] = next_limit
                        next_item["quota_used"] = min(self._safe_int(next_item.get("quota_used")), next_limit)
                        changed = True
                    if "quota_used" in updates and updates.get("quota_used") is not None:
                        next_used = self._safe_int(updates.get("quota_used"))
                        if next_used < 0:
                            raise ValueError("quota_used must be greater than or equal to 0")
                        next_item["quota_used"] = min(self._safe_int(next_item.get("quota_limit")), next_used)
                        changed = True
                    if "quota_mode" in updates and updates.get("quota_mode") is not None:
                        next_item["quota_mode"] = self._normalize_quota_mode(updates.get("quota_mode"))
                        next_item["quota_reset_date"] = _current_reset_date()
                        if next_item["quota_mode"] == "daily":
                            next_item["quota_used"] = 0
                            next_item["public_free_used"] = 0
                        changed = True
                    if "public_free_limit" in updates and updates.get("public_free_limit") is not None:
                        next_public_free_limit = self._safe_int(updates.get("public_free_limit"))
                        if next_public_free_limit < 0:
                            raise ValueError("public_free_limit must be greater than or equal to 0")
                        next_item["public_free_limit"] = next_public_free_limit
                        next_item["public_free_used"] = min(
                            self._safe_int(next_item.get("public_free_used")),
                            next_public_free_limit,
                        )
                        changed = True
                    if "public_free_used" in updates and updates.get("public_free_used") is not None:
                        next_public_free_used = self._safe_int(updates.get("public_free_used"))
                        if next_public_free_used < 0:
                            raise ValueError("public_free_used must be greater than or equal to 0")
                        next_item["public_free_used"] = min(
                            self._safe_int(next_item.get("public_free_limit")),
                            next_public_free_used,
                        )
                        changed = True
                    if "quota_reset_date" in updates and updates.get("quota_reset_date") is not None:
                        next_item["quota_reset_date"] = self._clean(updates.get("quota_reset_date")) or _current_reset_date()
                        changed = True
                self._items[index] = next_item
                if changed:
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
                next_item, _ = self._ensure_daily_reset(item)
                now = datetime.now(UTC)
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
            for index, item in enumerate(self._items):
                if item.get("id") != item_id or item.get("scope") != "image_link":
                    continue
                next_item, changed = self._ensure_daily_reset(item)
                self._items[index] = next_item
                if changed:
                    self._save()
                if not bool(next_item.get("enabled", True)) or self._is_expired(next_item.get("expires_at")):
                    raise PermissionError("image link is unavailable")
                quota_limit = self._safe_int(next_item.get("quota_limit"))
                quota_used = self._safe_int(next_item.get("quota_used"))
                if quota_used + requested_count > quota_limit:
                    raise RuntimeError("image link quota exceeded")
                return
        raise PermissionError("image link is unavailable")

    def allocate_image_link_usage(self, identity: dict[str, object], count: int, *, use_public_free: bool) -> dict[str, object]:
        if identity.get("scope") != "image_link":
            return {"public_free_count": 0, "quota_count": 0}
        item_id = self._clean(identity.get("id"))
        requested_count = int(count)
        if requested_count < 1:
            raise ValueError("count must be greater than 0")
        with self._lock:
            for index, item in enumerate(self._items):
                if item.get("id") != item_id or item.get("scope") != "image_link":
                    continue
                next_item, changed = self._ensure_daily_reset(item)
                if not bool(next_item.get("enabled", True)) or self._is_expired(next_item.get("expires_at")):
                    raise PermissionError("image link is unavailable")
                public_free_count = 0
                quota_count = requested_count
                if use_public_free:
                    public_free_limit = self._safe_int(next_item.get("public_free_limit"), DEFAULT_PUBLIC_FREE_LIMIT)
                    public_free_used = self._safe_int(next_item.get("public_free_used"))
                    public_free_remaining = max(0, public_free_limit - public_free_used)
                    public_free_count = min(requested_count, public_free_remaining)
                    quota_count = requested_count - public_free_count
                quota_limit = self._safe_int(next_item.get("quota_limit"))
                quota_used = self._safe_int(next_item.get("quota_used"))
                if quota_used + quota_count > quota_limit:
                    raise RuntimeError("image link quota exceeded")
                self._items[index] = next_item
                if changed:
                    self._save()
                return {"public_free_count": public_free_count, "quota_count": quota_count}
        raise PermissionError("image link is unavailable")

    def consume_image_link_usage(
        self,
        identity: dict[str, object],
        *,
        public_free_count: int = 0,
        quota_count: int = 0,
    ) -> dict[str, object] | None:
        if identity.get("scope") != "image_link":
            return None
        item_id = self._clean(identity.get("id"))
        normalized_public_free_count = max(0, int(public_free_count))
        normalized_quota_count = max(0, int(quota_count))
        with self._lock:
            for index, item in enumerate(self._items):
                if item.get("id") != item_id or item.get("scope") != "image_link":
                    continue
                next_item, _ = self._ensure_daily_reset(item)
                quota_limit = self._safe_int(next_item.get("quota_limit"))
                quota_used = self._safe_int(next_item.get("quota_used"))
                public_free_limit = self._safe_int(next_item.get("public_free_limit"), DEFAULT_PUBLIC_FREE_LIMIT)
                public_free_used = self._safe_int(next_item.get("public_free_used"))
                next_item["quota_used"] = min(quota_limit, quota_used + normalized_quota_count)
                next_item["public_free_used"] = min(public_free_limit, public_free_used + normalized_public_free_count)
                self._items[index] = next_item
                self._save()
                return self._public_item(next_item)
        return None

    def consume_image_link_quota(self, identity: dict[str, object], count: int) -> dict[str, object] | None:
        normalized_count = int(count)
        if normalized_count < 1:
            raise ValueError("count must be greater than 0")
        return self.consume_image_link_usage(identity, quota_count=normalized_count)


auth_service = AuthService(config.get_storage_backend())
