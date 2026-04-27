from __future__ import annotations

import unittest

from fastapi import HTTPException

from api.support import raise_image_quota_error


class ImageErrorMappingTests(unittest.TestCase):
    def test_upstream_429_maps_to_retry_later_message(self) -> None:
        cases = [
            "/backend-api/conversation/abc failed: status=429, body={'detail': 'Too many requests'}",
            "/backend-api/conversation/init failed: HTTP 429",
            "Too many requests",
        ]

        for message in cases:
            with self.subTest(message=message):
                with self.assertRaises(HTTPException) as context:
                    raise_image_quota_error(RuntimeError(message))

                self.assertEqual(context.exception.status_code, 429)
                self.assertEqual(context.exception.detail, {"error": "当前请求量过高，请稍后再试"})


if __name__ == "__main__":
    unittest.main()
