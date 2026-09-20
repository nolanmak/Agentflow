# Implementation and verification — 2026-09-19

## Passing evidence

- Node unit/contract/integration suite: 37 tests passed. Covers four speech adapters, redacted provider failures, key isolation, Host/Origin/token protection, exact user text, operation deduplication including native ID migration, authenticated terminal WebSocket input/output, native view lifetime, voice chunks/VAD, MCP clock/tool schemas, and launchd plist paths.
- Playwright: 8 browser tests passed with mocked agent/provider endpoints and a fake microphone. Session selection, historical timestamps, provider swaps, recording/submission/playback, and mobile overflow were checked. Desktop screenshot visually reviewed.
- Real Deepgram TTS → STT: 55,584 bytes of generated audio, successful transcription, macOS `afplay` exit 0. The authorized existing local key was imported into Agentflow Keychain without exposing it.
- Real Codex SDK compatibility: three turns retained native session identity and remembered two synthetic nonce facts.
- Real native Codex live queue: an externally controlled queue turn recalled a fact from the still-running original native terminal. No exit/resume or copied chat.
- Full live HTTP/WebSocket pipeline: typed “pineapple” into the native terminal, generated synthetic speech, transcribed through Deepgram, submitted the exact transcript through the API into that same native PID, received “pineapple,” observed terminal and browser streams update, verified native timestamps, synthesized 6,048 bytes of reply audio and played it on macOS. `dist/scripts/live-pipeline.js` exits nonzero on any failed assertion and cleans up its owned test session/audio.
- Claude private inbox delivered to a disposable running session, but native history wrapped it as a peer request. This failed the user's exact-input semantics and the production route was removed. Delivery is not counted as Claude conversation parity.
- MCP `speak`, `current_time`, and `session_history` registered for both native CLIs. Schema/clock subprocess test passed. Persistent terminal speech mode is not yet implemented.
- launchd service installed, started, inspected, and restarted; repeated install did not create another service. Real reboot/login has not been tested.

## Test-first evidence

Initial failing suites preceded implementation for provider contracts, native normalization, HTTP security, voice segmentation/VAD, service config, and native terminal sharing. Later red regressions proved two real defects: operation retries conflicted after native ID resolution, and the API trimmed user text. Both were fixed and their tests pass. Live pipeline found and fixed a WebSocket upgrade-header bug; the authenticated WebSocket regression test now covers it. MCP clock/history schema test was run red before implementing the tools.

## Remaining limits (issues stay open)

- Claude account reports “You've hit your weekly limit · resets 2am (America/New_York)”; no successful Claude model reply is claimed. Managed native input is implemented, external user-input attachment is not verified.
- OpenAI, ElevenLabs, and 9Router are contract-tested only; live credentials/routes were not established. Inspected 9Router speech catalogs were empty.
- Browser tests use a fake microphone. Physical mic/speaker echo, automatic barge-in, audio-device absence, full reconnect recovery, and measured interruption budgets remain acceptance work.
- UI histories show a bounded preview; this does not constrain native context. Native compaction is still the agent's own behavior. Tools expose time/history; tool availability does not guarantee the model invokes them on every time question.
- Canceling an external queued Codex job stops Agentflow waiting/audio; it does not guarantee removal of an already accepted native queue turn.
- External terminal raw-screen mirroring, prompt-draft/approval races, and all native concurrent-input cases are not certified.
- Service restart kills service-owned native PTYs. Continuous log rotation and a real login acceptance run remain open.
- CLI/MCP one-shot local speech works. AF-17 now tracks only the minimal CLI/MCP speech path with S01–S08 evidence. Custom terminal microphone capture and automatic speech modes are deferred.

No personal transcripts, provider credentials, or recorded user audio are committed. Keep paid live checks opt-in and use disposable native sessions.

CLI/MCP simplification: a browser-free subprocess test proves stdin and MCP send identical literal text to the same endpoint. An MCP failure test was run red, then fixed to return `isError: true` for execution failures. No skill or separate conversation model was added.

## Deepgram voice picker (AF-18)

Tests were run red before implementation: the preview configuration export was missing and all three initial picker tests failed because the control did not exist. The completed suite covers configured-key gating, exact voice-model persistence across reload, STT/session preservation, unsaved preview isolation, close/change cancellation, active-call exclusion, provider errors, and generic fields for other providers. Invalid preview IDs are rejected before key lookup/provider dispatch. A real Helena preview returned audio without changing saved settings. Strict TypeScript migration is covered below.


## Strict TypeScript migration (AF-19)

- All handwritten application, browser, executable scripts, test modules, and Playwright config are `.ts`. No handwritten JavaScript remains. Strict `tsc --noEmit` passes; negative fixtures reject invalid agent/event/status/terminal input types.
- Red stage: compiled-entrypoint test failed with missing `dist/src/cli.js`. Runtime decoder tests then failed because job/terminal decoder exports were absent. Green: compiled entrypoint and decoder tests pass in the 37-test suite.
- A tracked-source export into an empty temporary directory passed `npm ci`, strict typecheck, build, all 37 compiled Node tests, and all 8 browser tests. The browser suite starts its own isolated loopback server; no provider credentials are required. `npm ci` reported zero dependency vulnerabilities at the time of verification.
- Final compiled live pipeline passed: exact Deepgram transcription reached the same native Codex PID, the synthetic remembered word was returned, both WebSocket views updated, timestamps were present, and 6,048 bytes of Helena audio played via `afplay`. No personal session was used.
- Installed CLI symlink, launchd definition, Codex MCP entry, and Claude MCP entry now point to `dist/src/`. Before service replacement, authenticated inspection reported zero active jobs and zero live managed terminals. Unrelated native sessions were not restarted. Deepgram remained configured and the saved Helena voice remained selected.
- Production HTTP checks returned 200 for HTML, compiled app, shared contracts, DOM helper, and xterm assets. No TypeScript loader is required by the compiled runtime.
- GitHub CI is configured for Node 26.5.1, clean install, typecheck, compiled tests/build, and Chromium browser tests. [The first hosted run](https://github.com/nolanmak/Agentflow/actions/runs/35479267243) was blocked before any steps started: GitHub reported failed account payments or an insufficient spending limit. Hosted CI is not counted as passing; AF-19 remains open for that criterion.
- Gitleaks scanned published history and the clean current source export with zero findings. This does not erase owner-accepted historical author identity or establish that every possible form of PII is detectable. No history rewrite was performed.

Claude live response limitations and physical microphone acceptance remain as listed above; this migration does not claim to resolve those separate release gaps.

Production-only dependency verification also passed after `npm prune --omit=dev`: compiled CLI ran and the server served HTML, application modules, and xterm assets with the TypeScript package absent.
