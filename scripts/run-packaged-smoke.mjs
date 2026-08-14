import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const { extractFile } = createRequire(import.meta.url)("@electron/asar");
const testDir = await mkdtemp(path.join(tmpdir(), "pi-bot-smoke-"));
const resultFile = path.join(testDir, "smoke-test.json");
const appPath = path.resolve("release/mac-arm64/Pi Bot.app");
const appAsar = path.join(appPath, "Contents", "Resources", "app.asar");

try {
  const packagedMain = extractFile(appAsar, "electron/main.mjs").toString();
  if (packagedMain.includes("safeStorage") || packagedMain.includes("credentials.bin")) {
    throw new Error("Packaged app still references Electron Safe Storage.");
  }
  await writeFile(path.join(testDir, ".smoke-test"), "");
  await run("/usr/bin/open", ["-n", appPath, "--args", `--user-data-dir=${testDir}`]);
  let result;
  for (let attempt = 0; attempt < 150; attempt += 1) {
    try {
      const candidate = JSON.parse(await readFile(resultFile, "utf8"));
      if (candidate.error || candidate.stage === "setup-ready") {
        result = candidate;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (!result) throw new Error("Packaged smoke test did not produce a result.");
  if (result.error || result.stage !== "setup-ready" || result.errors.length > 0) {
    throw new Error(`Packaged smoke test failed: ${JSON.stringify(result)}`);
  }
  console.log("Packaged smoke test passed.");
} finally {
  await rm(testDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
}
