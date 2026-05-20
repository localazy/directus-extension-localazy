import { describe, it, expect } from 'vitest';
import { sha256 } from './sha256';

function hex(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 1) {
    s += bytes[i]!.toString(16).padStart(2, '0');
  }
  return s;
}

function bytes(input: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(input);
}

describe('sha256 (pure-JS fallback)', () => {
  // FIPS 180-4 / NIST CAVS known-answer vectors.
  it('hashes the empty string', () => {
    expect(hex(sha256(new Uint8Array(0)))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('hashes "abc"', () => {
    expect(hex(sha256(bytes('abc')))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('hashes the 448-bit ASCII vector', () => {
    expect(hex(sha256(bytes('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')))).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  it('hashes the canonical JSON payloads used by computeItemHash', () => {
    // SHA-256("{}") — pinned so we can detect any unintended drift between this
    // implementation and Web Crypto.
    expect(hex(sha256(bytes('{}')))).toBe('44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a');
  });

  it('matches crypto.subtle.digest output byte-for-byte (when available)', async () => {
    if (typeof crypto === 'undefined' || !crypto.subtle) return;
    const inputs = ['', 'abc', '{}', '{"a":1,"b":[1,2,3]}', 'a'.repeat(1000)];
    for (const input of inputs) {
      const buf = bytes(input);
      const native = new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
      expect(hex(sha256(buf))).toBe(hex(native));
    }
  });
});
