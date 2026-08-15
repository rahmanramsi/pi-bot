import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { reasoningId, thinkingText } from "../electron/reasoning.mjs";

test("consolidates readable thinking blocks without exposing provider metadata", () => {
  const content = [
    { type: "thinking", thinking: "Inspect the request", thinkingSignature: "private-signature" },
    { type: "text", text: "Visible answer" },
    { type: "thinking", thinking: "Verify the result", encrypted_content: "private-payload" },
  ];

  assert.equal(thinkingText(content), "Inspect the request\n\nVerify the result");
  assert.doesNotMatch(thinkingText(content), /private-signature|private-payload/);
});

test("uses the assistant message timestamp as a stable reasoning id", () => {
  assert.equal(reasoningId({ timestamp: 1786794000000 }), "reasoning-1786794000000");
});

test("relays the complete Pi reasoning lifecycle", async () => {
  const source = await readFile(new URL("../electron/main.mjs", import.meta.url), "utf8");
  const relay = source.match(/function relay\(runtime, event\)[\s\S]*?function updatePendingSession/)?.[0] ?? "";

  assert.match(relay, /thinking_start/);
  assert.match(relay, /thinking_delta/);
  assert.match(relay, /type: "reasoning-start"/);
  assert.match(relay, /type: "reasoning-delta"/);
  assert.match(relay, /type: "reasoning-end"/);
  assert.doesNotMatch(relay, /thinkingSignature|encrypted_content/);
});
