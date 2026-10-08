# Security and privacy

Agentflow is an experimental local application. Keep it bound to loopback; it is not designed for public hosting or untrusted multiuser access. Native agent permissions remain authoritative.

Never put API keys, auth tokens, personal transcripts, recordings, home paths, or private machine addresses in issues, logs, screenshots, fixtures, or commits. Use synthetic examples. Provider keys belong in the local OS keychain or server environment.

Report sensitive vulnerabilities using [GitHub private vulnerability reporting](https://github.com/nolanmak/Agentflow/security/advisories/new), enabled for this repository. Do not open a public issue containing credentials or personal session data. If private reporting is unavailable, open a minimal issue requesting a private contact without including exploit details or sensitive data.

See [privacy preparation](docs/PRIVACY.md) and [known limitations](docs/VALIDATION.md). No formal support or security response SLA is currently offered.
