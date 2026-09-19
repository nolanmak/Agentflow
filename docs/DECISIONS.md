# Decisions and open questions

## Accepted product decisions

- Name and directory: Agentflow, under the user's Documents directory.
- macOS localhost application with an optional login service; no public deployment.
- Two native agent backends: Claude Code and Codex.
- Same-session continuity is mandatory. A forked conversation or generic LLM wrapper is not an equivalent result.
- STT and TTS are independently pluggable; initial providers are OpenAI, Deepgram, ElevenLabs, and 9Router.
- BYOK is a first-class settings flow. Native agent authentication remains unchanged.
- All implementation issues have acceptance criteria and test-first requirements.
- Private GitHub repository by default: no public publishing requested.

## Decisions gated on evidence

| Question | Owner | Evidence required |
| --- | --- | --- |
| Which transport can support a managed terminal and browser on one session? | AF-01 | Native ID round-trip plus concurrent input and approval tests for each installed CLI |
| Can an arbitrary already-running native terminal accept a supported external controller? | AF-01 | Verified official mechanism and executable test; otherwise explicit legacy handoff |
| Which provider models/voices are enabled with supplied keys? | AF-08–AF-11 | Authenticated discovery or opt-in live request; docs alone do not establish entitlement |
| Which codecs play consistently in the supported browser? | AF-12 | Fixture-based browser playback and real-device acceptance |
| How much echo/barge-in filtering is needed? | AF-12/AF-16 | Speaker and headphones tests on the actual Mac |
| What packaging avoids dependence on interactive nvm? | AF-15 | Minimal-environment launchd integration test |

## Observed versus assumed

Observed locally: Codex 0.154.0 supports `exec resume`; Claude Code 2.1.278 supports `--resume` and structured streaming output. This demonstrates available command interfaces, not that a live terminal can be attached safely by another process. The current dashboard conversation itself is not a disposable test session.

Observed locally: the existing 9Router container uses a loopback mapping at port 20128. Its authenticated speech catalogs were empty. No end-to-end speech success has been claimed.

Proposed, not implemented: TypeScript service, React interface, keychain credential storage, managed terminal wrapper, all `agentflow` commands, voice state machine, and launchd installer.

## Documentation consulted

- [Codex non-interactive mode](https://developers.openai.com/codex/noninteractive)
- [Codex app server](https://developers.openai.com/codex/app-server) — candidate transport; protocol/version details must be verified in AF-01.
- [Claude Code programmatic usage](https://code.claude.com/docs/en/headless)
- [Claude Code CLI reference](https://code.claude.com/docs/en/cli-reference)
- [Claude Code voice dictation](https://code.claude.com/docs/en/voice-dictation) — native dictation covers input, not this dashboard's speech output.
- Speech endpoint references are in [PROVIDERS.md](PROVIDERS.md).

Sources and local observations checked 2026-09-19. API and CLI details are version-sensitive; recheck the relevant primary reference when implementing its adapter.
