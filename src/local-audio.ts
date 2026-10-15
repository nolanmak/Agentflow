import { spawn } from "node:child_process";

// In-memory conversion: no recordings or converter diagnostics are retained.
export async function normalizeLocalAudio(
  audio: Buffer,
  signal?: AbortSignal,
): Promise<Buffer | null> {
  signal?.throwIfAborted();
  const pcm = await new Promise<Buffer>((resolve, reject) => {
    const child = spawn(
      process.env.AGENTFLOW_FFMPEG || "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        "-protocol_whitelist",
        "pipe",
        "-i",
        "pipe:0",
        "-t",
        "91",
        "-vn",
        "-ar",
        "16000",
        "-ac",
        "1",
        "-f",
        "s16le",
        "pipe:1",
      ],
      { stdio: ["pipe", "pipe", "ignore"] },
    );
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(Error(message));
    };
    const abort = () => fail("Local transcription canceled");
    const timer = setTimeout(
      () => fail("Audio conversion timed out. Check ffmpeg and retry."),
      15000,
    );
    signal?.addEventListener("abort", abort, { once: true });
    child.on("error", () =>
      fail(
        "Local audio conversion requires ffmpeg on PATH (or AGENTFLOW_FFMPEG).",
      ),
    );
    child.stdin.on("error", () => {});
    child.stdout.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 90 * 32000)
        fail("Recording exceeds the 90-second local transcription limit");
      else chunks.push(chunk);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if (settled) return;
      settled = true;
      if (code || !size)
        reject(
          Error("Could not decode recording. Install ffmpeg and record again."),
        );
      else resolve(Buffer.concat(chunks));
    });
    child.stdin.end(audio);
    if (signal?.aborted) abort();
  });
  signal?.throwIfAborted();
  let energy = 0;
  for (let i = 0; i + 1 < pcm.length; i += 2)
    energy += (pcm.readInt16LE(i) / 32768) ** 2;
  if (Math.sqrt(energy / (pcm.length / 2)) < 0.001) return null;
  const header = Buffer.alloc(44);
  header.write("RIFF");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(16000, 24);
  header.writeUInt32LE(32000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
