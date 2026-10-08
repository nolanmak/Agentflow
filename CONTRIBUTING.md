# Contributing to Agentflow

Thanks for helping improve Agentflow. Bug reports, documentation fixes, and
focused pull requests are welcome. For larger changes, start with a GitHub issue
that describes the expected behavior and measurable acceptance criteria.

## Set up and verify

Follow the source installation steps in [README.md](README.md), then run:

```sh
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
```

The deterministic suites use fake providers and disposable sessions; no provider
key is required. Paid live checks are opt-in and must never use personal sessions
as test fixtures.

## Development workflow

Read [AGENTS.md](AGENTS.md), the [plan](docs/PLAN.md),
[architecture](docs/ARCHITECTURE.md), and [testing strategy](docs/TESTING.md).
For behavior changes, reproduce the missing behavior with a failing test, implement
the smallest fix, then run the relevant regression checks. Documentation-only
changes need review and link/command validation, not artificial unit tests.

Keep session identity and native permission boundaries intact. Bind the service
to loopback, keep provider keys on the server/OS keychain, and preserve independent
speech-input and speech-output provider settings. Describe unverified live behavior
honestly.

In your pull request, explain the change, link its issue when applicable, and list
checks performed and any remaining limits. Contributions are provided under this
repository's [MIT License](LICENSE).

## Privacy and security

Never commit credentials, personal transcripts, recorded audio, private paths, or
local settings. Use synthetic fixtures and review screenshots before attaching
them. Follow [SECURITY.md](SECURITY.md) for sensitive reports and
[the privacy guide](docs/PRIVACY.md) for publication checks.
