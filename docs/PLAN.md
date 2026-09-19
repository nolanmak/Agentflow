# Agentflow product and delivery plan

Date: 2026-09-19. Status: working local implementation; release criteria still in progress. See [VALIDATION.md](VALIDATION.md) for observed results.

## Outcome

Nolan can work in a terminal, open a localhost dashboard, select the same Claude Code or Codex session, speak naturally, and hear that agent respond. Returning to the terminal preserves the conversation. Agentflow provides the voice transport and session controls; the original agent still owns reasoning and tools.

## Main journeys

1. **Existing session:** open Agentflow, filter by agent/project, select a session, start talking while its original terminal stays open, and see both views reflect the same native conversation. Unsupported attachment must be reported explicitly; a close/resume handoff does not satisfy this requirement.
2. **Managed live session:** start the terminal through `agentflow run codex|claude`. Agentflow owns the process/transport; terminal and dashboard share one conversation and serialize turns. No second independent agent is spawned to handle a voice turn.
3. **Speak from an agent:** call `agentflow speak` or the Agentflow MCP `speak` tool to send text to the active local output device. A dashboard audio sink is preferred; local macOS playback covers a closed dashboard.
4. **BYOK:** add a provider key, choose the input provider/model and output provider/model/voice separately, test them, and save. Change either provider between turns without changing agent sessions.
5. **Autostart:** run `agentflow service install` once. On subsequent macOS logins the loopback service is available. The browser opens only on request; the microphone remains off until an explicit user action.

## Scope

| Area | Release requirement |
| --- | --- |
| Agents | Claude Code and Codex using installed, authenticated CLIs |
| Sessions | Discover saved sessions; preserve ID, project, latest conversation, and tool permissions |
| Terminal continuity | Simultaneous native terminal/dashboard conversation; unsupported external attachment is a tracked gap |
| Speech input | OpenAI, Deepgram, ElevenLabs, 9Router; recorded utterances first, streaming where supported |
| Speech output | OpenAI, Deepgram, ElevenLabs, 9Router; cancelable queued audio with provider/voice selection |
| Conversation | Push-to-talk and hands-free conversation; end call, interrupt, retry, hidden/visible transcript |
| Credentials | User-supplied keys, independent provider config, masked status, replace/delete, OS keychain |
| Platform | macOS first; localhost browser dashboard and terminal CLI |
| Startup | Idempotent install/status/uninstall commands for a per-user launchd service |

Do not quietly replace the native agent with a generic chat-completions model. Do not advertise arbitrary live terminal attachment until verified. Do not expose the service to LAN or public hosting for the first release. No billing-account management, hosted multiuser service, or custom voice cloning is required.

## Delivery sequence and gates

### M0 — Prove session continuity

Issues AF-01–AF-03. Define supported CLI versions and transports with executable integration fixtures. Prove existing-session resume and terminal → dashboard → terminal continuity for each agent. Determine whether a managed terminal can use a supported structured transport, whether a PTY bridge is needed, and how approval events work. Document any unsupported live-attach case explicitly.

**Gate:** no UI claim of seamless live handoff without passing round-trip tests. Discovery may proceed independently; production adapter choices depend on these results.

### M1 — Reliable agent session core

Issues AF-04–AF-06. Build on session discovery with one-writer ownership and both agent adapters. Cover cancellation, permission requests, reconnect, and external terminal ownership. Native histories remain authoritative; Agentflow does not edit them.

### M2 — Swappable speech and credentials

Issues AF-07–AF-11. Build key storage and independent STT/TTS contracts, then implement OpenAI, Deepgram, ElevenLabs, and 9Router adapters. Run the same conformance suite against each adapter. A speech-only setting change cannot change the agent's model/routing.

### M3 — Conversational dashboard

Issues AF-12–AF-14. Implement microphone/turn state, ordered cancelable speech, session picker, settings, approvals, reconnect, terminal launcher, and agent-callable speak tool. Expose provider failures as recoverable errors; retain unsent transcripts for retry.

### M4 — Daily-use release

Issues AF-15–AF-16. Install/start/status/stop/uninstall support, launchd login startup, end-to-end regression tests, accessibility, and measured latency diagnostics. Complete a real-device acceptance run using disposable sessions.

## Success criteria

- A remembered fact supplied in the terminal is available in a voice turn; a fact supplied by voice is available in the still-running terminal. Identity stays identical.
- No duplicate agent turn is dispatched on browser retry/reconnect; no two writers can modify one session concurrently.
- OpenAI STT + ElevenLabs TTS, Deepgram STT + OpenAI TTS, and 9Router configurations are independently selectable and pass contract tests.
- The dashboard announces listening/thinking/speaking/error states; stop releases microphone tracks and interrupts playback.
- Playback stops within 250 ms of an explicit interrupt in local acceptance tests. Timing of cloud transcription and generation is measured, not guaranteed.
- Provider failures, malformed responses, expired keys, agent exits, and router downtime do not destroy the selected session or lose the user's pending transcript.
- The localhost service returns after login without duplicate listeners and without opening a microphone.
- No key, personal transcript, or recorded audio appears in source control or normal application logs.

## TDD execution

Follow docs/TESTING.md. Work one behavior at a time: failing acceptance-focused test → minimal implementation → passing focused suite → refactor → integration evidence. Each issue body defines its own red cases and completion evidence. Documentation-only tasks use validation checks; do not manufacture pointless unit tests for prose.

## Current local findings

- macOS environment; Codex CLI 0.154.0 and Claude Code 2.1.278 observed.
- Both expose resume/session mechanisms. Those mechanisms alone do not prove simultaneous attachment to an existing interactive process.
- Existing 9Router is a Docker container at loopback port 20128. Discovery requires an API key. Its authenticated STT and TTS model catalogs were empty during inspection: no working speech route has been verified.
- Existing native agent histories are available locally. They must never be committed to the repo or used as public fixtures.
- Speech keys are handled by the local settings interface and macOS Keychain; no keys are needed in chat.

## Terminal-only scope

[AF-17](issues/af-17.md) defines browser-free one-shot and persistent speech, terminal microphone input, exact native context, and T01–T14 objective acceptance tests. Current CLI/MCP one-shot speech is implemented; the complete AF-17 workflow remains open.
