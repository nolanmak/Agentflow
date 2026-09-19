# Speech providers and bring-your-own-key configuration

Input and output are independent choices. A user may select Deepgram STT with ElevenLabs TTS, OpenAI for both, or 9Router for either. Speech API authentication is separate from Claude Code/Codex login and from the agent's language-model routing.

## Provider matrix

| Provider | Speech-to-text | Text-to-speech | Authentication | User settings |
| --- | --- | --- | --- | --- |
| OpenAI | Audio transcription endpoint | Audio speech endpoint | Bearer API key | STT model, TTS model, voice, language/speed where supported |
| Deepgram | Listen API | Speak API | Token API key | STT model/language, TTS model/voice, output encoding |
| ElevenLabs | Speech-to-text API | Text-to-speech API | `xi-api-key` | STT model, TTS model, voice ID, output format |
| 9Router | `/v1/audio/transcriptions` | `/v1/audio/speech` | Optional Bearer key according to router config | Base URL, discovered models, provider-specific voice options |

Examples to validate during implementation: OpenAI `gpt-4o-mini-transcribe`/`gpt-4o-mini-tts`, Deepgram Nova/Aura model families, ElevenLabs Scribe/Flash model families. Availability, version, voices, and account access are runtime/provider concerns; do not equate a documented model with an enabled account entitlement. Use capability discovery or explicit model fields rather than burying current model IDs in business logic.

## Contract

```ts
interface Transcriber {
  capabilities: { streaming: boolean; languages?: string[] };
  transcribe(input: {
    audio: Uint8Array;
    mimeType: string;
    language?: string;
    model: string;
    signal: AbortSignal;
  }): Promise<{ text: string; language?: string }>;
}
interface Synthesizer {
  capabilities: { streaming: boolean; voices: boolean };
  synthesize(input: {
    text: string;
    model: string;
    voice?: string;
    signal: AbortSignal;
  }): AsyncIterable<{ audio: Uint8Array; mimeType: string }>;
}
```

An adapter translates these contracts to provider-specific transport and payloads. Capability metadata prevents unsupported combinations from reaching a paid request. Ordinary tests inject a fake HTTP/WebSocket transport; production adapters do not depend on test mocks.

## BYOK user flow

1. Choose provider separately under Listening and Speaking.
2. Add a key using a password field. Send it only to the loopback server; store it in macOS Keychain. Clear the field after submission.
3. Show `Configured`, `Not configured`, or `Check failed`. Never return the original key to the browser, including masked tails unless explicitly needed.
4. Select model and voice. For dynamic catalogs, distinguish offline, empty catalog, unauthorized, and unsupported discovery. Provide manual model/voice fields where the provider supports them.
5. Test input with a deliberate short recording and test output with a short fixed phrase. These are real provider requests; the UI identifies that a provider may charge.
6. Save. Snapshot config for an in-flight turn and apply changes on the next turn. Session identity remains unchanged.
7. Replace or delete a key without editing project files. Deletion disables new requests using that key. Choose/document whether an in-flight request is canceled.

Configuration persists nonsecret settings and a key reference. No API keys in localStorage/sessionStorage, URLs, logs, crash reports, test snapshots, or version control. Suggested environment variable overrides for headless development: `OPENAI_API_KEY`, `DEEPGRAM_API_KEY`, `ELEVENLABS_API_KEY`, `NINEROUTER_KEY`, and `NINEROUTER_URL`. Explicit saved configuration takes precedence over environment defaults; status reports only the credential source, never the value.

## Failure and swap behavior

- Standard errors: `not_configured`, `unauthorized`, `rate_limited`, `invalid_model`, `invalid_voice`, `unsupported_format`, `timeout`, `canceled`, `provider_unavailable`, `malformed_response`.
- Normalize actionable messages without leaking full provider error payloads or keys.
- Validate audio MIME type and size, text length, empty input, required voice ID, and protocol before sending.
- Do not automatically resend agent turns following a speech failure. A TTS retry replays the existing agent text; an STT retry reuses the unsent utterance only with a deliberate action.
- No silent fallback to another paid provider. Optional configured fallback must explicitly name the provider and apply only before any output is played, to prevent duplicate speech.
- Do not buffer unbounded audio. Abort requests and release streams when the user ends/intercepts a call.
- Browser speech synthesis may become an explicitly labeled local fallback; it does not count as verification of a requested provider API.

## 9Router integration boundary

Reuse the user's existing router URL and key through a normal BYOK configuration; do not silently extract credentials from a router database in the shipped product. Query `/v1/models/stt` and `/v1/models/tts` when supported. An empty catalog is an actionable setup state, not permission to pretend the route works.

The installed router was authenticated successfully during local discovery but returned empty speech catalogs. Agentflow must still function with direct providers while the router is offline or unconfigured. Do not modify the existing agents' model-routing settings as a side effect of speech configuration.

## Primary sources

Checked 2026-09-19. Re-check endpoint/model details in each adapter issue before implementation.

- [OpenAI transcription](https://developers.openai.com/api/docs/guides/speech-to-text)
- [OpenAI speech generation](https://developers.openai.com/api/docs/guides/text-to-speech)
- [Deepgram prerecorded transcription](https://developers.deepgram.com/reference/speech-to-text/listen-pre-recorded)
- [Deepgram speech generation](https://developers.deepgram.com/reference/text-to-speech/speak-request)
- [ElevenLabs transcription](https://elevenlabs.io/docs/api-reference/speech-to-text/convert)
- [ElevenLabs speech generation](https://elevenlabs.io/docs/api-reference/text-to-speech/convert)
- [9Router STT contract](https://github.com/decolua/9router/blob/master/skills/9router-stt/SKILL.md)
- [9Router TTS contract](https://github.com/decolua/9router/blob/master/skills/9router-tts/SKILL.md)
