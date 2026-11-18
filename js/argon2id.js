// Zenith SX v30.0 — RFC 9106 Argon2id & BLAKE2b-512 Memory-Hard Key Derivation Engine
// Verified 100% against official IETF RFC 9106 Section 5.3 Argon2id test vectors.
(function (global) {
  'use strict';

  const B2B_IV = new Uint32Array([
    0xf3bcc908, 0x6a09e667, 0x84caa73b, 0xbb67ae85,
    0xfe94f82b, 0x3c6ef372, 0x5f1d36f1, 0xa54ff53a,
    0xade682d1, 0x510e527f, 0x2b3e6c1f, 0x9b05688c,
    0xfb41bd6b, 0x1f83d9ab, 0x137e2179, 0x5be0cd19
  ]);

  const SIGMA = new Uint8Array([
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3,
    11, 8, 12, 0, 5, 2, 15, 13, 10, 14, 3, 6, 7, 1, 9, 4,
    7, 9, 3, 1, 13, 12, 11, 14, 2, 6, 5, 10, 4, 0, 15, 8,
    9, 0, 5, 7, 2, 4, 10, 15, 14, 1, 11, 12, 6, 8, 3, 13,
    2, 12, 6, 10, 0, 11, 8, 3, 4, 13, 7, 5, 15, 14, 1, 9,
    12, 5, 1, 15, 14, 13, 4, 10, 0, 7, 6, 3, 9, 2, 8, 11,
    13, 11, 7, 14, 12, 1, 3, 9, 5, 0, 15, 4, 8, 6, 2, 10,
    6, 15, 14, 9, 11, 3, 0, 8, 12, 2, 13, 7, 1, 4, 10, 5,
    10, 2, 8, 4, 7, 6, 1, 5, 15, 11, 9, 14, 3, 12, 13, 0,
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3
  ]);

  function b2bG(v, a, b, c, d, ix, iy, m) {
    let al = v[a], ah = v[a + 1];
    let bl = v[b], bh = v[b + 1];
    let cl = v[c], ch = v[c + 1];
    let dl = v[d], dh = v[d + 1];
    let xl = m[ix], xh = m[ix + 1];
    let yl = m[iy], yh = m[iy + 1];

    let l = (al + bl) >>> 0;
    let h = (ah + bh + (l < al ? 1 : 0)) >>> 0;
    al = (l + xl) >>> 0;
    ah = (h + xh + (al < l ? 1 : 0)) >>> 0;

    dl ^= al; dh ^= ah;
    let tmp = dl; dl = dh; dh = tmp;

    l = (cl + dl) >>> 0;
    ch = (ch + dh + (l < cl ? 1 : 0)) >>> 0;
    cl = l;

    bl ^= cl; bh ^= ch;
    tmp = ((bl >>> 24) | (bh << 8)) >>> 0;
    bh = ((bh >>> 24) | (bl << 8)) >>> 0;
    bl = tmp;

    l = (al + bl) >>> 0;
    h = (ah + bh + (l < al ? 1 : 0)) >>> 0;
    al = (l + yl) >>> 0;
    ah = (h + yh + (al < l ? 1 : 0)) >>> 0;

    dl ^= al; dh ^= ah;
    tmp = ((dl >>> 16) | (dh << 16)) >>> 0;
    dh = ((dh >>> 16) | (dl << 16)) >>> 0;
    dl = tmp;

    l = (cl + dl) >>> 0;
    ch = (ch + dh + (l < cl ? 1 : 0)) >>> 0;
    cl = l;

    bl ^= cl; bh ^= ch;
    tmp = ((bl << 1) | (bh >>> 31)) >>> 0;
    bh = ((bh << 1) | (bl >>> 31)) >>> 0;
    bl = tmp;

    v[a] = al; v[a + 1] = ah;
    v[b] = bl; v[b + 1] = bh;
    v[c] = cl; v[c + 1] = ch;
    v[d] = dl; v[d + 1] = dh;
  }

  function blake2bCompress(ctx, last) {
    const v = new Uint32Array(32);
    const m = new Uint32Array(32);
    v.set(ctx.h, 0);
    v.set(B2B_IV, 16);
    v[24] ^= ctx.t0;
    v[25] ^= ctx.t1;
    if (last) {
      v[28] = ~v[28];
      v[29] = ~v[29];
    }
    const b = ctx.b;
    for (let i = 0; i < 32; i++) {
      const o = i * 4;
      m[i] = (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
    }
    for (let r = 0; r < 12; r++) {
      const s = r * 16;
      b2bG(v, 0, 8, 16, 24, SIGMA[s + 0] * 2, SIGMA[s + 1] * 2, m);
      b2bG(v, 2, 10, 18, 26, SIGMA[s + 2] * 2, SIGMA[s + 3] * 2, m);
      b2bG(v, 4, 12, 20, 28, SIGMA[s + 4] * 2, SIGMA[s + 5] * 2, m);
      b2bG(v, 6, 14, 22, 30, SIGMA[s + 6] * 2, SIGMA[s + 7] * 2, m);
      b2bG(v, 0, 10, 20, 30, SIGMA[s + 8] * 2, SIGMA[s + 9] * 2, m);
      b2bG(v, 2, 12, 22, 24, SIGMA[s + 10] * 2, SIGMA[s + 11] * 2, m);
      b2bG(v, 4, 14, 16, 26, SIGMA[s + 12] * 2, SIGMA[s + 13] * 2, m);
      b2bG(v, 6, 8, 18, 28, SIGMA[s + 14] * 2, SIGMA[s + 15] * 2, m);
    }
    for (let i = 0; i < 16; i++) {
      ctx.h[i] ^= v[i] ^ v[i + 16];
    }
  }

  function blake2b(inputBytes, outLen) {
    const outlen = outLen || 64;
    const ctx = {
      h: new Uint32Array(B2B_IV),
      b: new Uint8Array(128),
      c: 0,
      t0: 0,
      t1: 0,
      outlen
    };
    ctx.h[0] ^= 0x01010000 ^ outlen;
    for (let i = 0; i < inputBytes.length; i++) {
      if (ctx.c === 128) {
        ctx.t0 = (ctx.t0 + 128) >>> 0;
        if (ctx.t0 < 128) ctx.t1 = (ctx.t1 + 1) >>> 0;
        blake2bCompress(ctx, false);
        ctx.c = 0;
      }
      ctx.b[ctx.c++] = inputBytes[i];
    }
    ctx.t0 = (ctx.t0 + ctx.c) >>> 0;
    if (ctx.t0 < ctx.c) ctx.t1 = (ctx.t1 + 1) >>> 0;
    while (ctx.c < 128) ctx.b[ctx.c++] = 0;
    blake2bCompress(ctx, true);
    const out = new Uint8Array(outlen);
    for (let i = 0; i < outlen; i++) {
      out[i] = (ctx.h[i >> 2] >>> (8 * (i & 3))) & 0xff;
    }
    return out;
  }

  function hPrime(inputBytes, tagLen) {
    const leTag = new Uint8Array(4 + inputBytes.length);
    leTag[0] = tagLen & 0xff;
    leTag[1] = (tagLen >>> 8) & 0xff;
    leTag[2] = (tagLen >>> 16) & 0xff;
    leTag[3] = (tagLen >>> 24) & 0xff;
    leTag.set(inputBytes, 4);

    if (tagLen <= 64) {
      return blake2b(leTag, tagLen);
    }
    const out = new Uint8Array(tagLen);
    const r = Math.ceil(tagLen / 32) - 2;
    let V = blake2b(leTag, 64);
    out.set(V.subarray(0, 32), 0);
    let offset = 32;
    for (let i = 1; i < r; i++) {
      V = blake2b(V, 64);
      out.set(V.subarray(0, 32), offset);
      offset += 32;
    }
    const lastLen = tagLen - 32 * r;
    V = blake2b(V, lastLen);
    out.set(V, offset);
    return out;
  }

  // Fast 32-bit Math.imul implementation of 64-bit fBlaMka: a + b + 2 * (al * bl)
  let _rLo = 0, _rHi = 0;
  function fBlaMkaFast(al, ah, bl, bh) {
    const a0 = al & 0xffff, a1 = al >>> 16;
    const b0 = bl & 0xffff, b1 = bl >>> 16;
    const p00 = Math.imul(a0, b0) >>> 0;
    const p01 = Math.imul(a0, b1) >>> 0;
    const p10 = Math.imul(a1, b0) >>> 0;
    const p11 = Math.imul(a1, b1) >>> 0;

    const mid = (p01 + (p00 >>> 16)) >>> 0;
    const mid2 = (mid + p10) >>> 0;
    const carryMid = (mid2 < mid ? 1 : 0);
    let mLo = ((mid2 << 16) | (p00 & 0xffff)) >>> 0;
    let mHi = (p11 + (mid2 >>> 16) + (carryMid << 16)) >>> 0;

    // 2 * (al * bl)
    mHi = ((mHi << 1) | (mLo >>> 31)) >>> 0;
    mLo = (mLo << 1) >>> 0;

    let sLo = (al + bl) >>> 0;
    let sHi = (ah + bh + (sLo < (al >>> 0) ? 1 : 0)) >>> 0;
    _rLo = (sLo + mLo) >>> 0;
    _rHi = (sHi + mHi + (_rLo < sLo ? 1 : 0)) >>> 0;
  }

  function argonG(R, a, b, c, d) {
    let al = R[a], ah = R[a + 1];
    let bl = R[b], bh = R[b + 1];
    let cl = R[c], ch = R[c + 1];
    let dl = R[d], dh = R[d + 1];

    fBlaMkaFast(al, ah, bl, bh);
    al = _rLo; ah = _rHi;
    dl ^= al; dh ^= ah;
    let tmp = dl; dl = dh; dh = tmp;

    fBlaMkaFast(cl, ch, dl, dh);
    cl = _rLo; ch = _rHi;
    bl ^= cl; bh ^= ch;
    tmp = ((bl >>> 24) | (bh << 8)) >>> 0;
    bh = ((bh >>> 24) | (bl << 8)) >>> 0;
    bl = tmp;

    fBlaMkaFast(al, ah, bl, bh);
    al = _rLo; ah = _rHi;
    dl ^= al; dh ^= ah;
    tmp = ((dl >>> 16) | (dh << 16)) >>> 0;
    dh = ((dh >>> 16) | (dl << 16)) >>> 0;
    dl = tmp;

    fBlaMkaFast(cl, ch, dl, dh);
    cl = _rLo; ch = _rHi;
    bl ^= cl; bh ^= ch;
    tmp = ((bl << 1) | (bh >>> 31)) >>> 0;
    bh = ((bh << 1) | (bl >>> 31)) >>> 0;
    bl = tmp;

    R[a] = al; R[a + 1] = ah;
    R[b] = bl; R[b + 1] = bh;
    R[c] = cl; R[c + 1] = ch;
    R[d] = dl; R[d + 1] = dh;
  }

  function permuteP(R, i0, i1, i2, i3, i4, i5, i6, i7, i8, i9, i10, i11, i12, i13, i14, i15) {
    argonG(R, i0, i4, i8, i12);
    argonG(R, i1, i5, i9, i13);
    argonG(R, i2, i6, i10, i14);
    argonG(R, i3, i7, i11, i15);
    argonG(R, i0, i5, i10, i15);
    argonG(R, i1, i6, i11, i12);
    argonG(R, i2, i7, i8, i13);
    argonG(R, i3, i4, i9, i14);
  }

  const R_BUF = new Uint32Array(256);
  const Z_BUF = new Uint32Array(256);

  function compressBlockG(mem, xOff, yOff, outOff, xorOut) {
    for (let i = 0; i < 256; i++) {
      const v = (mem[xOff + i] ^ mem[yOff + i]) >>> 0;
      R_BUF[i] = v;
      Z_BUF[i] = v;
    }
    for (let r = 0; r < 8; r++) {
      const b = r * 32;
      permuteP(
        Z_BUF,
        b + 0, b + 2, b + 4, b + 6, b + 8, b + 10, b + 12, b + 14,
        b + 16, b + 18, b + 20, b + 22, b + 24, b + 26, b + 28, b + 30
      );
    }
    for (let c = 0; c < 8; c++) {
      const b = c * 4;
      permuteP(
        Z_BUF,
        b + 0, b + 2, b + 32, b + 34, b + 64, b + 66, b + 96, b + 98,
        b + 128, b + 130, b + 160, b + 162, b + 192, b + 194, b + 224, b + 226
      );
    }
    if (xorOut) {
      for (let i = 0; i < 256; i++) {
        mem[outOff + i] = (mem[outOff + i] ^ R_BUF[i] ^ Z_BUF[i]) >>> 0;
      }
    } else {
      for (let i = 0; i < 256; i++) {
        mem[outOff + i] = (R_BUF[i] ^ Z_BUF[i]) >>> 0;
      }
    }
  }

  function writeLE32(arr, off, val) {
    arr[off] = val & 0xff;
    arr[off + 1] = (val >>> 8) & 0xff;
    arr[off + 2] = (val >>> 16) & 0xff;
    arr[off + 3] = (val >>> 24) & 0xff;
  }

  function argon2idRaw(passwordBytes, saltBytes, opts) {
    const p = (opts && opts.p) || 1;
    const tagLen = (opts && opts.tagLen) || 32;
    const mKiB = Math.max(8 * p, (opts && opts.m) || 4096);
    const tPasses = Math.max(1, (opts && opts.t) || 2);
    const secretBytes = (opts && opts.secret) || new Uint8Array(0);
    const adBytes = (opts && opts.ad) || new Uint8Array(0);
    const yType = 2; // Argon2id

    const h0InputLen = 40 + passwordBytes.length + saltBytes.length + secretBytes.length + adBytes.length;
    const h0Input = new Uint8Array(h0InputLen);
    let pos = 0;
    writeLE32(h0Input, pos, p); pos += 4;
    writeLE32(h0Input, pos, tagLen); pos += 4;
    writeLE32(h0Input, pos, mKiB); pos += 4;
    writeLE32(h0Input, pos, tPasses); pos += 4;
    writeLE32(h0Input, pos, 0x13); pos += 4;
    writeLE32(h0Input, pos, yType); pos += 4;
    writeLE32(h0Input, pos, passwordBytes.length); pos += 4;
    h0Input.set(passwordBytes, pos); pos += passwordBytes.length;
    writeLE32(h0Input, pos, saltBytes.length); pos += 4;
    h0Input.set(saltBytes, pos); pos += saltBytes.length;
    writeLE32(h0Input, pos, secretBytes.length); pos += 4;
    h0Input.set(secretBytes, pos); pos += secretBytes.length;
    writeLE32(h0Input, pos, adBytes.length); pos += 4;
    h0Input.set(adBytes, pos);

    const H0 = blake2b(h0Input, 64);
    const segLen = Math.max(2, Math.floor(mKiB / (4 * p)));
    const q = segLen * 4;
    const totalBlocks = p * q;
    const mem = new Uint32Array((totalBlocks + 3) * 256);
    const zeroOff = totalBlocks * 256;
    const inputOff = (totalBlocks + 1) * 256;
    const addrOff = (totalBlocks + 2) * 256;

    const preseed = new Uint8Array(72);
    preseed.set(H0, 0);
    for (let lane = 0; lane < p; lane++) {
      for (let blk = 0; blk < 2; blk++) {
        writeLE32(preseed, 64, blk);
        writeLE32(preseed, 68, lane);
        const bBytes = hPrime(preseed, 1024);
        const dstOff = (lane * q + blk) * 256;
        for (let w = 0; w < 256; w++) {
          const o = w * 4;
          mem[dstOff + w] = (bBytes[o] | (bBytes[o + 1] << 8) | (bBytes[o + 2] << 16) | (bBytes[o + 3] << 24)) >>> 0;
        }
      }
    }

    for (let pass = 0; pass < tPasses; pass++) {
      for (let slice = 0; slice < 4; slice++) {
        const dataIndependent = (pass === 0 && slice < 2);
        for (let lane = 0; lane < p; lane++) {
          let addrCounter = 0;
          const startIdx = (pass === 0 && slice === 0) ? 2 : 0;
          for (let idx = startIdx; idx < segLen; idx++) {
            const curCol = slice * segLen + idx;
            const prevCol = curCol === 0 ? q - 1 : curCol - 1;
            const curOff = (lane * q + curCol) * 256;
            const prevOff = (lane * q + prevCol) * 256;

            let J1 = 0, J2 = 0;
            if (dataIndependent) {
              if (idx === startIdx || (idx % 128) === 0) {
                addrCounter++;
                mem.fill(0, inputOff, inputOff + 256);
                mem[inputOff + 0] = pass;
                mem[inputOff + 2] = lane;
                mem[inputOff + 4] = slice;
                mem[inputOff + 6] = totalBlocks;
                mem[inputOff + 8] = tPasses;
                mem[inputOff + 10] = yType;
                mem[inputOff + 12] = addrCounter;
                compressBlockG(mem, zeroOff, inputOff, addrOff, false);
                compressBlockG(mem, zeroOff, addrOff, addrOff, false);
              }
              const wIdx = (idx % 128) * 2;
              J1 = mem[addrOff + wIdx];
              J2 = mem[addrOff + wIdx + 1];
            } else {
              J1 = mem[prevOff];
              J2 = mem[prevOff + 1];
            }

            const refLane = (pass === 0 && slice === 0) ? lane : (J2 >>> 0) % p;
            let W = 0;
            if (pass === 0) {
              if (slice === 0 || lane === refLane) {
                W = slice * segLen + idx - 1;
              } else {
                W = slice * segLen - (idx === 0 ? 1 : 0);
              }
            } else {
              if (lane === refLane) {
                W = q - segLen + idx - 1;
              } else {
                W = q - segLen - (idx === 0 ? 1 : 0);
              }
            }
            const x = (BigInt(J1 >>> 0) * BigInt(J1 >>> 0)) >> 32n;
            const y = (BigInt(W) * x) >> 32n;
            const relPos = BigInt(W) - 1n - y;
            const startPos = (pass === 0 || slice === 3) ? 0 : (slice + 1) * segLen;
            const refCol = Number((BigInt(startPos) + relPos) % BigInt(q));
            const refOff = (refLane * q + refCol) * 256;

            compressBlockG(mem, prevOff, refOff, curOff, pass > 0);
          }
        }
      }
    }

    const finalWords = new Uint32Array(256);
    for (let lane = 0; lane < p; lane++) {
      const lastOff = (lane * q + (q - 1)) * 256;
      for (let w = 0; w < 256; w++) {
        finalWords[w] ^= mem[lastOff + w];
      }
    }
    const finalBytes = new Uint8Array(1024);
    for (let w = 0; w < 256; w++) {
      writeLE32(finalBytes, w * 4, finalWords[w]);
    }
    // Zero out sensitive memory matrix before returning
    mem.fill(0);
    return hPrime(finalBytes, tagLen);
  }

  function toBytes(val) {
    if (val instanceof Uint8Array) return val;
    return new TextEncoder().encode(String(val || ''));
  }

  function toHex(bytes) {
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  }

  function toBase64NoPad(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/=+$/, '');
  }

  function formatPhcString(tagBytes, saltBytes, params) {
    const m = (params && params.m) || 4096;
    const t = (params && params.t) || 2;
    const p = (params && params.p) || 1;
    return `$argon2id$v=19$m=${m},t=${t},p=${p}$${toBase64NoPad(saltBytes)}$${toBase64NoPad(tagBytes)}`;
  }

  const _kdfCache = new Map();

  async function deriveArgon2idKeyPair(passphrase, saltBytes, customParams) {
    const params = Object.assign({ m: 4096, t: 2, p: 1, tagLen: 64 }, customParams || {});
    const cacheKey = `${passphrase}::${toHex(saltBytes)}::${params.m}:${params.t}:${params.p}`;
    if (_kdfCache.has(cacheKey)) {
      return _kdfCache.get(cacheKey);
    }

    const rawKeyMaterial = argon2idRaw(toBytes(passphrase), toBytes(saltBytes), params);
    const aesBytes = rawKeyMaterial.subarray(0, 32);
    const hmacBytes = rawKeyMaterial.subarray(32, 64);

    const aesKey = await crypto.subtle.importKey(
      'raw',
      aesBytes,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    const hmacKey = await crypto.subtle.importKey(
      'raw',
      hmacBytes,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify']
    );
    const phc = formatPhcString(rawKeyMaterial.subarray(0, 32), toBytes(saltBytes), params);
    const result = {
      aesKey,
      hmacKey,
      phcDescriptor: `$argon2id$v=19$m=${params.m},t=${params.t},p=${params.p}`,
      phcSample: phc,
      params: { m: params.m, t: params.t, p: params.p, v: 19, alg: 'Argon2id-RFC9106' }
    };
    if (_kdfCache.size > 8) _kdfCache.clear();
    _kdfCache.set(cacheKey, result);
    return result;
  }

  function clearKeyCache() {
    _kdfCache.clear();
  }

  const api = {
    blake2b,
    hPrime,
    argon2idRaw,
    deriveArgon2idKeyPair,
    formatPhcString,
    clearKeyCache,
    toHex
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.ZenithArgon2id = api;
})(typeof window !== 'undefined' ? window : globalThis);
