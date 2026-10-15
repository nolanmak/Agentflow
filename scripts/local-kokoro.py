#!/usr/bin/env python3
"""Explicit managed CPU Kokoro runtime. Setup needs Python 3.12–3.13; inference is offline."""

import argparse
import asyncio
import itertools
import select
import array
import contextlib
import fcntl
import http.server
import importlib.util
import io
import json
import os
from pathlib import Path
import secrets
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
import wave

ASSETS = {
    "kokoro-v1.0.onnx": "beb0d1848dee9a49da392cc3df26958d46cfa35d321edf434f52949153f0df3a",
    "voices-v1.0.bin": "bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d",
}
RELEASE = (
    "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/"
)
# Share audited private-pipe/loopback ownership helpers, without starting Whisper.
spec = importlib.util.spec_from_file_location(
    "whisper_lifecycle", Path(__file__).with_name("local-whisper.py")
)
lifecycle = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lifecycle)


def assets_status(state):
    if any(not (state / name).is_file() for name in ASSETS):
        return "missing_model"
    if any(lifecycle.digest(state / name) != sha for name, sha in ASSETS.items()):
        return "corrupt_model"
    return "ready"


def install_asset(path, source, sha):
    fd, name = tempfile.mkstemp(dir=path.parent, suffix=".partial")
    try:
        with os.fdopen(fd, "wb") as target:
            shutil.copyfileobj(source, target)
        if lifecycle.digest(Path(name)) != sha:
            raise ValueError("model checksum mismatch; existing model preserved")
        os.replace(name, path)
    finally:
        Path(name).unlink(missing_ok=True)


def validate_request(body, voices):
    if (
        not isinstance(body, dict)
        or body.get("model") != "kokoro"
        or body.get("response_format", "wav") != "wav"
    ):
        raise ValueError("expected kokoro model and wav format")
    text, voice = body.get("input"), body.get("voice")
    if not isinstance(text, str) or not text.strip() or len(text) > 12000:
        raise ValueError("input must contain 1–12000 characters")
    if voice not in voices:
        raise ValueError("unknown English voice")
    return text.strip(), voice


def wav_bytes(samples, rate):
    pcm = array.array(
        "h", (max(-32768, min(32767, round(float(x) * 32767))) for x in samples)
    )
    if sys.byteorder != "little":
        pcm.byteswap()
    out = io.BytesIO()
    with wave.open(out, "wb") as target:
        target.setnchannels(1)
        target.setsampwidth(2)
        target.setframerate(rate)
        target.writeframes(pcm.tobytes())
    return out.getvalue()


def disconnected(connection):
    return (
        bool(select.select([connection], [], [], 0)[0])
        and connection.recv(1, socket.MSG_PEEK) == b""
    )


def text_chunks(text):
    # Bound each inference even for punctuation-free text and very long words.
    while text:
        if len(text) <= 300:
            yield text
            return
        cut = max(text.rfind(mark, 0, 300) + 1 for mark in ".!?\n")
        if cut < 80:
            cut = text.rfind(" ", 0, 300)
        if cut <= 0:
            cut = 300
        yield text[:cut]
        text = text[cut:].lstrip()


async def synthesize(engine, text, voice, connection):
    chunks = []
    size = 44
    deadline = time.monotonic() + 55
    for part in text_chunks(text):
        if disconnected(connection):
            raise ConnectionError("client disconnected")
        if time.monotonic() >= deadline:
            raise TimeoutError("synthesis deadline exceeded")
        samples, rate = await asyncio.to_thread(
            engine.create,
            part,
            voice=voice,
            speed=1.0,
            lang="en-gb" if voice.startswith("b") else "en-us",
        )
        size += len(samples) * 2
        if size > 24 * 1024 * 1024 or rate != 24000:
            raise ValueError("synthesis output limit or sample rate invalid")
        chunks.append(samples)
    if disconnected(connection):
        raise ConnectionError("client disconnected")
    if time.monotonic() >= deadline:
        raise TimeoutError("synthesis deadline exceeded")
    return wav_bytes(itertools.chain.from_iterable(chunks), 24000)


def serve(state, port, token):
    from kokoro_onnx import Kokoro
    import onnxruntime as ort

    # Explicit CPU provider avoids device/network auto-discovery. Bound thread use.
    options = ort.SessionOptions()
    options.intra_op_num_threads = min(4, os.cpu_count() or 1)
    session = ort.InferenceSession(
        str(state / "kokoro-v1.0.onnx"),
        sess_options=options,
        providers=["CPUExecutionProvider"],
    )
    engine = Kokoro.from_session(session, str(state / "voices-v1.0.bin"))
    voices = sorted(
        v for v in engine.get_voices() if v.startswith(("af_", "am_", "bf_", "bm_"))
    )
    busy = threading.Lock()
    stopped = threading.Event()

    class Handler(http.server.BaseHTTPRequestHandler):
        def allowed(self):
            if self.headers.get("Origin") or self.headers.get("Host") not in (
                f"127.0.0.1:{port}",
                f"localhost:{port}",
            ):
                self.send_error(403)
                return False
            return True

        def reply(self, code, body, mime="application/json"):
            data = body if isinstance(body, bytes) else json.dumps(body).encode()
            self.send_response(code)
            self.send_header("Content-Type", mime)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            with contextlib.suppress(BrokenPipeError, ConnectionResetError):
                self.wfile.write(data)

        def do_GET(self):
            if not self.allowed():
                return
            if self.path in ("/status", "/stop"):
                if self.headers.get("Authorization") != "Bearer " + token:
                    self.send_error(403)
                    return
                self.reply(
                    200,
                    {"token": token, "ready": True, "url": f"http://127.0.0.1:{port}"},
                )
                if self.path == "/stop":
                    stopped.set()
            elif self.path == "/health":
                self.reply(
                    200, {"status": "ok", "model": "kokoro", "busy": busy.locked()}
                )
            elif self.path == "/v1/audio/voices":
                self.reply(200, {"voices": voices})
            else:
                self.send_error(404)

        def do_POST(self):
            if not self.allowed():
                return
            if self.path != "/v1/audio/speech":
                self.send_error(404)
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if not 0 < length <= 192 * 1024:
                    self.send_error(413)
                    return
                self.connection.settimeout(5)
                text, voice = validate_request(
                    json.loads(self.rfile.read(length)), voices
                )
            except (ValueError, OSError):
                self.reply(400, {"error": "invalid bounded Kokoro request"})
                return
            if not busy.acquire(blocking=False):
                self.reply(429, {"error": "local voice is busy; no request was queued"})
                return
            try:
                audio = asyncio.run(synthesize(engine, text, voice, self.connection))
                self.reply(200, audio, "audio/wav")
            except Exception:
                self.reply(503, {"error": "local synthesis failed"})
            finally:
                busy.release()

        def log_message(self, *args):
            pass

    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler)
    server.daemon_threads = True
    server.timeout = 0.2
    lifecycle.write_json(state / "runtime.json", {"control_port": port, "token": token})
    try:
        while not stopped.is_set():
            server.handle_request()
    finally:
        server.server_close()
        if lifecycle.read_json(state / "runtime.json").get("token") == token:
            (state / "runtime.json").unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--state-dir", type=Path, default=Path.home() / ".config/agentflow/local-kokoro"
    )
    sub = parser.add_subparsers(dest="command", required=True)
    setup = sub.add_parser("setup")
    setup.add_argument(
        "--python", default=sys.executable, help="Python 3.12–3.13 interpreter"
    )
    start = sub.add_parser("start")
    start.add_argument("--port", type=int, default=17865)
    start.add_argument("--timeout", type=float, default=60)
    sub.add_parser("status")
    sub.add_parser("stop")
    internal = sub.add_parser("_serve", help=argparse.SUPPRESS)
    internal.add_argument("port", type=int)
    args = parser.parse_args()
    state = args.state_dir.expanduser().resolve()
    state.mkdir(parents=True, exist_ok=True, mode=0o700)
    state.chmod(0o700)
    if args.command == "_serve":
        token = lifecycle.read_supervisor_token(sys.stdin.fileno())
        sys.stdin.close()
        serve(state, args.port, token)
        return
    with (state / "lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        record = lifecycle.read_json(state / "runtime.json")
        active = lifecycle.control(record, "status")
        python = state / "venv/bin/python"
        if args.command == "status":
            reason = assets_status(state)
            if reason == "ready" and not python.is_file():
                reason = "missing_runtime"
            lifecycle.emit(
                {
                    "ready": bool(active),
                    "owned": bool(active),
                    "reason": "ready"
                    if active
                    else ("stopped" if reason == "ready" else reason),
                    "url": active.get("url") if active else None,
                }
            )
        elif args.command == "stop":
            result = lifecycle.control(record, "stop")
            deadline = time.monotonic() + 7
            while (
                result
                and (state / "runtime.json").exists()
                and time.monotonic() < deadline
            ):
                time.sleep(0.05)
            if result and (state / "runtime.json").exists():
                raise ValueError("owned runtime did not stop within deadline")
            lifecycle.emit({"stopped": bool(result), "ready": False})
        elif args.command == "setup":
            if active:
                raise ValueError("stop owned runtime before setup")
            subprocess.run(
                [
                    args.python,
                    "-c",
                    'import sys; assert (3,12) <= sys.version_info[:2] <= (3,13), "Use Python 3.12–3.13"',
                ],
                check=True,
            )
            subprocess.run([args.python, "-m", "venv", str(state / "venv")], check=True)
            subprocess.run(
                [
                    str(python),
                    "-m",
                    "pip",
                    "install",
                    "--require-hashes",
                    "-r",
                    str(Path(__file__).with_name("kokoro-requirements.txt")),
                ],
                check=True,
                stdout=sys.stderr,
            )
            for name, sha in ASSETS.items():
                if (state / name).is_file() and lifecycle.digest(state / name) == sha:
                    continue
                with urllib.request.urlopen(RELEASE + name, timeout=60) as source:
                    install_asset(state / name, source, sha)
            lifecycle.emit({"installed": True, "state": str(state)})
        elif args.command == "start":
            if active:
                lifecycle.emit({k: v for k, v in active.items() if k != "token"})
                return
            if assets_status(state) != "ready" or not python.is_file():
                raise ValueError(
                    "missing or corrupt model/runtime; run setup explicitly"
                )
            if not 1 <= args.port <= 65535 or not 0 < args.timeout <= 300:
                raise ValueError("invalid port or readiness timeout")
            with socket.socket() as probe:
                probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                try:
                    probe.bind(("127.0.0.1", args.port))
                except OSError:
                    raise ValueError(
                        "port already in use; no existing process was stopped"
                    ) from None
            token = secrets.token_hex(32)
            child = subprocess.Popen(
                [
                    str(python),
                    str(Path(__file__).resolve()),
                    "--state-dir",
                    str(state),
                    "_serve",
                    str(args.port),
                ],
                stdin=subprocess.PIPE,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True,
            )
            child.stdin.write((token + "\n").encode())
            child.stdin.close()
            deadline = time.monotonic() + args.timeout
            while child.poll() is None and time.monotonic() < deadline:
                record = lifecycle.read_json(state / "runtime.json")
                result = (
                    lifecycle.control(record, "status")
                    if record.get("token") == token
                    else None
                )
                if result:
                    lifecycle.emit({k: v for k, v in result.items() if k != "token"})
                    return
                time.sleep(0.1)
            if child.poll() is None:
                child.terminate()
                child.wait(timeout=7)
            raise ValueError(
                "Kokoro readiness failed; rerun setup to repair runtime/model"
            )


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        lifecycle.emit({"error": str(error)})
        sys.exit(1)
