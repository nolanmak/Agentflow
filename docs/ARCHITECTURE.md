# Implemented architecture

Agentflow is a loopback Node ES-module HTTP/WebSocket service with a plain browser module UI, xterm terminal view, Node test runner, and Playwright. Dependencies are pinned in package-lock.json. The earlier TypeScript/React proposal was not implemented.

## Native session ownership

`Terminals` owns one actual native CLI PTY per managed session. `agentflow run` and the dashboard subscribe to the same raw output and send input through the same PTY. Disconnecting a view does not kill the native process. Native trust, permission, model, tool, and cwd behavior remains authoritative. Service shutdown does terminate its owned processes.

Codex assigns the real native session UUID after startup; the provisional launcher ID becomes an alias. Jobs preserve the original request ID for retry deduplication while reporting the real native session ID. The live queue lets an external Codex process receive an exact user turn without exit/resume or another inference process.

Claude managed sessions use actual native terminal input. External Claude peer inbox research found native peer wrapping, so the private inbox is NOT used by the production input path. `scripts/live-claude-inbox.js` is an opt-in compatibility research check, not evidence of user-input parity. External Claude attachment remains incomplete. Do not add a handoff warning as a substitute for simultaneous continuity.

Native JSONL histories are read only for UI preview and response observation. Preview is bounded to 1 MB/40 messages; native inference retains its own context. Agentflow adds no hidden voice prompt, copied transcript, or alternate model. Timestamped native records and the `current_time` MCP tool provide explicit time data; missing native data must not be invented.

## APIs and state

- `/api/bootstrap`: same-origin local browser token; no tokens in URLs.
- `/api/sessions`, `/api/history`: native session metadata and timestamped previews.
- `/api/terminals`, authenticated `/terminal` WebSocket: create/attach native terminal views.
- `/api/turns`, `/api/jobs/:id`, `/api/jobs/:id/cancel`: deduplicated submissions, status, and cancellation.
- `/api/settings`, `/api/keys`: independent STT/TTS configuration and write/delete-only key management.
- `/api/transcribe`, `/api/synthesize`, `/api/speak`: selected speech provider; `/speak` uses local macOS playback.
- `/api/router/models`: explicit 9Router speech catalog lookup.

Jobs persist up to 100 records in the user's private Agentflow configuration directory, including recent submitted/replied text for recovery. This is additional local text retention; recordings are not retained. In-progress jobs become uncertain after service restart and are never replayed automatically. Browser refresh currently warns about an interrupted view rather than restoring complete audio/playback state.

One Agentflow job per native session is enforced. The native CLI controls typed/queued input and permission handling. Arbitrary existing prompt drafts, human typing races, and approval-state input require further acceptance testing before a daily-use release.

## Voice

Microphone capture is opt-in. Hands-free uses RMS/silence turn detection followed by recorded-utterance STT, native agent response, sentence-ordered TTS, then another listening cycle. This is half-duplex with explicit interruption. Automatic speaker barge-in is not implemented. STT and TTS providers are independently swappable between calls.

The native answer text is sent to TTS without a separate rewriting model. Browser speech is played by the browser; CLI/MCP speech uses `afplay` on the Mac. A connected browser is not required for `speak`.

## Local security and lifecycle

The server binds only 127.0.0.1, checks Host/Origin, requires a local token for API access, and authenticates WebSockets in their initial message. Provider keys stay in Keychain/server memory and never enter frontend state. Provider redirects are disabled. Native permissions are not globally bypassed.

A per-user launchd plist uses absolute node/application paths and a fixed PATH. Login startup does not capture a microphone, submit a turn, or start 9Router. Logs rotate on installation only; continuous rotation is still a release gap. Native CLI compatibility and account entitlement are separate from app connectivity.

See [VALIDATION.md](VALIDATION.md) for measured evidence and [AF-17](issues/af-17.md) for terminal-only voice acceptance criteria.
