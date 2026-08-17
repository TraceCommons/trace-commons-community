// Verifies the ShimBuffer contract from src/scripts/legion-claim.ts against
// the exact checks wallet-selector performs, with the real Buffer removed.
//
// Run: node verify-buffer-shim.mjs

import assert from "node:assert/strict";

const RealBuffer = globalThis.Buffer;

// --- the shim, copied verbatim in behaviour from legion-claim.ts -----------
class ShimBuffer extends Uint8Array {
  toString(encoding) {
    if (encoding === "base64") {
      let binary = "";
      for (const b of this) binary += String.fromCharCode(b);
      return btoa(binary);
    }
    return new TextDecoder().decode(this);
  }
}

function installBufferShim() {
  const g = globalThis;
  if (g.Buffer) return;
  g.Buffer = {
    from(input) {
      if (typeof input === "string") {
        return new ShimBuffer(new TextEncoder().encode(input));
      }
      if (input instanceof Uint8Array) {
        return new ShimBuffer(input);
      }
      return new ShimBuffer(
        input instanceof ArrayBuffer ? new Uint8Array(input) : Uint8Array.from(input),
      );
    },
    isBuffer(value) {
      return value instanceof Uint8Array;
    },
  };
}

function nonceForWallet(bytes) {
  const g = globalThis.Buffer;
  return g ? g.from(bytes) : bytes;
}
// --------------------------------------------------------------------------

// A representative 32-byte server nonce, including 0x00 and 0xff edges and
// bytes above 0x7f (where a naive UTF-8 round-trip would corrupt the value).
const nonceBytes = new Uint8Array(32);
for (let i = 0; i < 32; i += 1) nonceBytes[i] = (i * 7 + 200) % 256;
nonceBytes[0] = 0x00;
nonceBytes[31] = 0xff;

const expectedBase64 = RealBuffer.from(nonceBytes).toString("base64");

// Simulate the browser: no Buffer global at all.
delete globalThis.Buffer;
assert.equal(globalThis.Buffer, undefined, "precondition: Buffer removed");

installBufferShim();

const nonce = nonceForWallet(nonceBytes);

// 1. The literal predicate from wallet-selector core's
//    validateSignMessageParams. This is what threw before the fix.
assert.doesNotThrow(() => {
  if (!globalThis.Buffer.isBuffer(nonce) || nonce.length !== 32) {
    throw new Error("Invalid nonce. It must be a Buffer with a length of 32 bytes.");
  }
}, "wallet-selector nonce validation must pass");

// 2. The my-near-wallet call site: Buffer.from(nonce).toString("base64").
const shimBase64 = globalThis.Buffer.from(nonce).toString("base64");
assert.equal(
  shimBase64,
  expectedBase64,
  "shim base64 must match Node's real Buffer byte-for-byte",
);

// 3. A bare Uint8Array must ALSO satisfy the shim's isBuffer, since that is
//    what the shim promises callers.
assert.equal(globalThis.Buffer.isBuffer(nonceBytes), true);

// 4. Guard against the silent-corruption failure mode: a plain Uint8Array's
//    inherited toString returns comma-separated digits, NOT base64. If
//    ShimBuffer ever stops overriding toString, this catches it.
const plain = new Uint8Array(nonceBytes);
assert.notEqual(
  plain.toString("base64"),
  expectedBase64,
  "sanity: a plain Uint8Array must NOT accidentally produce base64",
);
assert.ok(nonce instanceof Uint8Array, "nonce must remain a Uint8Array subclass");

// 5. String input path (used by other Buffer.from callers).
assert.equal(
  globalThis.Buffer.from("hello").toString("base64"),
  RealBuffer.from("hello").toString("base64"),
);

console.log("PASS: shim satisfies wallet-selector's nonce contract");
console.log("  isBuffer(nonce)      =", globalThis.Buffer.isBuffer(nonce));
console.log("  nonce.length         =", nonce.length);
console.log("  shim base64          =", shimBase64);
console.log("  real Buffer base64   =", expectedBase64);
console.log("  plain U8 toString    =", plain.toString("base64").slice(0, 40) + "…");
