from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path

os.environ.setdefault("CHATGPT2API_AUTH_KEY", "test-auth")

from services.public_work_service import DEFAULT_PUBLIC_WORK_TITLE, PublicWorkService
from services.storage.json_storage import JSONStorageBackend

PNG_BASE64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+lmFkAAAAASUVORK5CYII="
)


class PublicWorkServiceTests(unittest.TestCase):
    def test_delete_public_work_removes_record_and_image_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            base_dir = Path(tmp_dir)
            image_file = base_dir / "images" / "2026" / "04" / "27" / "sample.png"
            image_file.parent.mkdir(parents=True, exist_ok=True)
            image_file.write_bytes(b"png-data")

            storage = JSONStorageBackend(base_dir / "accounts.json", public_works_path=base_dir / "public_works.json")
            storage.save_public_works(
                [
                    {
                        "id": "work-1",
                        "title": "test",
                        "prompt": "prompt",
                        "revised_prompt": "",
                        "image_url": "/images/2026/04/27/sample.png",
                        "created_at": "2026-04-27T00:00:00+00:00",
                    }
                ]
            )
            service = PublicWorkService(storage)

            deleted = service.delete_public_work("work-1")

            self.assertTrue(deleted)
            self.assertEqual(storage.load_public_works(), [])
            self.assertFalse(image_file.exists())

    def test_delete_public_work_succeeds_when_image_file_missing(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            base_dir = Path(tmp_dir)
            storage = JSONStorageBackend(base_dir / "accounts.json", public_works_path=base_dir / "public_works.json")
            storage.save_public_works(
                [
                    {
                        "id": "work-1",
                        "title": "test",
                        "prompt": "prompt",
                        "revised_prompt": "",
                        "image_url": "/images/2026/04/27/missing.png",
                        "created_at": "2026-04-27T00:00:00+00:00",
                    }
                ]
            )
            service = PublicWorkService(storage)

            deleted = service.delete_public_work("work-1")

            self.assertTrue(deleted)
            self.assertEqual(storage.load_public_works(), [])

    def test_delete_public_work_rejects_path_escape(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            base_dir = Path(tmp_dir)
            outside_file = base_dir / "outside.png"
            outside_file.write_bytes(b"png-data")
            storage = JSONStorageBackend(base_dir / "accounts.json", public_works_path=base_dir / "public_works.json")
            storage.save_public_works(
                [
                    {
                        "id": "work-1",
                        "title": "test",
                        "prompt": "prompt",
                        "revised_prompt": "",
                        "image_url": "/images/../outside.png",
                        "created_at": "2026-04-27T00:00:00+00:00",
                    }
                ]
            )
            service = PublicWorkService(storage)

            deleted = service.delete_public_work("work-1")

            self.assertTrue(deleted)
            self.assertEqual(storage.load_public_works(), [])
            self.assertTrue(outside_file.exists())

    def test_publish_uses_placeholder_title_before_async_backfill(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            base_dir = Path(tmp_dir)
            storage = JSONStorageBackend(base_dir / "accounts.json", public_works_path=base_dir / "public_works.json")
            service = PublicWorkService(storage)
            service.set_title_generator(lambda prompt, revised_prompt: "异步标题")
            service._start_title_backfill = lambda items, prompt, revised_prompts: None

            created = service.publish(
                result={"data": [{"b64_json": PNG_BASE64, "revised_prompt": "优化后提示词"}]},
                prompt="原始提示词",
                source="generation",
                identity={"id": "user-1", "name": "tester"},
                is_prompt_public=True,
                base_url="",
            )

            self.assertEqual(len(created), 1)
            self.assertEqual(created[0]["title"], DEFAULT_PUBLIC_WORK_TITLE)
            stored = storage.load_public_works()
            self.assertEqual(len(stored), 1)
            self.assertEqual(stored[0]["title"], DEFAULT_PUBLIC_WORK_TITLE)
            self.assertEqual(stored[0]["revised_prompt"], "优化后提示词")

    def test_update_public_work_title_skips_non_placeholder_title(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            base_dir = Path(tmp_dir)
            storage = JSONStorageBackend(base_dir / "accounts.json", public_works_path=base_dir / "public_works.json")
            storage.save_public_works(
                [
                    {
                        "id": "work-1",
                        "title": "已有标题",
                        "prompt": "prompt",
                        "revised_prompt": "",
                        "image_url": "/images/2026/04/27/sample.png",
                        "created_at": "2026-04-27T00:00:00+00:00",
                    }
                ]
            )
            service = PublicWorkService(storage)

            updated = service._update_public_work_title("work-1", "新标题")

            self.assertFalse(updated)
            self.assertEqual(storage.load_public_works()[0]["title"], "已有标题")

    def test_backfill_title_uses_private_revised_prompt_for_generation_only(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            base_dir = Path(tmp_dir)
            storage = JSONStorageBackend(base_dir / "accounts.json", public_works_path=base_dir / "public_works.json")
            service = PublicWorkService(storage)
            captured: list[tuple[str, str]] = []
            service.set_title_generator(lambda prompt, revised_prompt: captured.append((prompt, revised_prompt)) or "补标题")
            service._start_title_backfill = lambda items, prompt, revised_prompts: service._backfill_public_work_titles(items, prompt, revised_prompts)

            created = service.publish(
                result={"data": [{"b64_json": PNG_BASE64, "revised_prompt": "私有优化词"}]},
                prompt="原始提示词",
                source="generation",
                identity={"id": "user-1", "name": "tester"},
                is_prompt_public=False,
                base_url="",
            )

            self.assertEqual(captured, [("原始提示词", "私有优化词")])
            stored = storage.load_public_works()[0]
            self.assertEqual(created[0]["title"], DEFAULT_PUBLIC_WORK_TITLE)
            self.assertEqual(stored["title"], "补标题")
            self.assertEqual(stored["revised_prompt"], "")


if __name__ == "__main__":
    unittest.main()
