# Implementation backlog

All 17 issues remain open pending complete acceptance evidence. The working implementation and live checks are described in [VALIDATION.md](VALIDATION.md). Each includes acceptance criteria, a test-first implementation sequence, dependencies, and completion evidence. Repository: [nolanmak/Agentflow](https://github.com/nolanmak/Agentflow) (private).

The local issue specifications mirror the initial GitHub issue bodies. GitHub is authoritative for status and discussion; update local specs when scope changes.

| ID | Issue | Milestone | Dependencies |
| --- | --- | --- | --- |
| AF-01 | [Prove native session continuity and choose supported transports](https://github.com/nolanmak/Agentflow/issues/1) | M0: Session proof | None |
| AF-02 | [Create the local service, typed contracts, and deterministic test harness](https://github.com/nolanmak/Agentflow/issues/2) | M0: Session proof | None |
| AF-03 | [Discover and index Codex and Claude Code sessions without modifying history](https://github.com/nolanmak/Agentflow/issues/3) | M0: Session proof | AF-01, AF-02 |
| AF-04 | [Coordinate session ownership, handoff, deduplication, and recovery](https://github.com/nolanmak/Agentflow/issues/4) | M1: Agent core | AF-01, AF-02, AF-03 |
| AF-05 | [Implement the Codex adapter with same-session resume and approvals](https://github.com/nolanmak/Agentflow/issues/5) | M1: Agent core | AF-01, AF-04 |
| AF-06 | [Implement the Claude Code adapter with same-session resume and approvals](https://github.com/nolanmak/Agentflow/issues/6) | M1: Agent core | AF-01, AF-04 |
| AF-07 | [Build independent STT/TTS configuration and secure BYOK settings](https://github.com/nolanmak/Agentflow/issues/7) | M2: Speech providers | AF-02 |
| AF-08 | [Add the OpenAI transcription and speech provider adapter](https://github.com/nolanmak/Agentflow/issues/8) | M2: Speech providers | AF-07 |
| AF-09 | [Add the Deepgram transcription and speech provider adapter](https://github.com/nolanmak/Agentflow/issues/9) | M2: Speech providers | AF-07 |
| AF-10 | [Add ElevenLabs transcription, voice selection, and speech adapter](https://github.com/nolanmak/Agentflow/issues/10) | M2: Speech providers | AF-07 |
| AF-11 | [Integrate 9Router speech discovery and OpenAI-compatible audio routes](https://github.com/nolanmak/Agentflow/issues/11) | M2: Speech providers | AF-07 |
| AF-12 | [Implement microphone capture, hands-free turns, ordered speech, and interruption](https://github.com/nolanmak/Agentflow/issues/12) | M3: Conversation | AF-04, AF-07, AF-08 |
| AF-13 | [Build the session dashboard, provider settings, and voice-first controls](https://github.com/nolanmak/Agentflow/issues/13) | M3: Conversation | AF-03, AF-05, AF-06, AF-07, AF-12 |
| AF-14 | [Add the managed terminal launcher and agent-callable speak tool](https://github.com/nolanmak/Agentflow/issues/14) | M3: Conversation | AF-01, AF-04, AF-05, AF-06, AF-12 |
| AF-15 | [Package macOS startup, service management, and login autostart](https://github.com/nolanmak/Agentflow/issues/15) | M4: Daily-use release | AF-02, AF-13, AF-14 |
| AF-16 | [Validate full voice workflows, latency, and release readiness](https://github.com/nolanmak/Agentflow/issues/16) | M4: Daily-use release | AF-05, AF-06, AF-08, AF-09, AF-10, AF-11, AF-12, AF-13, AF-14, AF-15 |

| AF-17 | [Simple terminal speech through Agentflow CLI and one agent tool](https://github.com/nolanmak/Agentflow/issues/17) | M3: Conversation | AF-14, AF-07 |

## Execution rules

1. Prove session continuity in AF-01 before committing to transport choices. AF-02 can establish the deterministic test harness independently.
2. Write and run the failing test for each behavior before production implementation.
3. Close issues only after acceptance evidence exists; mocked success does not establish live-provider or microphone support.
4. Use [the issue template](../.github/ISSUE_TEMPLATE/feature.yml) for new work and [the testing strategy](TESTING.md) for implementation.
5. Milestone ordering describes dependencies, not delivery-time estimates. A missing speech key should not block deterministic implementation or direct-provider alternatives.

Local issue bodies: [docs/issues](issues/). Machine-readable mapping: [manifest.json](issues/manifest.json). The generator recreates the initial specification text and preserves GitHub URL/number mappings; it does not synchronize edits to GitHub.
