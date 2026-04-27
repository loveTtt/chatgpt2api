import unittest
from types import MethodType

from services.openai_backend_api import OpenAIBackendAPI


class OpenAIBackendAPITest(unittest.TestCase):
    def test_run_image_task_filters_uploaded_reference_file_ids(self) -> None:
        backend = OpenAIBackendAPI(access_token="token")

        backend._upload_image = MethodType(
            lambda self, image, file_name="image.png": {
                "file_id": "file-input-1",
                "file_name": file_name,
                "file_size": 12,
                "mime_type": "image/png",
                "width": 1,
                "height": 1,
            },
            backend,
        )
        backend._bootstrap = MethodType(lambda self: None, backend)
        backend._get_auth_chat_requirements = MethodType(
            lambda self: type("Requirements", (), {"token": "x", "proof_token": "", "turnstile_token": "", "so_token": "", "raw_finalize": None})(),
            backend,
        )
        backend._build_image_prompt = MethodType(lambda self, prompt, size: prompt, backend)
        backend._prepare_image_conversation = MethodType(lambda self, prompt, requirements, model: "conduit", backend)
        backend._start_image_generation = MethodType(lambda self, prompt, requirements, conduit_token, model, references=None: object(), backend)
        backend._parse_image_sse = MethodType(
            lambda self, response: {
                "conversation_id": "conv-1",
                "file_ids": ["file-input-1", "file-output-1"],
                "sediment_ids": [],
            },
            backend,
        )

        captured: dict[str, object] = {}

        def resolve_urls(self, conversation_id, file_ids, sediment_ids):
            captured["conversation_id"] = conversation_id
            captured["file_ids"] = list(file_ids)
            captured["sediment_ids"] = list(sediment_ids)
            return ["https://example.com/output.png"]

        backend._resolve_image_urls = MethodType(resolve_urls, backend)
        backend._image_response = MethodType(
            lambda self, urls, response_format: {"created": 1, "data": [{"url": urls[0]}]},
            backend,
        )

        result = backend._run_image_task(
            prompt="把英文改成中文",
            model="gpt-image-2",
            size=None,
            images=["ZmFrZQ=="],
            response_format="url",
        )

        self.assertEqual(captured["conversation_id"], "conv-1")
        self.assertEqual(captured["file_ids"], ["file-output-1"])
        self.assertEqual(captured["sediment_ids"], [])
        self.assertEqual(result, {"created": 1, "data": [{"url": "https://example.com/output.png"}]})


if __name__ == "__main__":
    unittest.main()
