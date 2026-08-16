// Generates random filler text up to a target token count.
// Used to test the context-window indicator (src/components/ai-elements/context.tsx)
// by simulating a conversation/workspace that fills N tokens of agent context.
//
// Usage:
//   node scripts/qa/gen-context-fill.mjs [tokens] [output-file]
//
// Examples:
//   node scripts/qa/gen-context-fill.mjs                      # 300,000 tokens (default)
//   node scripts/qa/gen-context-fill.mjs 100000                # 100k tokens
//   node scripts/qa/gen-context-fill.mjs 300000 /tmp/ctx.txt   # custom output
//
// Token estimate: ~4 characters per token (English prose heuristic).
// The file is deliberately NOT deterministic so each run exercises new text.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const targetTokens = Number(process.argv[2] ?? 300_000);
const outFile = resolve(
  process.argv[3] ?? `scripts/qa/fixtures/context-fill-${targetTokens}t.txt`,
);
const CHARS_PER_TOKEN = 4;
const targetChars = targetTokens * CHARS_PER_TOKEN;

const WORDS = [
  "context", "workspace", "agent", "session", "token", "stream", "message",
  "response", "reasoning", "tool", "call", "file", "function", "module",
  "import", "export", "const", "return", "async", "await", "request",
  "response", "error", "handle", "process", "update", "render", "state",
  "component", "build", "run", "test", "debug", "refactor", "review",
  "implement", "optimize", "analyze", "resolve", "retry", "cancel",
  "generate", "summarize", "explain", "document", "verify", "reproduce",
  "the", "and", "for", "with", "that", "this", "from", "into", "over",
  "under", "before", "after", "while", "during", "between", "across",
  "quick", "slow", "large", "small", "local", "remote", "secure", "public",
  "private", "final", "current", "previous", "next", "last", "first",
  "check", "skip", "stop", "start", "finish", "create", "delete", "move",
  "copy", "read", "write", "open", "close", "merge", "split", "join",
  "data", "value", "index", "length", "width", "height", "path", "root",
  "user", "system", "model", "output", "input", "result", "status", "queue",
];

const PUNCT = [".", ",", ":", ";", "!", "?"];
const OPENERS = ["(", "[", "{"];
const CLOSERS = [")", "]", "}"];

let seed = 0x2f6e2b1;
function rand() {
  // xorshift32 — tiny deterministic PRNG so progress is reproducible per run.
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return (seed >>> 0) / 0xffffffff;
}
function pick(arr) {
  return arr[Math.floor(rand() * arr.length)];
}
function capitalize(word) {
  return word[0].toUpperCase() + word.slice(1);
}

function sentence() {
  const words = [];
  const length = 6 + Math.floor(rand() * 9);
  for (let i = 0; i < length; i++) {
    let word = pick(WORDS);
    if (rand() < 0.08) word = `${word}${pick(OPENERS)}${pick(WORDS)}${pick(CLOSERS)}`;
    if (rand() < 0.05) word = `${word}${Math.floor(rand() * 1000)}`;
    words.push(word);
  }
  const text = `${capitalize(words[0])} ${words.slice(1).join(" ")}${pick(PUNCT)}`;
  return rand() < 0.1 ? `${text} ` : text;
}

function paragraph() {
  const sentences = [];
  const count = 3 + Math.floor(rand() * 5);
  for (let i = 0; i < count; i++) sentences.push(sentence());
  return sentences.join(" ");
}

const MARKER_EVERY_TOKENS = 50_000;

function buildText() {
  const chunks = [];
  let chars = 0;
  let tokens = 0;
  let nextMarker = MARKER_EVERY_TOKENS;
  while (chars < targetChars) {
    const block = paragraph();
    chunks.push(block, "\n\n");
    const blockTokens = Math.ceil(block.length / CHARS_PER_TOKEN);
    tokens += blockTokens;
    chars += block.length + 2;
    if (tokens >= nextMarker && nextMarker <= targetTokens) {
      chunks.push(`\n[marker: ~${nextMarker / 1000}k tokens]\n`);
      nextMarker += MARKER_EVERY_TOKENS;
    }
  }
  return chunks.join("");
}

const text = buildText();
await mkdir(dirname(outFile), { recursive: true });
await writeFile(outFile, text, "utf8");

const estTokens = Math.round(text.length / CHARS_PER_TOKEN);
console.log(`Wrote ${outFile}`);
console.log(`  target tokens : ${targetTokens.toLocaleString("en-US")}`);
console.log(`  chars written : ${text.length.toLocaleString("en-US")}`);
console.log(`  est. tokens   : ${estTokens.toLocaleString("en-US")} (~${Math.round((estTokens / targetTokens) * 100)}% of target)`);
