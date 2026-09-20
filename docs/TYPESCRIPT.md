# TypeScript build and existing-install migration

Requires Node >=22.18; local and CI validation use 26.5.1. `npm ci` runs a small TypeScript install script using native Node type stripping to repair node-pty executable permissions on macOS. Production service/CLI/browser files are compiled JavaScript and need no TypeScript loader.

```sh
npm ci
npm run typecheck
npm run build
npm test
npx playwright install chromium
npm run test:e2e
```

The browser suite starts its own loopback server on port 4318 with ignored temporary state and mocked APIs. It does not require your running voice service or provider keys.

## Existing installs

Build before switching paths. Keep your current service alive during the build. Check `/api/jobs` and `/api/sessions` through the authenticated local API for active jobs/live managed terminals. Do not restart a service that owns an active native terminal: its process would terminate. External native sessions do not need restarting to use CLI speech.

After managed sessions are finished:

```sh
ln -sf "$PWD/dist/src/cli.js" "$HOME/.local/bin/agentflow"
node dist/src/cli.js service stop
node dist/src/cli.js service install
```

Stop/install reloads the launchd definition with the compiled path; a kickstart alone retains previously loaded arguments. Keychain entries and local settings/jobs/native histories are not moved or erased.

Update only Agentflow's MCP entries, leaving other tools intact. Replace example paths with absolute local paths:

```sh
codex mcp add agentflow -- /absolute/path/to/node /absolute/path/to/Agentflow/dist/src/cli.js mcp
claude mcp remove --scope user agentflow
claude mcp add --scope user agentflow -- /absolute/path/to/node /absolute/path/to/Agentflow/dist/src/cli.js mcp
```

Existing sessions can call `agentflow speak` through their shell tool immediately. MCP tool reloading follows the native client's behavior; do not close an active conversation just to gain speech.

## Contracts and validation

`public/contracts.ts` defines settings, session, job, agent-event, and terminal message types and runtime decoders. Native protocol parsing lives in `src/native-protocol.ts`. Unknown JSON is narrowed at these boundaries. The only generic protocol assertion connects a validated RPC method to its return type; the DOM element assertion maps fixed HTML IDs to their declared elements. There are no explicit `any`, `@ts-ignore`, or `@ts-nocheck` exceptions in application source.

Negative fixtures in `test/types/contracts.ts` ensure invalid backends, event payloads, statuses, and terminal input shapes do not compile. Runtime tests reject malformed job/event values and preserve exact text, IDs, and timestamps. Existing behavior tests run against emitted modules.
