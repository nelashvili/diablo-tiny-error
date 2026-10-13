/**
 * JSON (de)serialization that survives Uint8Array (e.g. future compressed maps) plus a small
 * stable checksum.
 */

const U8_TAG = '__u8';

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    const n = (a << 16) | (b << 8) | c;
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!;
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63]! : '=';
    out += i + 2 < bytes.length ? B64[n & 63]! : '=';
  }
  return out;
}

export function base64ToBytes(s: string): Uint8Array {
  const clean = s.replace(/=+$/, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    let n = 0;
    let cnt = 0;
    for (let j = 0; j < 4 && i + j < clean.length; j++) {
      const v = B64.indexOf(clean[i + j]!);
      if (v < 0) throw new Error('invalid base64');
      n = (n << 6) | v;
      cnt++;
    }
    n <<= 6 * (4 - cnt);
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}

/** Serialize any save-shaped value to JSON. Uint8Array becomes `{__u8: base64}`. */
export function stringifySave(value: unknown): string {
  return JSON.stringify(value, function (this: unknown, key: string, v: unknown) {
    // Read the holder's raw value: Node Buffers/typed arrays may already be transformed in `v`.
    const raw = (this as Record<string, unknown>)[key];
    if (raw instanceof Uint8Array) return { [U8_TAG]: bytesToBase64(raw) };
    return v;
  });
}

/** Parse JSON produced by `stringifySave`. Throws SyntaxError on invalid JSON. */
export function parseSave(json: string): unknown {
  return JSON.parse(json, (_k, v: unknown) => {
    if (v && typeof v === 'object' && typeof (v as Record<string, unknown>)[U8_TAG] === 'string') {
      return base64ToBytes((v as Record<string, string>)[U8_TAG]!);
    }
    return v;
  });
}

/** FNV-1a 32-bit hash of a string, hex encoded. Detects accidental corruption (not tampering). */
export function checksum(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
