# Agentflow

A localhost voice dashboard for your existing Claude Code and Codex sessions. Type in the terminal, select that session in Agentflow, talk, and hear the agent answer aloud.

[Private GitHub repository](https://github.com/nolanmak/Agentflow) · [Implementation issues](https://github.com/nolanmak/Agentflow/issues)

**Status: planning.** The documents and GitHub backlog describe the product to build; there is no running Agentflow application yet. Commands below are proposed interfaces, not installed commands.

## What we are building

- One searchable session menu for Claude Code and Codex, with project, title, activity, and ownership state.
- Speech-to-text → the actual agent session → text-to-speech. Agent context, tools, and identity stay with the agent.
- Independent, bring-your-own-key speech providers: OpenAI, Deepgram, ElevenLabs, and 9Router. Use one provider for listening and another for speaking; swap without losing the conversation.
- Voice-first conversation with optional transcript, push-to-talk, hands-free turn detection, interrupt, and explicit microphone state.
- A terminal command and agent-callable speech tool for reading text aloud, even without opening a voice conversation.
- A macOS login service that keeps the localhost dashboard available.

## Start here

- [Product and delivery plan](docs/PLAN.md)
- [Architecture and session continuity](docs/ARCHITECTURE.md)
- [Speech providers and BYOK](docs/PROVIDERS.md)
- [Test-driven development strategy](docs/TESTING.md)
- [Implementation backlog](docs/ISSUES.md)
- [Decisions, uncertainties, and source references](docs/DECISIONS.md)

## Intended commands

```sh
agentflow start                         # run the local service
agentflow open                          # open the dashboard
agentflow run codex                     # terminal session managed by Agentflow
agentflow run claude                    # terminal session managed by Agentflow
agentflow open --agent codex --session <id>
agentflow speak --text "The tests passed."
agentflow service install               # start at macOS login
agentflow service status
agentflow service uninstall
```

These commands are acceptance targets. See the backlog for implementation status. `service install` is opt-in and never opens the microphone at login.

## Development policy

Use red → green → refactor for each behavioral change. Every issue includes observable acceptance criteria and a focused test plan. Mock external APIs in ordinary tests; real credentials and real microphone tests are explicit opt-in checks. Never commit keys, local session histories, or recorded audio.
