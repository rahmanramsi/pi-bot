import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  appendUserProfileContext,
  formatUserProfileContext,
  loadVersionedUserProfileContext,
} from "../electron/user-profile-context.mjs";

const mainSource = readFileSync(path.join(process.cwd(), "electron", "main.mjs"), "utf8");
const preloadSource = readFileSync(path.join(process.cwd(), "electron", "preload.cjs"), "utf8");
const rendererSource = readFileSync(path.join(process.cwd(), "src", "App.tsx"), "utf8");

test("formats a blank profile as no context", () => {
  assert.equal(formatUserProfileContext({ avatar: "", name: "", about: "" }), "");
  assert.equal(appendUserProfileContext("Base instructions", { avatar: "", name: "", about: "" }), "Base instructions");
});

test("formats only populated profile fields inside a delimited context block", () => {
  const context = formatUserProfileContext({ avatar: "🧑‍💻", name: "", about: "Builds local-first tools." });

  assert.match(context, /^### User profile/);
  assert.match(context, /Avatar: 🧑‍💻/);
  assert.match(context, /About you: Builds local-first tools\./);
  assert.doesNotMatch(context, /Name:/);
  assert.match(context, /### End user profile$/);
  const namedContext = formatUserProfileContext({ avatar: "🧑‍💻", name: "Rahman", about: "" });
  assert.equal(
    appendUserProfileContext("Base instructions", { avatar: "🧑‍💻", name: "Rahman", about: "" }),
    ["Base instructions", namedContext].join("\n\n"),
  );
});

test("retries resource construction when the profile changes during an async load", async () => {
  let version = 1;
  let profile = { avatar: "😀", name: "Old", about: "" };
  const seen = [];

  const result = await loadVersionedUserProfileContext({
    getProfile: () => profile,
    getVersion: () => version,
    createResource: async (snapshot, profileVersion) => {
      seen.push({ snapshot, profileVersion });
      if (seen.length === 1) {
        profile = { avatar: "🧑‍💻", name: "New", about: "Current" };
        version = 2;
      }
      return { profile: snapshot };
    },
  });

  assert.equal(result.profileVersion, 2);
  assert.deepEqual(result.resource.profile, profile);
  assert.deepEqual(seen, [
    { snapshot: { avatar: "😀", name: "Old", about: "" }, profileVersion: 1 },
    { snapshot: { avatar: "🧑‍💻", name: "New", about: "Current" }, profileVersion: 2 },
  ]);
});

test("keeps profile persistence in main and sends current context to interactive and scheduled agents", () => {
  assert.match(mainSource, /appDatabase\.getUserProfile\(\)/);
  assert.match(mainSource, /appDatabase\.saveUserProfile\(value\)/);
  assert.match(mainSource, /userProfileVersion \+= 1/);
  assert.match(mainSource, /await refreshAllRuntimeProfileContexts\(\)/);
  assert.match(mainSource, /createResourceLoader\(profile\)/);
  assert.match(mainSource, /createResourceLoader\(scheduledProfile, runtimeDir\)/);
  assert.match(mainSource, /const \{ resource: resourceLoader, profileVersion \} = await createResourceLoader\(profile\)/);
  assert.match(mainSource, /const \{ resource: resourceLoader, profileVersion \} = await createResourceLoader\(scheduledProfile, runtimeDir\)/);
  assert.match(mainSource, /transcript: transcriptFromManager\(manager, scheduledProfile\),\s*profileVersion,/);
  assert.match(mainSource, /await refreshRuntimeProfileContext\(runtime\);\s*await runtime\.session\.prompt\(job\.prompt\)/);
  assert.match(mainSource, /await refreshRuntimeProfileContext\(runtime\);\s*const hasUserMessage/);
  assert.match(mainSource, /formatUserProfileContext\(currentUserProfile\)/);
  assert.match(mainSource, /\.\.\.\(userProfileContext \? \[userProfileContext\] : \[\]\)/);
  assert.doesNotMatch(preloadSource, /appDatabase|node:sqlite|pi-bot\.sqlite/);
  assert.doesNotMatch(rendererSource, /localStorage.*(?:profile|userProfile)|(?:profile|userProfile).*localStorage/);
});
