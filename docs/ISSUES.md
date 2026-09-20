# Open implementation backlog

The working implementation and live checks are described in [VALIDATION.md](VALIDATION.md). GitHub is authoritative for status and discussion. The completed planning issues AF-01–AF-07, AF-09, AF-13–AF-14, and AF-17–AF-18 were closed after local validation and owner confirmation.

| ID    | Issue                                                                                                                               | Milestone             | Dependencies                                                         |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------- | -------------------------------------------------------------------- |
| AF-08 | [Add the OpenAI transcription and speech provider adapter](https://github.com/nolanmak/Agentflow/issues/8)                          | M2: Speech providers  | AF-07                                                                |
| AF-10 | [Add ElevenLabs transcription, voice selection, and speech adapter](https://github.com/nolanmak/Agentflow/issues/10)                | M2: Speech providers  | AF-07                                                                |
| AF-11 | [Integrate 9Router speech discovery and OpenAI-compatible audio routes](https://github.com/nolanmak/Agentflow/issues/11)            | M2: Speech providers  | AF-07                                                                |
| AF-12 | [Implement microphone capture, hands-free turns, ordered speech, and interruption](https://github.com/nolanmak/Agentflow/issues/12) | M3: Conversation      | AF-04, AF-07, AF-08                                                  |
| AF-15 | [Package macOS startup, service management, and login autostart](https://github.com/nolanmak/Agentflow/issues/15)                   | M4: Daily-use release | AF-02, AF-13, AF-14                                                  |
| AF-16 | [Validate full voice workflows, latency, and release readiness](https://github.com/nolanmak/Agentflow/issues/16)                    | M4: Daily-use release | AF-05, AF-06, AF-08, AF-09, AF-10, AF-11, AF-12, AF-13, AF-14, AF-15 |
| AF-19 | [Migrate to strict TypeScript](https://github.com/nolanmak/Agentflow/issues/19)                                                     | M0: Session proof     | None                                                                 |
| AF-20 | [Add configurable speech playback speed](https://github.com/nolanmak/Agentflow/issues/20)                                           | M3: Conversation      | AF-17                                                                |

## Execution rules

1. Write and run the failing test for each behavior before production implementation.
2. Close issues only after acceptance evidence or explicit owner validation exists; mocked success does not establish live-provider or microphone support.
3. Use [the issue template](../.github/ISSUE_TEMPLATE/feature.yml) for new work and [the testing strategy](TESTING.md) for implementation.
4. A missing speech key should not block deterministic implementation or direct-provider alternatives.

Local issue bodies: [docs/issues](issues/). Machine-readable mapping: [manifest.json](issues/manifest.json). The generator recreates the initial specification text and preserves GitHub URL/number mappings; it does not synchronize edits to GitHub.
