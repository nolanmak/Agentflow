from pathlib import Path
import json
root=Path(__file__).resolve().parent
issues=[
('Prove native session continuity and choose supported transports','M0: Session proof',[],
'Prove how Agentflow can continue existing Codex and Claude Code sessions and support terminal/browser access before selecting the production transport.',
[
'For each supported CLI version, a disposable terminal session stores nonce A, a dashboard-equivalent client resumes and recalls A, and the terminal subsequently recalls nonce B from that client with the same native session ID.',
'Document discovery, saved-session resume, managed live attachment, and arbitrary external-process attachment separately; unsupported cases have explicit handoff instructions.',
'Choose and document a supported structured transport for each agent, or a justified tested PTY fallback. Record protocol/CLI versions and approval/cancellation behavior.',
'A simultaneous second writer is rejected or safely serialized; no silent fork, competing model turn, or personal-session mutation occurs.',
'Commit synthetic event fixtures, a runnable opt-in compatibility harness, and an architecture decision with passing evidence or explicit blockers. A blocked proof does not count as supported.'
],
[
'Write a failing round-trip identity/context integration test for each agent before the adapter spike.',
'Add tests for already-owned sessions, approval events, process exit, interruption, and unsupported versions.',
'Run live proof only against dedicated disposable native sessions; retain sanitized event shapes and IDs, never personal history.'
]),
('Create the local service, typed contracts, and deterministic test harness','M0: Session proof',[],
'Give the application a reproducible local foundation with fake agents/providers so development does not require paid requests or private sessions.',
[
'A fresh checkout installs from a committed lockfile and runs documented test, typecheck, build, and development commands on a pinned supported Node version.',
'The service binds only to loopback; unknown Host/Origin, missing mutation authentication/CSRF, and unauthorized WebSocket upgrades are rejected before any side effect.',
'Typed session, agent-event, STT, TTS, error, and settings contracts are shared without exposing secret-bearing server types to the browser.',
'A fake agent executable, fake speech HTTP server, fake key store, temporary application home, and deterministic clocks are available for integration tests.',
'CI runs deterministic validation without provider credentials, personal home access, or native agent execution; oversized/malformed payloads return clear bounded errors.'
],
[
'First write failing service health and boundary tests: valid loopback request, rejected foreign origin/host, unauthorized mutation and WebSocket, oversized payload.',
'Implement the smallest service and contract fixtures, then run a fresh-install CI check.',
'Test that no provider/agent mock is called when request validation fails.'
]),
('Discover and index Codex and Claude Code sessions without modifying history','M0: Session proof',['AF-01','AF-02'],
'List real existing sessions with enough metadata to select the intended project and conversation.',
[
'List both agents with native ID, title, project directory, recent activity, ownership/capability state, and agent label; IDs remain unique across agents.',
'Prefer supported list APIs; any file-based fallback is versioned, read-only, and bounded/incremental rather than rescanning all history on every UI refresh.',
'Search/filter and pagination return stable results with empty, missing-directory, permission-denied, malformed/truncated-file, and unknown-version cases handled.',
'Subagent/internal sessions are distinguishable and excluded from the default main-session list where metadata permits.',
'Imported metadata never causes history writes, arbitrary command execution, or exposure of full transcripts in ordinary logs.'
],
[
'Write failing index tests from synthetic fixtures for both agents, including duplicate titles and identical IDs across different agents.',
'Add incremental-update, incomplete JSON/event, rotated-file, access-denied, and pagination tests.',
'Assert source files stay byte-for-byte unchanged and indexing stays within a documented fixture-scale work budget.'
]),
('Coordinate session ownership, handoff, deduplication, and recovery','M1: Agent core',['AF-01','AF-02','AF-03'],
'Ensure terminal and dashboard input reaches the correct native session exactly once, with one writer and a recoverable handoff.',
[
'Atomic ownership acquisition allows one session writer; competing tabs/controllers receive a conflict with current owner and a safe release/handoff action.',
'Managed terminal/browser turns serialize under the documented policy; busy or unknown unmanaged sessions are never given a second writer.',
'Repeating an operation ID after retry/reconnect does not dispatch another turn; persisted state survives service restart.',
'Crash recovery distinguishes completed, safely unsent, and uncertain turns and never silently replays uncertain work.',
'Session switches and release cancel or resolve in-flight speech/agent operations; late events cannot appear in another session.',
'Leases, disconnects, and reconnect cursors recover without killing unrelated terminals or silently forking native history.'
],
[
'Write race tests with two clients acquiring the same session and submitting the same operation ID.',
'Use fake clocks/process crashes to test expired lease, browser disconnect, restart, and uncertain dispatch reconciliation.',
'Test session-switch isolation at STT, agent generation, and TTS completion boundaries.'
]),
('Implement the Codex adapter with same-session resume and approvals','M1: Agent core',['AF-01','AF-04'],
'Connect the dashboard to the installed Codex using the proven transport and preserve its actual conversation and permissions.',
[
'Resume by native session ID in the recorded working directory; two sequential dashboard turns retain context and return the same ID.',
'Normalize assistant text, completion, tool status, approval requests, and errors into the common event contract without speaking tool logs or private reasoning.',
'Interrupt and shutdown clean up only owned processes/streams; denied approval remains denied and blanket bypass flags are not enabled.',
'Missing executable, unsupported protocol, inaccessible cwd, malformed event, authentication failure, and native writer conflict produce actionable errors.',
'The adapter passes contract tests and an opt-in native terminal/dashboard/terminal round trip using a disposable session.'
],
[
'Write failing adapter contract tests using synthetic Codex events and an executable fake process.',
'Test split JSON frames/stream chunks, text ordering, exit-before-complete, approval allow-once/deny, and interrupt races.',
'Run the AF-01 compatibility harness after green unit/integration tests; record exact tested CLI version.'
]),
('Implement the Claude Code adapter with same-session resume and approvals','M1: Agent core',['AF-01','AF-04'],
'Continue Claude Code conversations through the proven SDK/CLI transport while maintaining native history and approval semantics.',
[
'Resume the selected native session without a fork flag, preserve cwd, and persist both user and assistant turns to the same native conversation.',
'Normalize streaming assistant text, tool status, permission requests, final result, cancellation, and errors; distinguish duplicate partial/final text.',
'Permission decisions stay explicit and per-request; the integration does not enable global bypass-permission mode.',
'Already-running/owned, missing CLI, expired login, invalid session, malformed output, interrupted turn, and unexpected child exit have tested recoverable outcomes.',
'Pass the shared agent conformance suite plus a disposable real Claude terminal/dashboard/terminal round trip on the recorded version.'
],
[
'Write failing transcript/identity and event-contract tests with synthetic Claude stream fixtures.',
'Exercise partial+final deduplication, result-reported errors on stdout, approval denial, cancellation, and process cleanup.',
'Run the opt-in native resume proof after mocked/integration checks; do not confuse API-only chat with Claude Code.'
]),
('Build independent STT/TTS configuration and secure BYOK settings','M2: Speech providers',['AF-02'],
'Let users bring, replace, and remove their own speech keys and select listening/speaking providers independently.',
[
'Settings allow separate STT provider/model and TTS provider/model/voice selections for OpenAI, Deepgram, ElevenLabs, and 9Router.',
'Provider secrets are stored in macOS Keychain with explicit environment-variable support for development; persistent app config contains references only.',
'Key create/replace/delete and configured-status APIs never return raw secrets; browser storage, bundle, logs, errors, and test artifacts contain no key material.',
'Provider changes are validated and applied at the next documented safe turn boundary without changing agent model, routing, or session ID.',
'Capability and connection-test results distinguish missing key, invalid key, unsupported model/voice, offline service, and empty catalog; a test request is deliberate.',
'Changing one provider does not reset the other, and canceling settings edits leaves the active configuration unchanged.'
],
[
'Write failing public-settings/redaction tests using sentinel fake secrets, including error and key replacement/deletion paths.',
'Test the keychain abstraction with a fake store and one opt-in disposable local keychain entry; never touch other applications\' secrets.',
'Write provider-selection independence and in-flight configuration-generation tests before wiring the UI.'
]),
('Add the OpenAI transcription and speech provider adapter','M2: Speech providers',['AF-07'],
'Use a user-supplied OpenAI API key for STT, TTS, or both through the common provider contracts.',
[
'STT submits supported audio and model/language options to the documented transcription endpoint and returns normalized text.',
'TTS submits model, voice, and text to the documented speech endpoint and returns playable, correctly labeled audio in order.',
'Both use server-side Bearer auth and reject missing keys, empty/oversized inputs, unsupported configuration, and malformed responses safely.',
'Cancellation, timeout, 401/403, 429, 5xx, and partial-stream failure map to normalized errors without exposing keys or silently retrying paid work.',
'Pass shared provider conformance tests; an opt-in live smoke test records selected model/voice and success or explicitly unverified status.'
],
[
'Write failing request-shape and response-normalization tests against a local fake HTTP endpoint first.',
'Add error/cancellation tests and assert auth is not forwarded across redirect origins.',
'Test OpenAI STT with a different provider\'s TTS and vice versa through the orchestrator contract.'
]),
('Add the Deepgram transcription and speech provider adapter','M2: Speech providers',['AF-07'],
'Use Deepgram for speech recognition and/or generated speech, independently of the agent and the other speech provider.',
[
'STT calls the documented Listen API with valid audio content type and selected model/language, normalizing the transcript response.',
'TTS calls the documented Speak API with selected voice/model and output format and returns correctly labeled playable audio.',
'API keys use server-side Token auth; capability validation prevents unsupported model/encoding combinations.',
'Handle empty transcript, malformed channel/results structure, unauthorized, rate limit, timeout, cancellation, and truncated audio through the shared error contract.',
'Pass shared provider tests and expose deliberate live connection/audio tests with honest verified/unverified results.'
],
[
'Write failing actual request/response contract tests with fake Listen/Speak endpoints.',
'Test nested transcript extraction, content types, cancellation, non-audio success payloads, and provider errors.',
'Run mixed-provider STT/TTS orchestrator tests; optional streaming capability must have its own ordering/reconnect tests before advertised.'
]),
('Add ElevenLabs transcription, voice selection, and speech adapter','M2: Speech providers',['AF-07'],
'Offer ElevenLabs voices for spoken replies and its transcription API as an independent input option.',
[
'STT uses the documented multipart speech-to-text endpoint with selected model and audio, returning normalized text.',
'TTS uses the documented voice-ID endpoint with selected model/output format; required voice IDs are validated before a request.',
'Voice selection supports entitled account voices or an explicit voice ID; denied or unavailable catalogs do not masquerade as an empty valid configuration.',
'Use server-side xi-api-key auth and handle invalid key/voice/model, quota/rate limit, timeout, cancellation, malformed responses, and interrupted audio.',
'Pass the shared STT/TTS contract suite and a mixed configuration with another input/output provider; live results are recorded only when actually run.'
],
[
'Write failing multipart, voice-path encoding, auth-header, and binary-audio contract tests.',
'Add voice-list denial, invalid ID, missing model, 429, timeout, cancellation, and chunk-order cases.',
'Test swapping ElevenLabs output to OpenAI/Deepgram between turns without changing the native agent session.'
]),
('Integrate 9Router speech discovery and OpenAI-compatible audio routes','M2: Speech providers',['AF-07'],
'Reuse the existing 9Router service as an optional speech provider without requiring it for direct-provider operation.',
[
'Configure router base URL and optional BYOK credential through settings; validate protocol and send auth only to the configured origin.',
'Discover STT/TTS models from the router capability endpoints when available, support documented explicit model/voice entry, and distinguish empty/offline/unauthorized states.',
'Route transcription and synthesis through documented /v1/audio endpoints using router model IDs rather than assuming direct-provider naming.',
'The dashboard remains usable with direct providers when 9Router is stopped, empty, or returns errors; no automatic provider/agent routing changes occur.',
'No credentials are automatically scraped from router files/databases, no router container lifecycle is changed implicitly, and failed speech requests do not redispatch the agent turn.',
'Pass fixture contract tests and document the installed router version and opt-in live results; an empty catalog is reported as not configured.'
],
[
'Write failing discovery tests for nonempty, empty, missing endpoint, unauthorized, and offline responses.',
'Test multipart STT, raw audio TTS, auth optionality, base-path normalization, canceled requests, and redirect credential isolation.',
'Add mixed direct-provider/router tests and assert agent configuration stays unchanged.'
]),
('Implement microphone capture, hands-free turns, ordered speech, and interruption','M3: Conversation',['AF-04','AF-07','AF-08'],
'Provide the complete speak → native agent → hear response loop with reliable cancellation and visible state.',
[
'Explicit start requests microphone permission and enters listening; stop/end/error cleanup releases media tracks and prevents hidden recording.',
'Push-to-talk and hands-free end-of-utterance detection submit exactly one nonempty transcript per utterance with bounded duration/size.',
'Voice states cover listening, transcribing, thinking, speaking, permission-required, interrupted, disconnected, and recoverable error.',
'Agent reply sentences are synthesized and played in order; code/tool output is handled deliberately rather than read verbatim as noise.',
'Interrupt stops current/queued audio within 250 ms in the supported local device test and invalidates late results; agent interruption is separately acknowledged.',
'Session/provider changes cannot deliver stale speech or prompts to the wrong session; STT/TTS errors retain retryable input/reply without rerunning an already-sent agent turn.',
'Hands-free mode resumes listening after playback and handles echo without looping on its own speech; real-device results with headphones and speakers are recorded.'
],
[
'Write failing state-machine tests with fake clocks and media streams before capture/playback implementation.',
'Test silence, permission rejection, stop during each phase, rapid interrupts, out-of-order TTS, and stale generation IDs.',
'Use deterministic browser audio fixtures for E2E, then perform a real microphone/playback checklist; mocks do not establish echo quality.'
]),
('Build the session dashboard, provider settings, and voice-first controls','M3: Conversation',['AF-03','AF-05','AF-06','AF-07','AF-12'],
'Make Agentflow a useful localhost work surface for selecting a session and holding spoken conversations.',
[
'The first screen shows a searchable/filterable session list and selected-session voice controls with actual title, agent, project, activity, and ownership status.',
'Available, busy, unsupported, missing-agent, empty-list, disconnected, and legacy-handoff states are explicit; no fabricated sessions or fake connected indicators.',
'Start/stop, push-to-talk/hands-free, interrupt, volume/output state, optional transcript, and return-to-terminal actions use the real service.',
'Settings support independent provider/model/voice choices and BYOK create/replace/delete/tests without secret readback.',
'Approval requests show the action and explicit allow-once/deny controls; transcript text is escaped and cannot execute markup.',
'Keyboard navigation, focus handling, labels, reduced motion, readable responsive layout, reconnect, and session-switch cancellation are covered by browser tests.'
],
[
'Write failing browser journeys for session selection, start/stop, settings swaps, conflict/handoff, approval denial, and reconnect before each UI slice.',
'Use fake providers/agents for deterministic audio completion and error states; assert displayed session matches dispatched native ID.',
'Test hidden transcript, narrow viewport, keyboard-only controls, and malicious transcript strings.'
]),
('Add the managed terminal launcher and agent-callable speak tool','M3: Conversation',['AF-01','AF-04','AF-05','AF-06','AF-12'],
'Let terminal users move into dashboard voice and let either agent explicitly read text aloud through Agentflow.',
[
'agentflow run codex|claude uses the AF-01 proven shared-session transport so terminal and dashboard refer to one native identity and serialize turns.',
'agentflow open --agent ... --session ... selects the exact session; invalid/unknown IDs do not silently open a different conversation.',
'agentflow speak accepts explicit text or stdin without shell interpolation, uses configured TTS, and supports cancel/error status.',
'The MCP speak tool exposes the same bounded behavior with a clear schema; both Codex and Claude Code installation examples are documented.',
'When a dashboard audio sink exists, speech reaches it; with the dashboard closed, explicit speak can use local macOS playback and reports absence/failure of an output sink.',
'Launcher exit, terminal resize/signals where relevant, stale owner, detached browser, and speech cancellation clean up only owned resources; no global agent settings are overwritten.'
],
[
'Write failing CLI argument/stdin, exact-session-link, local authentication, and output-sink tests.',
'Add MCP schema/request conformance tests plus identical outcomes for CLI and MCP speak.',
'Run a disposable managed terminal → browser voice → terminal round trip for both agents and test controller contention.'
]),
('Package macOS startup, service management, and login autostart','M4: Daily-use release',['AF-02','AF-13','AF-14'],
'Keep Agentflow available at localhost after login through an explicit reliable install command.',
[
'Provide documented start/stop/status and service install/uninstall commands; install creates a per-user launchd entry using absolute executable/project paths.',
'Install/start are idempotent; exactly one listener is created, and occupied ports yield an actionable error without killing another process.',
'The service launches in a minimal noninteractive environment without depending on shell/nvm startup scripts and supports paths containing spaces.',
'Login/start never opens the microphone, submits an agent turn, opens paid infrastructure, or exposes the listener beyond loopback.',
'Uninstall removes only Agentflow service artifacts and preserves native agent sessions; credential/config deletion is a separate deliberate action.',
'Log retention is bounded/redacted and status explains missing CLI, router offline, absent credentials, crash restart, and service not installed.'
],
[
'Write failing plist-generation, command idempotency, ownership-aware cleanup, and minimal-PATH integration tests.',
'Use a fake launchctl boundary in CI; run a disposable live launchd install/status/restart/uninstall check on macOS.',
'Record an actual login/reboot acceptance check or explicitly leave that criterion unverified; do not infer it from plist syntax alone.'
]),
('Validate full voice workflows, latency, and release readiness','M4: Daily-use release',['AF-05','AF-06','AF-08','AF-09','AF-10','AF-11','AF-12','AF-13','AF-14','AF-15'],
'Prove the requested daily-use workflow across agents and speech providers and publish accurate local setup instructions.',
[
'Deterministic CI covers both agents and every speech adapter, mixed STT/TTS configurations, session handoff, interruption, reconnect, and failure recovery.',
'Real disposable Codex and Claude sessions pass terminal nonce A → voice nonce B → terminal recall with unchanged native IDs.',
'A human-verified microphone/audio run covers hands-free turns, headphones/speakers, interrupt, device denial, provider switching, and terminal return.',
'OpenAI, Deepgram, ElevenLabs, and 9Router live checks have per-provider results; missing credentials/empty routes are explicitly unverified and not counted as passes.',
'Record capture-to-transcript, transcript-to-agent-text, text-to-first-audio, and interrupt-to-silence timings with environment/provider context, separating local target failures from cloud variability.',
'Run local-origin/credential leakage tests, startup/service checks, and browser accessibility checks; no unresolved session corruption or secret exposure defects remain.',
'README documents actual installed commands, BYOK setup, safe legacy handoff, managed-session support matrix, troubleshooting, autostart removal, and honest known limitations.'
],
[
'Write full-user-journey failing E2E tests before implementing missing integration behavior; use deterministic fixture audio and fake endpoints in CI.',
'Add regression tests for defects found during real-device acceptance before fixing them.',
'Collect a release checklist with links to passing automation and separate live/manual evidence; leave criteria open when required evidence is unavailable.'
])
]
manifest=[]
prior={x["code"]: x for x in json.loads((root/"manifest.json").read_text())} if (root/"manifest.json").exists() else {}
for i,(title,milestone,deps,outcome,criteria,tests) in enumerate(issues,1):
 code=f'AF-{i:02d}'
 text=f'# {code}: {title}\n\n## Outcome\n\n{outcome}\n\n## Dependencies\n\n'+(', '.join(deps) if deps else 'None')+f'\n\n## Milestone\n\n{milestone}\n\n## Acceptance criteria\n\n'+'\n'.join('- [ ] '+x for x in criteria)+'\n\n## Test-first implementation\n\n'+'\n'.join(f'{j}. {x}' for j,x in enumerate(tests,1))+'\n\n## Completion evidence\n\n- [ ] Record the initial failing test and why it failed.\n- [ ] Record focused passing tests and relevant integration/browser checks.\n- [ ] Refactor while green and run affected regression suites.\n- [ ] Map every acceptance criterion to a test or explicit manual evidence.\n- [ ] Update documentation and identify any unverified live behavior.\n\n## References\n\nSee [plan](../PLAN.md), [architecture](../ARCHITECTURE.md), [providers](../PROVIDERS.md), and [TDD strategy](../TESTING.md).\n'
 filename=f'{code.lower()}.md';(root/filename).write_text(text)
 item={'code':code,'title':f'{code}: {title}','milestone':milestone,'dependencies':deps,'body_file':filename}
 for key in ['url','number']:
  if key in prior.get(code,{}):item[key]=prior[code][key]
 manifest.append(item)
(root/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(f'Generated {len(manifest)} issue specifications')
