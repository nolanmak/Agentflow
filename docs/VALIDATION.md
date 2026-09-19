# Implementation and verification — 2026-09-19

## Passing evidence

- Node unit/contract/integration suite: 31 tests passed. Covers four speech adapters, redacted provider failures, key isolation, Host/Origin/token protection, exact user text, operation deduplication including native ID migration, authenticated terminal WebSocket input/output, native view lifetime, voice chunks/VAD, MCP clock/tool schemas, and launchd plist paths.
- Playwright: 3 browser tests passed with mocked agent/provider endpoints and a fake microphone. Session selection, historical timestamps, provider swaps, recording/submission/playback, and mobile overflow were checked. Desktop screenshot visually reviewed.
- Real Deepgram TTS → STT: 55,584 bytes of generated audio, successful transcription, macOS `afplay` exit 0. The authorized existing local key was imported into Agentflow Keychain without exposing it.
- Real Codex SDK compatibility: three turns retained native session identity and remembered two synthetic nonce facts.
- Real native Codex live queue: an externally controlled queue turn recalled a fact from the still-running original native terminal. No exit/resume or copied chat.
- Full live HTTP/WebSocket pipeline: typed “pineapple” into the native terminal, generated synthetic speech, transcribed through Deepgram, submitted the exact transcript through the API into that same native PID, received “pineapple,” observed terminal and browser streams update, verified native timestamps, synthesized 6,048 bytes of reply audio and played it on macOS. `scripts/live-pipeline.js` exits nonzero on any failed assertion and cleans up its owned test session/audio.
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
