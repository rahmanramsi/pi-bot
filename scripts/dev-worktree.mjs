import { spawn } from "node:child_process";
import { chmod, mkdir } from "node:fs/promises";
import path from "node:path";
import { createServer } from "vite";

const root = process.cwd();
const userDataDir = path.join(root, ".pi-bot", "user-data");
const electronCli = path.join(root, "node_modules", "electron", "cli.js");

await mkdir(userDataDir, { recursive: true });
await chmod(userDataDir, 0o700);

const vite = await createServer({
  root,
  server: {
    host: "127.0.0.1",
    port: 0,
  },
});

await vite.listen();
const address = vite.httpServer?.address();
if (!address || typeof address === "string") {
  await vite.close();
  throw new Error("Vite did not provide a local development port.");
}

const developmentServerUrl = `http://127.0.0.1:${address.port}`;
console.log(`Pi Bot development server: ${developmentServerUrl}`);
console.log(`Pi Bot worktree data: ${userDataDir}`);

const electron = spawn(process.execPath, [electronCli, "."], {
  cwd: root,
  env: {
    ...process.env,
    PI_BOT_DEV_SERVER_URL: developmentServerUrl,
    PI_BOT_USER_DATA_DIR: userDataDir,
  },
  stdio: "inherit",
});

let stopping = false;
async function stop(exitCode) {
  if (stopping) return;
  stopping = true;
  electron.kill();
  await vite.close();
  process.exit(exitCode);
}

process.once("SIGINT", () => void stop(0));
process.once("SIGTERM", () => void stop(0));

let exitCode;
try {
  exitCode = await new Promise((resolve, reject) => {
    electron.once("error", reject);
    electron.once("exit", (code) => resolve(code ?? 1));
  });
} finally {
  await vite.close();
}

process.exitCode = exitCode;
