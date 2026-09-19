# Agentflow contributor instructions

Read docs/PLAN.md, docs/ARCHITECTURE.md, docs/TESTING.md, and the assigned GitHub issue before implementation.

1. Start each behavior with a focused failing test. Run it and record the expected failure before changing production code. Implement the minimum passing behavior, then refactor while green.
2. Map tests to the issue's acceptance criteria. Test public behavior and failure boundaries; do not assert private implementation details merely to increase coverage.
3. Run related unit/contract tests on every change and relevant integration/E2E checks for session, audio, permission, or service changes. Never use real personal sessions as disposable fixtures.
4. Do not close an issue until its acceptance criteria and evidence are complete. Describe any unverified live-provider or microphone behavior honestly.
5. Preserve session identity. Do not call a new chat or copied transcript an attached existing session. Do not silently fork or permit concurrent writers.
6. Prefer supported Codex and Claude APIs. Keep format-dependent discovery behind versioned adapters. Never mutate their private history databases.
7. Keep speech provider keys on the local server/OS keychain. Do not return secrets in API responses, logs, fixtures, issue bodies, screenshots, or browser storage.
8. Bind the service to loopback. Preserve agent permission boundaries; do not globally enable bypass-permission flags to make integration tests pass.
9. Keep STT and TTS independently interchangeable. Do not couple speech provider selection to the agent's model provider.
10. No public deployment; Agentflow is a local application. Autostart is an explicit command and never starts microphone capture.
