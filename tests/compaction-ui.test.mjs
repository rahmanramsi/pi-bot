import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("relays compaction progress and preserves completed compactions in the chat transcript", async () => {
  const main = await readFile(new URL("../electron/main.mjs", import.meta.url), "utf8");
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const types = await readFile(new URL("../src/types.ts", import.meta.url), "utf8");

  assert.match(main, /entry\.type === "compaction"[\s\S]*?label: "Context compacted"/);
  assert.match(main, /event\.type === "compaction_start"[\s\S]*?type: "compaction-start"/);
  assert.match(main, /event\.type === "compaction_end"[\s\S]*?type: "compaction-end"/);
  assert.match(types, /type: "compaction-start"; id: string; reason: "threshold" \| "overflow"/);
  assert.match(types, /type: "compaction-end"; id: string; failed: boolean; errorMessage\?: string/);
  assert.match(app, /export function startCompaction/);
  assert.match(app, /export function finishCompaction/);
  assert.match(app, /event\.type === "compaction-start"/);
  assert.match(app, /event\.type === "compaction-end"/);
});
