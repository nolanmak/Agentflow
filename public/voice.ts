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
