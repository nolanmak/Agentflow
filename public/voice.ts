export function sentences(text: string, flush = false) {
  const ready = [];
  let end = 0;
  for (const m of text.matchAll(/[^.!?\n]+[.!?](?=\s|$)|[^\n]+\n/g)) {
    if (m.index !== end && text.slice(end, m.index).trim()) break;
    ready.push(m[0].trim());
    end = m.index + m[0].length;
  }
  let rest = text.slice(end);
  if (flush && rest.trim()) {
    ready.push(rest.trim());
    rest = "";
  }
  return { ready, rest };
}
export class VoiceGate {
  spoke: boolean;
  last: number;
  first: number;
  frames: number;
  constructor() {
    this.spoke = false;
    this.last = 0;
    this.first = 0;
    this.frames = 0;
  }
  sample(rms: number, now: number) {
    if (!this.first) this.first = now;
    if (rms > 0.018) {
      this.frames++;
      if (this.frames >= 2) this.spoke = true;
      this.last = now;
    }
    return this.spoke && now - this.last > 900;
  }
}

// Preserve every character while respecting the speech API's UTF-16 text limit.
export function speechChunks(text: string): string[] {
  const chunks: string[] = [];
  while (text.length > 12000) {
    let end = 12000;
    const prefix = text.slice(0, end);
    const whitespace = [...prefix.matchAll(/\s/g)].at(-1);
    if (whitespace && whitespace.index > 0) end = whitespace.index + 1;
    else if (
      /[\uD800-\uDBFF]/.test(text[end - 1]) &&
      /[\uDC00-\uDFFF]/.test(text[end])
    )
      end--;
    chunks.push(text.slice(0, end));
    text = text.slice(end);
  }
  if (text) chunks.push(text);
  return chunks;
}
