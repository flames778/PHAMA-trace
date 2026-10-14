import { sha256Hex } from "../src/lib/sha256.ts";

const vectors: [string, string][] = [
  ["", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
  ["abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"],
  [
    "The quick brown fox jumps over the lazy dog",
    "d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592",
  ],
  [
    "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq",
    "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
  ],
];

let failed = 0;
for (const [input, expected] of vectors) {
  const got = sha256Hex(input);
  const ok = got === expected;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  sha256("${input.slice(0, 32)}...")`);
  if (!ok) {
    console.log(`      got ${got}`);
    console.log(`      exp ${expected}`);
  }
}

// 1,000,000 'a' — long-message path (multi-block padding).
const million = "a".repeat(1_000_000);
const longOk = sha256Hex(million) === "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0";
if (!longOk) failed++;
console.log(`${longOk ? "PASS" : "FAIL"}  sha256("a" x 1000000)`);

process.exit(failed === 0 ? 0 : 1);
