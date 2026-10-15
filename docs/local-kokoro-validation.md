# Local Kokoro acceptance evidence

Issue: [#24](https://github.com/nolanmak/Agentflow/issues/24). Reference QA: 2026-10-15, Apple M3, 24 GiB RAM, macOS; Node 26.5.1, Python 3.12 for real inference. See [setup and measured performance](local-kokoro.md).

| Criterion | Evidence |
| --- | --- |
| AC1 pinning/offline | Hash-locked `kokoro-requirements.txt`; model/voices SHA-256 in `local-kokoro.py`; real engine and app executed under sandbox denying non-loopback outbound traffic |
| AC2 independent/keyless | `local-kokoro.test.ts` persistence, rejection of STT and remote origins, direct HTTP proxy/redirect and no-key-lookup tests; browser Local Kokoro settings test |
| AC3 lifecycle | `test_local_kokoro.py` asset validation, atomic install, explicit missing-model failure, owned control stop, invalid-origin rejection; setup/start/status/stop exercised with real engine |
| AC4 playback | Browser ordered retry test and exact-text chunking test; real `/api/synthesize` returned PCM WAV; CLI and MCP successfully executed native playback offline at saved 1.25× speed |
| AC5 interruption/retry | Browser pending-synthesis and delayed-replay tests; real Chromium WAV playback pause measured 1.3–2.8 ms (250 ms bound); no new agent turn on Replay; real HTTP stalled-response abort/recovery and runtime disconnect tests |
| AC6 failure boundaries | Adapter tests cover invalid model/voice, empty text, malformed and oversized audio, cancellation and runtime HTTP failures; lifecycle tests cover bounded requests and assets; full deterministic suites |
| AC7 real-engine measurements | Offline cold 1.975 s, warm 1.714–1.741 s for 5.735 s audio, RSS about754 MiB; full model selected after int8 CPU operator incompatibility; real CLI/MCP smoke succeeded |
| AC8 delivery | PR/CI and merge recorded in issue; task worktree cleaned after merge |

## Actual test-first evidence

- Adapter settings initially failed `Invalid/Unknown provider`; minimal provider/config support made them pass.
- Malformed WAV regression initially failed with `Missing expected rejection`; validation now rejects it.
- HTTP synthesis initially returned500 because the endpoint read a credential; selected local output now bypasses key lookup.
- Runtime first tests failed because `local-kokoro.py` did not exist. Disconnect tests later failed for missing synthesis helper before its implementation.
- Browser local output test failed because the provider option count was0, then passed after UI wiring.
- CLI help test failed because `local-kokoro --help` printed generic help without `state-dir`, then passed after lifecycle dispatch/build packaging.
- Voice-test interruption failed because Interrupt was disabled during synthesis. It now remains available and late results cannot play.
- Delayed replay overwrote Interrupted with Your turn. A generation guard fixes the reproduced failure.
- Speech failure was overwritten by Your turn and later queued sentences kept running. The regression now retains the error, stops the queue, and retries only on explicit Replay in original sentence order.
- Long reply chunking test failed before the helper existed; chunks now concatenate to the complete original input without splitting surrogate pairs.
- Real `afplay` rejected WAV saved as `.mp3` (`AudioFileOpen dta?`); the filename regression failed before container-aware extension handling. Same bytes as `.wav` and the real CLI/MCP path then succeeded.

## Commands

- `npm run typecheck`
- `npm test`:65 tests passed
- `npm run test:e2e`:19 tests passed, including real browser audio-element interruption
- `python3 scripts/test_local_kokoro.py`
- `python3 scripts/test_local_whisper.py`:9 tests passed
- `node scripts/live-local-kokoro.mjs --play` under the sandbox profile in the setup guide: real app synthesis, CLI and MCP playback passed
- `git diff --check`

The browser tests use synthetic audio and fake native sessions, while real-engine checks use synthetic text and disposable application settings. No personal recordings, native histories or cloud credentials are fixtures. Native audio-player success is observed, but speaker quality, microphone/echo behavior and sleep/wake are not human-verified here. General device QA remains tracked in #23.
