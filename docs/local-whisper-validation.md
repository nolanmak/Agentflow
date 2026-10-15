# Local transcription implementation evidence

Scope: GitHub #21, #22, with real engine/performance QA tracked by #23. Local TTS (#24) is a future follow-up.

## Observed red → green cycles

- `npm run build && node --test dist/test/local-whisper.test.js`: initial four behavior tests failed with `Invalid provider` / `Unknown speech provider`. After adding provider contracts, settings persistence, local WAV conversion and `/inference`, all four passed.
- `npm run test:e2e -- --grep 'local listening'`: failed waiting for the absent Local Whisper URL field. Added local input selection/URL, kept local out of TTS/key controls, and passed.
- `npm run test:e2e -- --grep 'snapshots listening'`: failed because the recording had no settings snapshot header. Added the capture-time snapshot and server validation; the test passed and proved a canceled late result did not dispatch a native turn.
- Oversized local transcript response regression failed `Missing expected rejection`; streaming response bound (64 KiB) made it pass.
- Global-fetch proxy isolation regression failed `Speech provider is unreachable or timed out` with a deliberately replaced global transport; a direct loopback HTTP agent made it pass.
- `node --test dist/test/build.test.js`: local setup CLI help failed because it printed generic Agentflow help. CLI delegation and packaging the Python helper made it pass.

Additional passing integration contracts cover real loopback HTTP multipart audio, redirect refusal, no Authorization header, malformed audio, silence without inference, cancellation after response, persisted STT independence, no local Keychain lookup, and server use of a captured local provider while saved settings still select cloud STT. Existing cloud and native-session tests remain required.

The Python runtime's own red/green evidence and pinning details are in [runtime setup](local-whisper-runtime.md). Its lifecycle tests use temporary directories and disposable helper processes. Browser tests use fake microphones, fake speech responses and synthetic native sessions; they do not prove microphone quality or a fully offline native agent.

- Independent review reproduced an uncaught HTTP 204 Response-constructor error; empty-body statuses now become recoverable transcript errors.
- Independent review reproduced a stale native submission when starting another recording during inference; each new recording now aborts its predecessor and increments the generation. Browser regression passed.
- Browser capture stops at 89 seconds to leave a flush margin beneath the converter's strict 90-second decoded limit.

- Follow-up review reproduced HTTP 700 crashing the process (Response RangeError); response construction now destroys the stream and rejects safely on malformed metadata.
- Out-of-order microphone permission success reproduced a live track leak after End; acquired streams remain local until generation validation. A stale permission rejection also stopped/submitted the current recording; the outer error path now ignores superseded generations. Both browser tests were observed red before the fixes and green afterward.

Final local checks: 53 Node tests, 14 Playwright browser tests and 8 Python lifecycle tests passed; typecheck and build passed. The manually exercised microphone and audible playback gates remain outstanding.

## Reproduce

```sh
npm ci
npm run typecheck
npm test
python3 scripts/test_local_whisper.py
npx playwright install chromium
npm run test:e2e
```

Node local speech tests require ffmpeg on PATH; CI installs it explicitly. No model or provider credential is required for deterministic tests. Real-engine audio quality/performance and network-isolated QA evidence is separate from these contracts and belongs to #23; do not infer those results from mocked provider tests.
