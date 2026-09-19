# Test-driven development strategy

## Working loop

For each behavioral acceptance criterion:

1. **Red:** write the smallest test of observable behavior; run it and confirm it fails for the missing behavior, not an unrelated dependency or syntax error.
2. **Green:** implement the minimum production behavior that makes that test pass. Run the focused suite.
3. **Refactor:** simplify names/boundaries while tests stay green. Run the relevant adjacent suites.
4. **Evidence:** record test names/commands and results in the PR. Include red-stage evidence where practical (test commit, CI run, or concise captured failure). Never manufacture a past failing result.

Do not write the whole implementation and retroactively label tests TDD. Do not require a separate commit per tiny red/green cycle. Documentation changes get validation, not fake unit tests. Bug fixes begin with a reproduction test.

## Test layers

| Layer | What it proves | Isolation |
| --- | --- | --- |
| Unit | Turn state, sentence queue, selection boundaries, operation deduplication, settings validation | Fake clocks and deterministic inputs |
| Contract | All speech adapters normalize success/errors/cancellation; both agent adapters emit the same event contract | Captured synthetic fixtures and fake transport |
| Integration | Process lifecycle, ownership contention, reconnect cursors, key store interface, local HTTP security | Temporary homes, disposable SQLite/files, fake agent binaries |
| Browser E2E | Pick session, configure provider, record/transcribe, hear playback, interrupt, recover, return | Test audio and fake providers/agents; no personal keys |
| Opt-in live smoke | Installed CLI compatibility, native session round trip, provider formats, real audio | Dedicated disposable sessions and explicit credentials |
| Manual device | Microphone permission, echo/barge-in, audible output, sleep/wake, login startup | Human checklist, result recorded honestly |

Suggested tools: Vitest, Playwright, HTTP/WebSocket test servers, fake keychain adapter. Pick dependencies in AF-02 and pin them. Do not replace every failure boundary with shallow mocks; contract tests inspect actual outbound provider requests and streamed responses.

## Required scenarios

### Session identity and concurrency

- Terminal stores nonce A; resumed dashboard recalls A and stores B; resumed terminal recalls B with the same native ID.
- Two browser tabs contend for one session: one acquires ownership, the other gets a conflict; exactly one native turn is dispatched.
- Managed terminal and browser submit at once: the documented queue/ownership policy applies without mixed replies.
- Unmanaged running terminal is busy or unknown: dashboard does not launch a competing writer.
- Browser refresh repeats an operation ID: no duplicate dispatch, including after service restart. An uncertain crash state is surfaced instead of automatically replayed.
- Switching sessions during STT/agent/TTS invalidates old callbacks and cannot play old audio into the new session.
- Agent rejection, unsupported CLI version, missing executable, inaccessible cwd, and malformed events are recoverable UI states.
- Native approval requests survive mapping and reconnect; no default auto-approval.

### Speech/provider contracts

- Every direct provider and 9Router handles valid STT/TTS, missing/invalid keys, wrong model/voice, empty audio/text, cancellation, 429, 5xx, timeout, and malformed response.
- Test correct authentication header and serialization; fixtures use obviously fake secrets and synthetic speech.
- Ordered audio cannot reorder when requests resolve out of order. Cancellation discards queued and late chunks.
- Changing only STT leaves TTS and session settings unchanged, and vice versa. The new selection applies at the next documented boundary.
- TTS failure and retry never trigger a second model turn. STT failure never submits an empty or stale prompt.
- No generic catch/retry loop repeats paid work indefinitely.

### Local security and lifecycle

- Invalid Origin/Host, unauthorized WebSocket upgrades, missing CSRF token, and oversized payloads are rejected before spawning an agent or calling a provider.
- Provider redirects cannot exfiltrate auth to another origin. Secrets are absent from responses, logs, browser storage, and failure snapshots.
- Install twice produces one service; start twice produces one listener; stop/uninstall does not stop other processes or delete native agent history.
- launchd paths work with spaces and a minimal PATH; a port collision produces a clear status.
- Service start/login never starts microphone capture, launches an agent task, or provisions a speech provider.

## Performance checks

Measure capture-end → transcript, transcript → first agent text, first text → first audio, and interrupt → silence. Record provider/model, device, transport, and warm/cold conditions. An explicit playback interrupt target is ≤250 ms on the local supported-device test. Do not fail deterministic CI because of variable cloud response times; report live latency separately.

## CI and completion

On pull requests: typecheck/lint as configured, focused plus full deterministic unit/contract/integration tests, build, and the relevant browser suite. No provider credentials or personal home directory access in normal CI. Live tests are separately opt-in and must label skipped providers as unverified.

An issue is done only when all its acceptance criteria are checked, relevant tests pass, docs reflect actual behavior, and material verification gaps are stated. Avoid a blanket coverage percentage as a proxy for correctness; prioritize the high-risk boundaries above. The release issue collects the full user journey, real-device checklist, and known limitations.
