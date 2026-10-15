import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest

SCRIPT = Path(__file__).with_name("local-kokoro.py")


class RuntimeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location("local_kokoro", SCRIPT)
        cls.runtime = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.runtime)

    def test_model_missing_corrupt_and_verified(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d)
            self.assertEqual(self.runtime.assets_status(p), "missing_model")
            for name in self.runtime.ASSETS:
                (p / name).write_bytes(b"corrupt")
            self.assertEqual(self.runtime.assets_status(p), "corrupt_model")

    def test_verified_assets_and_atomic_install(self):
        import hashlib
        from unittest.mock import patch

        with tempfile.TemporaryDirectory() as d:
            path = Path(d)
            checksum = hashlib.sha256(b"verified").hexdigest()
            with patch.dict(self.runtime.ASSETS, {"fixture": checksum}, clear=True):
                self.runtime.install_asset(
                    path / "fixture", io.BytesIO(b"verified"), checksum
                )
                self.assertEqual(self.runtime.assets_status(path), "ready")

    def test_cli_missing_model_never_starts(self):
        import subprocess
        import sys

        with tempfile.TemporaryDirectory() as d:
            base = [sys.executable, str(SCRIPT), "--state-dir", d]
            result = subprocess.run(base + ["status"], capture_output=True, text=True)
            self.assertEqual(json.loads(result.stdout)["reason"], "missing_model")
            result = subprocess.run(base + ["start"], capture_output=True, text=True)
            self.assertEqual(result.returncode, 1)
            self.assertIn("setup explicitly", json.loads(result.stdout)["error"])
            self.assertFalse((Path(d) / "runtime.json").exists())

    def test_request_rejects_invalid_model_voice_format_and_size(self):
        valid = dict(
            model="kokoro",
            input="Hello world.",
            voice="af_heart",
            response_format="wav",
        )
        self.assertEqual(
            self.runtime.validate_request(valid, ["af_heart"]),
            ("Hello world.", "af_heart"),
        )
        for patch in (
            {"model": "cloud"},
            {"voice": "unknown"},
            {"response_format": "mp3"},
            {"input": ""},
            {"input": "a" * 12001},
        ):
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                self.runtime.validate_request(valid | patch, ["af_heart"])

    def test_failed_asset_install_preserves_existing(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "model"
            path.write_bytes(b"old")
            with self.assertRaises(ValueError):
                self.runtime.install_asset(path, io.BytesIO(b"wrong"), "a" * 64)
            self.assertEqual(path.read_bytes(), b"old")

    def test_wav_is_pcm_mono(self):
        import wave

        data = self.runtime.wav_bytes([0.0, 0.5, -0.5], 24000)
        with wave.open(io.BytesIO(data)) as wav:
            self.assertEqual(
                (
                    wav.getnchannels(),
                    wav.getsampwidth(),
                    wav.getframerate(),
                    wav.getnframes(),
                ),
                (1, 2, 24000, 3),
            )


class CancellationTests(unittest.IsolatedAsyncioTestCase):
    async def test_disconnect_stops_future_batches(self):
        import asyncio
        import socket
        import importlib.util

        spec = importlib.util.spec_from_file_location("k", SCRIPT)
        runtime = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(runtime)

        class Engine:
            calls = 0

            def create(self, *args, **kwargs):
                self.calls += 1
                return [0.1] * 240, 24000

        engine = Engine()
        a, b = socket.socketpair()
        b.close()
        try:
            with self.assertRaises(ConnectionError):
                await runtime.synthesize(engine, "A sentence. " * 100, "af_heart", a)
            self.assertEqual(engine.calls, 0)
        finally:
            a.close()

    async def test_disconnect_during_batch_skips_remaining_text(self):
        import asyncio
        import socket
        import time

        spec = importlib.util.spec_from_file_location("k", SCRIPT)
        runtime = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(runtime)
        a, b = socket.socketpair()

        class Engine:
            calls = 0

            def create(self, *args, **kwargs):
                self.calls += 1
                b.close()
                time.sleep(0.02)
                return [0.1] * 240, 24000

        engine = Engine()
        try:
            with self.assertRaises(ConnectionError):
                await runtime.synthesize(engine, "A sentence. " * 100, "af_heart", a)
            self.assertEqual(engine.calls, 1)
        finally:
            a.close()


class LifecycleTests(unittest.TestCase):
    def test_owned_server_http_contract_and_stop(self):
        import multiprocessing
        import socket
        import sys
        import time
        import types
        import urllib.request
        import urllib.error

        spec = importlib.util.spec_from_file_location("k", SCRIPT)
        runtime = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(runtime)

        class Engine:
            @classmethod
            def from_session(cls, *args):
                return cls()

            def get_voices(self):
                return ["af_heart", "jf_alpha"]

            def create(self, *args, **kwargs):
                return [0.1] * 240, 24000

        class Options:
            pass

        def run(state, port):
            sys.modules["kokoro_onnx"] = types.SimpleNamespace(Kokoro=Engine)
            sys.modules["onnxruntime"] = types.SimpleNamespace(
                SessionOptions=Options, InferenceSession=lambda *a, **k: None
            )
            runtime.serve(state, port, "test-token")

        with tempfile.TemporaryDirectory() as d:
            state = Path(d)
            with socket.socket() as probe:
                probe.bind(("127.0.0.1", 0))
                port = probe.getsockname()[1]
            child = multiprocessing.get_context("fork").Process(
                target=run, args=(state, port)
            )
            child.start()
            try:
                deadline = time.monotonic() + 5
                while (
                    not (state / "runtime.json").exists()
                    and time.monotonic() < deadline
                ):
                    time.sleep(0.02)
                record = runtime.lifecycle.read_json(state / "runtime.json")
                self.assertTrue(runtime.lifecycle.control(record, "status")["ready"])
                self.assertIsNone(
                    runtime.lifecycle.control(dict(record, token="unowned"), "stop")
                )
                url = f"http://127.0.0.1:{port}"
                self.assertEqual(
                    runtime.lifecycle.request_local(url + "/v1/audio/voices")["voices"],
                    ["af_heart"],
                )
                req = urllib.request.Request(
                    url + "/v1/audio/speech",
                    data=json.dumps(
                        dict(model="kokoro", input="Test.", voice="af_heart")
                    ).encode(),
                    headers={"Content-Type": "application/json"},
                )
                with urllib.request.urlopen(req) as response:
                    self.assertEqual(response.headers["Content-Type"], "audio/wav")
                    self.assertTrue(response.read().startswith(b"RIFF"))
                req = urllib.request.Request(
                    url + "/health", headers={"Origin": "https://evil.test"}
                )
                with self.assertRaises(urllib.error.HTTPError) as error:
                    urllib.request.urlopen(req)
                self.assertEqual(error.exception.code, 403)
                error.exception.close()
                runtime.lifecycle.control(record, "stop")
                child.join(5)
                self.assertFalse(child.is_alive())
                self.assertFalse((state / "runtime.json").exists())
            finally:
                if child.is_alive():
                    child.terminate()
                    child.join()


if __name__ == "__main__":
    unittest.main()
