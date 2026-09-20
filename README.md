# Agentflow

Speak to native Codex and Claude Code sessions on your Mac. The local service provides speech input/output, a session dashboard, and terminal/MCP speech tools.

[Dashboard](http://127.0.0.1:4317) · [Private repository](https://github.com/nolanmak/Agentflow) · [Issues](https://github.com/nolanmak/Agentflow/issues) · [Validation and limitations](docs/VALIDATION.md)

## Run

Requires macOS, Node 22+, and installed/authenticated native `codex` and `claude` CLIs. Tested locally with Node 26.5.1.

```sh
npm ci
node src/cli.js service install
node src/cli.js open
```

On the original Mac, `~/.local/bin/agentflow` is already installed and login startup is enabled. The microphone remains off until explicitly started.

```sh
agentflow run codex             # native terminal shared with the dashboard
agentflow run claude
agentflow run codex --resume NATIVE_SESSION_UUID
agentflow speak --text "The tests passed."
printf 'The tests passed.\n' | agentflow speak
agentflow service status
agentflow service restart
agentflow service uninstall
```

`Ctrl+]` detaches an Agentflow terminal view and leaves its native process running. Service restart/stop terminates processes that service owns, so detach does not mean restarting the service is safe for an active turn.

## Same native conversation

Agentflow-managed sessions have one native CLI process with terminal and browser views. User transcripts go unchanged into that process; no separate inference model or voice persona is inserted. Native tools, settings, cwd, and approvals remain in the native CLI. Approve native permission/trust prompts in its terminal panel.

Already-running external **Codex** sessions accept voice through native `codex queue`; the existing terminal stays open. This was tested live. Raw screen mirroring is available for Agentflow-managed terminals; external sessions synchronize conversation history.

Already-running external **Claude** sessions do not yet have a verified equivalent user-input attachment. Claude's private peer inbox adds a peer envelope, so it is deliberately excluded from production voice input. It does not satisfy exact user-message parity. The existing process is never silently stopped or forked. Claude launched with `agentflow run claude` uses its actual native terminal input. Claude's local weekly usage limit prevented a successful model-response test.

The transcript preview shows the last 40 readable native messages with original timestamps. It is not fed back as a replacement for native context. Native compaction/context limits still apply.

## Speech providers

With a Deepgram key configured, Speech & settings provides 41 named Aura-2 English voices and a Preview voice button. Select a voice, preview it without saving, then Save preferences. Helena is the default for new configurations; saved preferences are retained. Voice catalogs for other providers are deferred.

Speech & settings selects STT and TTS independently: Deepgram, OpenAI, ElevenLabs, or 9Router. Keys are stored in macOS Keychain (`com.agentflow.speech`); the browser receives configured/not-configured status only. Keys may also be supplied through explicitly configured server environment variables. No keys belong in this repository.

Deepgram STT/TTS were tested live using the authorized local key. OpenAI, ElevenLabs, and 9Router pass mocked request/response tests; working live credentials/routes were not established. 9Router's inspected speech catalogs were empty. Agentflow does not start its Docker container automatically.

Hands-free browser mode records an utterance, transcribes it, sends it to the native agent, plays the reply, then listens again. It is half-duplex; use Interrupt to stop speech. Physical microphone/echo acceptance remains outstanding.

## Speak directly from an agent

The MCP server provides `speak`, `current_time`, and `session_history`. Tools are registered for both CLIs on the original Mac. For another installation, use absolute executable/file paths:

```sh
codex mcp add agentflow -- /absolute/path/to/node /absolute/path/to/Agentflow/src/cli.js mcp
claude mcp add --scope user agentflow -- /absolute/path/to/node /absolute/path/to/Agentflow/src/cli.js mcp
```

[Official Codex MCP configuration](https://developers.openai.com/codex/mcp). Refresh tools using the native client's supported flow when adding tools to an already-running session; Agentflow never closes it automatically.

Ask: **“Use Agentflow to read your answer aloud.”** The `speak` tool plays through the Mac's audio device even with the dashboard closed. No skill is required. Keep using your existing dictation for input. If the running agent has not loaded the MCP tool yet, ask it to run `agentflow speak` using its shell tool. [Issue #17](https://github.com/nolanmak/Agentflow/issues/17) now scopes this minimal CLI/tool path with objective tests; custom terminal microphone capture and automatic speech modes are deferred.

## Verification

```sh
npm test
npm run check
npm run test:e2e               # requires running service; mocked speech/agent API
node scripts/live-pipeline.js # opt-in paid Deepgram + disposable native Codex
npm run test:live             # opt-in real speech and native Codex queue checks
```

`npx playwright install chromium` installs the browser test runtime. Live checks use synthetic prompts and disposable sessions, not personal conversations. See [the plan](docs/PLAN.md), [architecture](docs/ARCHITECTURE.md), [TDD policy](docs/TESTING.md), and [backlog](docs/ISSUES.md).

TypeScript migration is tracked in [AF-19](https://github.com/nolanmak/Agentflow/issues/19). Public-release preparation is documented in [PRIVACY.md](docs/PRIVACY.md); the repository remains private while historical metadata is cleaned.
