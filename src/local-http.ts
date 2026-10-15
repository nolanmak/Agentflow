import { request, Agent } from "node:http";
import { Readable } from "node:stream";
import type { Fetcher } from "./speech.js";
// A dedicated agent deliberately ignores the global fetch dispatcher and proxy env.
const direct = new Agent({ proxyEnv: {} });
export const localFetch: Fetcher = async (url, options) => {
  const encoded = new Request(url, options);
  const body = Buffer.from(await encoded.arrayBuffer());
  options.signal?.throwIfAborted();
  return new Promise<Response>((resolve, reject) => {
    const req = request(
      url,
      {
        method: "POST",
        agent: direct,
        headers: Object.fromEntries(encoded.headers),
        signal: options.signal ?? undefined,
      },
      (res) => {
        const headers = new Headers();
        for (const [key, value] of Object.entries(res.headers))
          if (value !== undefined)
            headers.set(key, Array.isArray(value) ? value.join(", ") : value);
        if ([204, 205, 304].includes(res.statusCode || 0)) res.resume();
        resolve(
          new Response(
            [204, 205, 304].includes(res.statusCode || 0)
              ? null
              : (Readable.toWeb(res) as ReadableStream<Uint8Array>),
            {
              status: res.statusCode || 502,
              headers,
            },
          ),
        );
      },
    );
    req.on("error", reject);
    req.end(body);
  });
};
