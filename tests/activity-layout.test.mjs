import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const terminal = await readFile(new URL("../src/components/ai-elements/terminal.tsx", import.meta.url), "utf8");

test("activity header spans the full Task width", () => {
  assert.match(styles, /\.activity-group-trigger\s*\{[^}]*width:\s*100%/s);
  assert.match(styles, /\.activity-group-content\s*\{[^}]*width:\s*100%/s);
  const groupRule = styles.match(/\.activity-group\s*\{([^}]*)\}/)?.[1] ?? "";
  const triggerRule = styles.match(/\.activity-group-trigger\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.doesNotMatch(groupRule, /background|box-shadow|border-radius/);
  assert.doesNotMatch(triggerRule, /background|box-shadow|border-radius/);
  assert.match(styles, /\.activity-group-divider\s*\{/);
  assert.doesNotMatch(styles, /\.activity-progress-message\s*\{[^}]*border-bottom/s);
  assert.doesNotMatch(styles, /\.activity-list \.reasoning-row\s*\{[^}]*border-bottom/s);
});

test("shell details use a Codex-style AI Elements Terminal", () => {
  assert.match(app, /<Terminal className="activity-shell" command=\{command\} output=\{output\}/);
  assert.match(terminal, /data-slot="terminal"/);
  assert.match(terminal, /<AnsiText>\{output\}<\/AnsiText>/);
  assert.match(styles, /\.activity-item \[data-slot="tool-header"\] \.tool-status\.completed\s*\{[^}]*display:\s*none/s);
  assert.match(styles, /\.terminal-command\s*\{[^}]*grid-template-columns:/s);
  assert.match(styles, /\.terminal-footer\s*\{[^}]*justify-content:\s*flex-end/s);
  assert.match(styles, /\.terminal-content\s*\{[^}]*overflow-x:\s*hidden[^}]*overflow-y:\s*auto/s);
  assert.match(styles, /\.terminal-content pre\s*\{[^}]*white-space:\s*pre-wrap[^}]*overflow-wrap:\s*anywhere/s);
});
