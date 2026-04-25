from __future__ import annotations

import base64
import hashlib
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
import time
import uuid
from typing import Any, Literal

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

    @staticmethod
    def _public_item(item: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": item.get("id"),
            "prompt": item.get("prompt") or "",
            "revised_prompt": item.get("revised_prompt") or "",
            "image_url": item.get("image_url") or "",
            "width": int(item.get("width") or 0),
            "height": int(item.get("height") or 0),
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

    def list_public_works(self, limit: int = 60) -> list[dict[str, Any]]:
        items = self.storage.load_public_works()
        public_items = [self._public_item(item) for item in items if isinstance(item, dict) and _clean(item.get("image_url"))]
        public_items.sort(key=lambda item: str(item.get("created_at") or ""), reverse=True)
        return public_items[: max(1, min(int(limit), 200))]

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
            created_items.append(
                {
                    "id": uuid.uuid4().hex,
                    "prompt": prompt,
                    "revised_prompt": _clean(item.get("revised_prompt")),
                    "image_url": self._save_image(image_data, base_url),
                    "width": width,
                    "height": height,
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
