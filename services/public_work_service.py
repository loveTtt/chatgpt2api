from __future__ import annotations

import base64
import hashlib
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
import time
from urllib.parse import urlparse, unquote
import uuid
from typing import Any, Literal, Callable

from PIL import Image

from services.config import config
from services.storage.base import StorageBackend

PublicWorkSource = Literal["generation", "edit"]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _clean(value: object) -> str:
    return str(value or "").strip()


class PublicWorkService:
    def __init__(self, storage: StorageBackend):
        self.storage = storage
        self._title_generator: Callable[[str, str], str] | None = None

    def set_title_generator(self, generator: Callable[[str, str], str]) -> None:
        self._title_generator = generator

    def _generate_title(self, prompt: str, revised_prompt: str) -> str:
        if not self._title_generator:
            return "未命名作品"
        try:
            title = _clean(self._title_generator(prompt, revised_prompt))
        except Exception:
            return "未命名作品"
        return title or "未命名作品"

    @staticmethod
    def _public_item(item: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": item.get("id"),
            "title": item.get("title") or "",
            "prompt": item.get("prompt") or "",
            "revised_prompt": item.get("revised_prompt") or "",
            "image_url": item.get("image_url") or "",
            "width": int(item.get("width") or 0),
            "height": int(item.get("height") or 0),
            "file_size_bytes": int(item.get("file_size_bytes") or 0),
            "created_at": item.get("created_at") or "",
        }

    @staticmethod
    def _decode_b64_image(value: object) -> bytes | None:
        b64_json = _clean(value)
        if not b64_json:
            return None
        if "," in b64_json and b64_json.startswith("data:"):
            b64_json = b64_json.split(",", 1)[1]
        try:
            return base64.b64decode(b64_json)
        except Exception:
            return None

    @staticmethod
    def _image_size(image_data: bytes) -> tuple[int, int]:
        with Image.open(BytesIO(image_data)) as image:
            return image.size

    @staticmethod
    def _save_image(image_data: bytes, base_url: str | None = None) -> str:
        file_hash = hashlib.md5(image_data).hexdigest()
        filename = f"{int(time.time())}_{file_hash}_{uuid.uuid4().hex[:8]}.png"
        relative_dir = Path(time.strftime("%Y"), time.strftime("%m"), time.strftime("%d"))
        file_path = config.images_dir / relative_dir / filename
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_bytes(image_data)
        image_path = f"/images/{relative_dir.as_posix()}/{filename}"
        normalized_base_url = _clean(base_url or config.base_url).rstrip("/")
        return f"{normalized_base_url}{image_path}" if normalized_base_url else image_path

    @staticmethod
    def _resolve_image_file_path(image_url: object) -> Path | None:
        raw_value = _clean(image_url)
        if not raw_value:
            return None
        parsed = urlparse(raw_value)
        image_path = unquote(parsed.path or raw_value)
        if not image_path.startswith("/images/"):
            return None
        relative_path = Path(image_path.removeprefix("/images/"))
        candidate = (config.images_dir / relative_path).resolve()
        base_dir = config.images_dir.resolve()
        try:
            candidate.relative_to(base_dir)
        except ValueError:
            return None
        return candidate

    def list_public_works(self, limit: int = 60) -> list[dict[str, Any]]:
        items = self.storage.load_public_works()
        public_items = [self._public_item(item) for item in items if isinstance(item, dict) and _clean(item.get("image_url"))]
        public_items.sort(key=lambda item: str(item.get("created_at") or ""), reverse=True)
        return public_items[: max(1, min(int(limit), 200))]

    def get_public_work(self, work_id: str) -> dict[str, Any] | None:
        normalized_work_id = _clean(work_id)
        if not normalized_work_id:
            return None
        items = self.storage.load_public_works()
        for item in items:
            if not isinstance(item, dict):
                continue
            if _clean(item.get("id")) != normalized_work_id or not _clean(item.get("image_url")):
                continue
            return self._public_item(item)
        return None

    def delete_public_work(self, work_id: str) -> bool:
        normalized_work_id = _clean(work_id)
        if not normalized_work_id:
            return False
        items = self.storage.load_public_works()
        removed_item: dict[str, Any] | None = None
        next_items: list[dict[str, Any]] = []
        for item in items:
            if not isinstance(item, dict):
                next_items.append(item)
                continue
            if removed_item is None and _clean(item.get("id")) == normalized_work_id:
                removed_item = item
                continue
            next_items.append(item)
        if removed_item is None:
            return False
        self.storage.save_public_works(next_items)
        image_file_path = self._resolve_image_file_path(removed_item.get("image_url"))
        if image_file_path and image_file_path.exists():
            image_file_path.unlink()
        return True

    def publish(
        self,
        *,
        result: object,
        prompt: str,
        source: PublicWorkSource,
        identity: dict[str, object],
        base_url: str | None = None,
    ) -> list[dict[str, Any]]:
        if not isinstance(result, dict):
            return []
        data = result.get("data")
        if not isinstance(data, list):
            return []

        created_items: list[dict[str, Any]] = []
        created_at = _now_iso()
        for item in data:
            if not isinstance(item, dict):
                continue
            image_data = self._decode_b64_image(item.get("b64_json"))
            if not image_data:
                continue
            width, height = self._image_size(image_data)
            revised_prompt = _clean(item.get("revised_prompt"))
            created_items.append(
                {
                    "id": uuid.uuid4().hex,
                    "title": self._generate_title(prompt, revised_prompt),
                    "prompt": prompt,
                    "revised_prompt": revised_prompt,
                    "image_url": self._save_image(image_data, base_url),
                    "width": width,
                    "height": height,
                    "file_size_bytes": len(image_data),
                    "created_at": created_at,
                    "source": source,
                    "identity_id": _clean(identity.get("id")) or None,
                    "identity_name": _clean(identity.get("name")) or None,
                }
            )

        if created_items:
            existing_items = self.storage.load_public_works()
            self.storage.save_public_works([*created_items, *existing_items])
        return [self._public_item(item) for item in created_items]


public_work_service = PublicWorkService(config.get_storage_backend())
