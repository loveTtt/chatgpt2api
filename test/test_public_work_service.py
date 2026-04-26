from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path

os.environ.setdefault("CHATGPT2API_AUTH_KEY", "test-auth")

from services.public_work_service import PublicWorkService
from services.storage.json_storage import JSONStorageBackend


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


if __name__ == "__main__":
    unittest.main()
