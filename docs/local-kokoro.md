# Local Kokoro speech output

Kokoro speaks replies on your computer. It is independent of local Whisper input and the native agent's reasoning provider. No cloud key is read for local synthesis, and failure never falls back to a cloud voice.

## Setup

Install Python 3.12 or 3.13 (on macOS, `brew install python@3.12`), then run from a built Agentflow checkout:

```sh
npm ci
npm run build
node dist/src/cli.js local-kokoro setup --python python3.12
node dist/src/cli.js local-kokoro start
node dist/src/cli.js local-kokoro status
```

Setup explicitly downloads the pinned Python runtime dependencies, model and voices. It verifies SHA-256 checksums; inference needs no external network. The full model is roughly 311 MB, plus voice data and the Python environment. Default state is `~/.config/agentflow/local-kokoro` (`AGENTFLOW_HOME` overrides the parent directory). Use `--state-dir PATH` before the lifecycle subcommand for isolated state. A stopped runtime stays stopped until explicitly started; Agentflow startup does not download models or capture a microphone.

In Speech & settings choose **Local Kokoro** for Speaking. Model: `kokoro`. Voice: `af_heart` (American English); other installed American/British voices can be listed at `http://127.0.0.1:17865/v1/audio/voices`. Save preferences and use **Test voice**. Playback speed applies in the browser or native player, independently of synthesis. The default endpoint is `http://127.0.0.1:17865`; only explicit loopback HTTP origins are accepted. The browser talks to Agentflow, which connects directly without proxy routing or redirects.

```sh
node dist/src/cli.js speak --text "Local speech is ready."
node dist/src/cli.js local-kokoro stop
```

The MCP `speak` tool uses the same local provider and macOS playback path. Changing voice output does not change transcription, agent routing, or session identity. This integration currently exposes English voices, not custom voice cloning.

## Failure and interruption

Missing/corrupt assets require explicit `setup`; no download occurs during a speech request. `start` checks assets and reports an occupied port without stopping the other process. `stop` authenticates ownership through a private control token, not a guessed PID.

Native replies are spoken in sentence order. Long unpunctuated text is split without discarding its tail. Interrupt immediately pauses browser playback, aborts the HTTP request, and invalidates late audio. The runtime finishes its current bounded CPU chunk, then detects disconnect and skips subsequent chunks. While busy it rejects concurrent work instead of queuing stale speech. Each request has a synthesis deadline and bounded audio output. If output fails, the error remains visible and remaining queued sentences stop; Replay retries speech without another agent turn.

## Runtime and licenses

Pinned `kokoro-onnx` 0.6.1 (MIT), ONNX Runtime 1.23.2 and NumPy 2.3.5 run on CPU. Kokoro v1.0 weights are Apache-2.0. The phonemizer/eSpeak dependency stack includes GPL-family components; the complete runtime is not Apache-only. Setup installs dependencies in a separate virtual environment; see package licenses before redistributing a bundled environment.

The model and voice checksums are in `scripts/local-kokoro.py`; all Python package hashes are in `scripts/kokoro-requirements.txt`. The FP32 model is intentional: the tested int8 variant lacked a supported ARM CPU operator.

Sources: [Kokoro model](https://huggingface.co/hexgrad/Kokoro-82M), [ONNX implementation](https://github.com/thewh1teagle/kokoro-onnx).

## Validation

Reference: Apple M3 Mac, 24 GiB RAM, CPU inference. Under a macOS sandbox denying external outbound networking, a 94-character synthetic sentence produced 5.735 seconds of valid mono 24 kHz PCM audio. Cold synthesis: 1.975 seconds. Three warm runs: 1.741, 1.714, 1.734 seconds. Runtime RSS after four runs: about 754 MiB. Readiness including asset verification took about 0.77 seconds. These are measurements on this device, not minimum hardware guarantees or voice-quality scores.

Chromium playback of synthetic WAV on the reference Mac paused in about 3 ms after an interrupt; the test enforces 250 ms and verifies no additional agent turn during Replay. Automated device playback is distinct from a person confirming speaker quality. Microphone, echo, sleep/wake and human listening checks remain part of the broader device QA issue, not claimed here.

To reproduce the opt-in real-engine app check after starting Kokoro, run from the repository root:

```sh
npm run build
sandbox-exec -p '(version 1)(allow default)(deny network-outbound)(allow network-outbound (remote ip "localhost:*"))' node scripts/live-local-kokoro.mjs --play
```

This uses disposable application settings and synthetic text. `--play` exercises CLI and MCP through the real Mac audio player; omit it to validate audio without playback. Start the runtime under the same sandbox profile to also enforce offline model execution. The reference run returned HTTP 200 with 82,060 bytes of PCM WAV, CLI `Spoken.`, and MCP `Speech played on the local Mac.` No cloud credentials were read. This confirms successful audio-device execution, not a subjective listening assessment.
