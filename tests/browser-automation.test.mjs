import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { JSDOM } from "jsdom";
import { Value } from "typebox/value";
import { createAgentSession, SessionManager, SettingsManager } from "@earendil-works/pi-coding-agent";
import { createAppDatabase } from "../electron/app-database.mjs";
import { createDatabaseSession } from "../electron/session-database-adapter.mjs";
import {
  BrowserAutomationError,
  browserGuestMatchesHost,
  browserPartitionForTab,
  createBrowserAutomationService,
  createBrowserTool,
  isAllowedBrowserUrl,
  protectBrowserSessionManager,
  summarizeBrowserToolCall,
} from "../electron/browser-automation.mjs";

function browserPartitionForSession(sessionKey) {
  return browserPartitionForTab(sessionKey, "browser-a");
}

class FakeContents extends EventEmitter {
  constructor(id, executeJavaScript = () => Promise.resolve({ text: "Visible page" })) {
    super();
    this.id = id;
    this.executeHandler = executeJavaScript;
    this.executedScripts = [];
    this.loadedUrls = [];
    this.stopped = false;
    this.destroyed = false;
  }

  executeJavaScript(script) {
    this.executedScripts.push(script);
    return this.executeHandler(script);
  }

  getType() {
    return "webview";
  }

  loadURL(url) {
    this.loadedUrls.push(url);
    return Promise.resolve();
  }

  stop() {
    this.stopped = true;
  }

  isDestroyed() {
    return this.destroyed;
  }

  destroy() {
    this.destroyed = true;
    this.emit("destroyed");
  }
}

class DomContents extends FakeContents {
  constructor(html) {
    super(42);
    this.dom = new JSDOM(html, { url: "https://example.com/account", runScripts: "outside-only" });
    Object.defineProperty(this.dom.window.HTMLElement.prototype, "getBoundingClientRect", {
      configurable: true,
      value() {
        const style = this.getAttribute("style") || "";
        const hidden = this.hasAttribute("hidden") || /display\s*:\s*none/i.test(style) || /visibility\s*:\s*hidden/i.test(style);
        const offscreen = /(?:left|top)\s*:\s*-\d+/i.test(style);
        const elements = [...this.ownerDocument.querySelectorAll("*")];
        const index = Math.max(0, elements.indexOf(this));
        const left = 10 + index % 6 * 140;
        const top = 10 + Math.floor(index / 6) * 40;
        return {
          width: hidden ? 0 : 120,
          height: hidden ? 0 : 24,
          top: hidden || offscreen ? -100 : top,
          left: hidden || offscreen ? -100 : left,
          right: hidden || offscreen ? -1 : left + 120,
          bottom: hidden || offscreen ? -1 : top + 24,
        };
      },
    });
    this.dom.window.document.elementFromPoint = (x, y) => [...this.dom.window.document.querySelectorAll("*")].reverse().find((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    }) || null;
  }

  executeJavaScript(script) {
    this.executedScripts.push(script);
    return Promise.resolve(this.dom.window.eval(script));
  }
}

function setup(scope = { agentId: "agent-a", sessionKey: "session-a" }) {
  const service = createBrowserAutomationService();
  const contents = new FakeContents(41);
  const partition = browserPartitionForSession(scope.sessionKey);
  service.attachWebContents(contents, partition);
  service.activateScope(scope);
  service.registerTab({ tabId: "browser-a", sessionKey: scope.sessionKey, partition });
  return { service, contents };
}

test("accepts credential-free HTTP(S) URLs and rejects unsafe navigation", () => {
  assert.equal(isAllowedBrowserUrl("https://example.com/path"), true);
  assert.equal(isAllowedBrowserUrl("http://localhost:4173/"), true);
  assert.equal(isAllowedBrowserUrl("file:///tmp/page.html"), false);
  assert.equal(isAllowedBrowserUrl("javascript:alert(1)"), false);
  assert.equal(isAllowedBrowserUrl("https://user:pass@example.com/"), false);
  assert.equal(isAllowedBrowserUrl("mailto:test@example.com"), false);
});

test("uses a stable collision-resistant partition identity for each chat session", () => {
  const first = browserPartitionForSession("session-a");
  assert.equal(first, browserPartitionForSession("session-a"));
  assert.match(first, /^persist:pi-bot-browser-[0-9a-f]{32}$/);
  assert.notEqual(first, browserPartitionForSession("session-b"));
});

test("issues stable distinct per-tab partitions without FIFO attachment state", () => {
  const first = browserPartitionForTab("session-a", "browser-a");
  const second = browserPartitionForTab("session-a", "browser-b");
  assert.equal(first, browserPartitionForTab("session-a", "browser-a"));
  assert.notEqual(first, second);
  assert.notEqual(first, browserPartitionForTab("session-b", "browser-a"));
});

test("correlates a did-attach guest through hostWebContents without an event sender", () => {
  const host = { id: 900 };
  const guest = { hostWebContents: host };
  assert.equal(browserGuestMatchesHost(guest, host), true);
  assert.equal(browserGuestMatchesHost({ hostWebContents: { id: 900 } }, host), true);
  assert.equal(browserGuestMatchesHost({ hostWebContents: null }, host), false);
});

test("routes actions only to the active agent and chat session tab", async () => {
  const { service, contents } = setup();

  const result = await service.execute({ action: "read", tabId: "browser-a" }, undefined, { agentId: "agent-a", sessionKey: "session-a" });
  assert.deepEqual(result, { text: "Visible page" });
  await assert.rejects(
    service.execute({ action: "read", tabId: "browser-a" }, undefined, { agentId: "agent-b", sessionKey: "session-b" }),
    (error) => error instanceof BrowserAutomationError && /active (?:agent )?chat session/i.test(error.message),
  );

  service.activateScope({ agentId: "agent-b", sessionKey: "session-b" });
  await assert.rejects(
    service.execute({ action: "read", tabId: "browser-a" }, undefined, { agentId: "agent-b", sessionKey: "session-b" }),
    (error) => error instanceof BrowserAutomationError && /not registered/i.test(error.message),
  );
  assert.equal(contents.executedScripts.length, 1);
});

test("routes navigation, click, input, and submit through the visible page", async () => {
  const { service, contents } = setup();
  const scope = { agentId: "agent-a", sessionKey: "session-a" };

  await service.execute({ action: "navigate", tabId: "browser-a", url: "https://example.com/account" }, undefined, scope);
  await service.execute({ action: "click", tabId: "browser-a", selector: "button#continue" }, undefined, scope);
  await service.execute({ action: "type", tabId: "browser-a", selector: "input[name=email]", text: "secret@example.com" }, undefined, scope);
  await service.execute({ action: "submit", tabId: "browser-a", selector: "form#login" }, undefined, scope);

  assert.deepEqual(contents.loadedUrls, ["https://example.com/account"]);
  assert.match(contents.executedScripts[0], /\.click\(\)/);
  assert.match(contents.executedScripts[1], /input/);
  assert.match(contents.executedScripts[2], /requestSubmit/);
  assert.doesNotMatch(summarizeBrowserToolCall({ action: "type", tabId: "browser-a", selector: "input[name=email]", text: "secret@example.com" }), /secret@example\.com/);
  assert.match(summarizeBrowserToolCall({ action: "type", tabId: "browser-a", selector: "input[name=email]", text: "secret@example.com" }), /input\[name\]/);
  assert.doesNotMatch(summarizeBrowserToolCall({ action: "click", tabId: "browser-a", selector: "input[value='secret']" }), /secret/);
});

test("discovers scoped tabs and operates a stable target returned by read", async () => {
  const scope = { agentId: "agent-a", sessionKey: "session-a" };
  const service = createBrowserAutomationService();
  const contents = new DomContents(`<main><button id="save">Save</button><button id="other">Save</button></main>`);
  contents.dom.window.clicked = 0;
  contents.dom.window.document.querySelector("#save").addEventListener("click", () => { contents.dom.window.clicked += 1; });
  service.attachWebContents(contents, browserPartitionForSession(scope.sessionKey));
  service.activateScope(scope);
  service.registerTab({ tabId: "browser-a", sessionKey: scope.sessionKey, partition: browserPartitionForSession(scope.sessionKey) });

  const discovered = await service.execute({ action: "tabs" }, undefined, scope);
  assert.deepEqual(discovered, { tabs: [{ tabId: "browser-a" }] });
  const page = await service.execute({ action: "read", tabId: discovered.tabs[0].tabId }, undefined, scope);
  const save = page.elements.find((element) => element.label === "Save");
  assert.equal(typeof save.target, "string");
  assert.ok(save.target.length <= 240);
  await service.execute({ action: "click", tabId: discovered.tabs[0].tabId, selector: save.target }, undefined, scope);
  assert.equal(contents.dom.window.clicked, 1);
});

test("tabs discovery returns every registered tab in the active chat scope", async () => {
  const scope = { agentId: "agent-a", sessionKey: "session-a" };
  const service = createBrowserAutomationService();
  const firstPartition = browserPartitionForTab(scope.sessionKey, "browser-a");
  const secondPartition = browserPartitionForTab(scope.sessionKey, "browser-b");
  service.attachWebContents(new FakeContents(45), firstPartition);
  service.attachWebContents(new FakeContents(46), secondPartition);
  service.activateScope(scope);
  service.registerTab({ tabId: "browser-a", sessionKey: scope.sessionKey, partition: firstPartition });
  service.registerTab({ tabId: "browser-b", sessionKey: scope.sessionKey, partition: secondPartition });
  assert.deepEqual(await service.execute({ action: "tabs" }, undefined, scope), { tabs: [{ tabId: "browser-a" }, { tabId: "browser-b" }] });
});

test("per-tab partitions keep guests paired when registration order differs", async () => {
  const scope = { agentId: "agent-a", sessionKey: "session-a" };
  const service = createBrowserAutomationService();
  const firstPartition = browserPartitionForTab(scope.sessionKey, "browser-a");
  const secondPartition = browserPartitionForTab(scope.sessionKey, "browser-b");
  const first = new FakeContents(47, () => Promise.resolve({ text: "first guest" }));
  const second = new FakeContents(48, () => Promise.resolve({ text: "second guest" }));
  service.attachWebContents(first, firstPartition);
  service.attachWebContents(second, secondPartition);
  service.activateScope(scope);
  service.registerTab({ tabId: "browser-b", sessionKey: scope.sessionKey, partition: secondPartition });
  service.registerTab({ tabId: "browser-a", sessionKey: scope.sessionKey, partition: firstPartition });
  assert.deepEqual(await service.execute({ action: "read", tabId: "browser-a" }, undefined, scope), { text: "first guest" });
  assert.deepEqual(await service.execute({ action: "read", tabId: "browser-b" }, undefined, scope), { text: "second guest" });
});

test("registers a persisted guest when it arrives after active scope", () => {
  const scope = { agentId: "agent-a", sessionKey: "session-a" };
  const service = createBrowserAutomationService();
  const partition = browserPartitionForTab(scope.sessionKey, "browser-a");
  const contents = new FakeContents(49);
  service.activateScope(scope);
  assert.throws(
    () => service.registerTab({ tabId: "browser-a", sessionKey: scope.sessionKey, partition }),
    (error) => error instanceof BrowserAutomationError && error.code === "tab-missing",
  );
  service.attachWebContents(contents, partition);
  assert.deepEqual(service.registerTab({ tabId: "browser-a", sessionKey: scope.sessionKey, partition }), { tabId: "browser-a" });
});

test("does not start deferred guest calls after Stop, unregister, or caller abort", async () => {
  const scope = { agentId: "agent-a", sessionKey: "session-a" };
  const cases = [
    ["stop", (service) => service.stop()],
    ["unregister", (service) => service.unregisterTab({ tabId: "browser-a", sessionKey: scope.sessionKey })],
    ["abort", (service, controller) => controller.abort(new Error("caller stopped"))],
  ];
  for (const [name, cancel] of cases) {
    const service = createBrowserAutomationService();
    const contents = new FakeContents(50 + cases.indexOf(cases.find(([label]) => label === name)));
    service.attachWebContents(contents, browserPartitionForSession(scope.sessionKey));
    service.activateScope(scope);
    service.registerTab({ tabId: "browser-a", sessionKey: scope.sessionKey, partition: browserPartitionForSession(scope.sessionKey) });
    const controller = new AbortController();
    const pending = service.execute({ action: "read", tabId: "browser-a" }, controller.signal, scope);
    cancel(service, controller);
    await assert.rejects(pending, /stopped|closed/i, name);
    await Promise.resolve();
    assert.equal(contents.executedScripts.length, 0, `${name} must prevent executeJavaScript`);
    assert.equal(contents.loadedUrls.length, 0, `${name} must prevent loadURL`);
  }
});

test("timeout cancels the controller and stops the guest page", async () => {
  const scope = { agentId: "agent-a", sessionKey: "session-a" };
  const service = createBrowserAutomationService({ timeoutMs: 5 });
  const contents = new FakeContents(54, () => new Promise(() => {}));
  service.attachWebContents(contents, browserPartitionForSession(scope.sessionKey));
  service.activateScope(scope);
  service.registerTab({ tabId: "browser-a", sessionKey: scope.sessionKey, partition: browserPartitionForSession(scope.sessionKey) });
  await assert.rejects(service.execute({ action: "read", tabId: "browser-a" }, undefined, scope), (error) => error instanceof BrowserAutomationError && error.code === "timeout");
  assert.equal(contents.stopped, true);
});

test("a retired guest is never reassigned to a replacement browser tab", async () => {
  const scope = { agentId: "agent-a", sessionKey: "session-a" };
  const service = createBrowserAutomationService();
  const firstPartition = browserPartitionForTab(scope.sessionKey, "browser-a");
  const secondPartition = browserPartitionForTab(scope.sessionKey, "browser-b");
  const replacementPartition = browserPartitionForTab(scope.sessionKey, "browser-c");
  const first = new FakeContents(55, () => Promise.resolve({ text: "first guest" }));
  const second = new FakeContents(56, () => Promise.resolve({ text: "second guest" }));
  const replacement = new FakeContents(57, () => Promise.resolve({ text: "replacement guest" }));
  service.attachWebContents(first, firstPartition);
  service.attachWebContents(second, secondPartition);
  service.activateScope(scope);
  service.registerTab({ tabId: "browser-a", sessionKey: scope.sessionKey, partition: firstPartition });
  service.registerTab({ tabId: "browser-b", sessionKey: scope.sessionKey, partition: secondPartition });
  service.unregisterTab({ tabId: "browser-a", sessionKey: scope.sessionKey });
  service.attachWebContents(replacement, replacementPartition);
  service.registerTab({ tabId: "browser-c", sessionKey: scope.sessionKey, partition: replacementPartition });
  assert.deepEqual(await service.execute({ action: "read", tabId: "browser-b" }, undefined, scope), { text: "second guest" });
  assert.deepEqual(await service.execute({ action: "read", tabId: "browser-c" }, undefined, scope), { text: "replacement guest" });
  assert.equal(first.executedScripts.length, 0);
});

test("re-adopts an existing retired guest when a persisted tab reconnects", () => {
  const scope = { agentId: "agent-a", sessionKey: "session-a" };
  const service = createBrowserAutomationService();
  const partition = browserPartitionForTab(scope.sessionKey, "browser-a");
  const contents = new FakeContents(58);
  service.attachWebContents(contents, partition);
  service.activateScope(scope);
  service.registerTab({ tabId: "browser-a", sessionKey: scope.sessionKey, partition });
  service.unregisterTab({ tabId: "browser-a", sessionKey: scope.sessionKey });
  service.attachWebContents(contents, partition);
  assert.deepEqual(service.registerTab({ tabId: "browser-a", sessionKey: scope.sessionKey, partition }), { tabId: "browser-a" });
});

test("read targets text-only controls, editable fields, and forms", async () => {
  const scope = { agentId: "agent-a", sessionKey: "session-a" };
  const service = createBrowserAutomationService();
  const contents = new DomContents(`<form><div role="button" id="continue">Continue</div><input name="email"><button type="submit">Send</button></form>`);
  let clicked = 0;
  let submitted = 0;
  contents.dom.window.document.querySelector("[role=button]").addEventListener("click", () => { clicked += 1; });
  contents.dom.window.document.querySelector("form").addEventListener("submit", (event) => { event.preventDefault(); submitted += 1; });
  service.attachWebContents(contents, browserPartitionForSession(scope.sessionKey));
  service.activateScope(scope);
  service.registerTab({ tabId: "browser-a", sessionKey: scope.sessionKey, partition: browserPartitionForSession(scope.sessionKey) });

  const page = await service.execute({ action: "read", tabId: "browser-a" }, undefined, scope);
  const control = page.elements.find((element) => element.label === "Continue");
  const field = page.elements.find((element) => element.name === "email");
  const form = page.elements.find((element) => element.tag === "form");
  assert.equal(typeof control?.target, "string");
  assert.equal(typeof field?.target, "string");
  assert.equal(typeof form?.target, "string");
  await service.execute({ action: "click", tabId: "browser-a", selector: control.target }, undefined, scope);
  await service.execute({ action: "type", tabId: "browser-a", selector: field.target, text: "person@example.com" }, undefined, scope);
  await service.execute({ action: "submit", tabId: "browser-a", selector: form.target }, undefined, scope);
  assert.equal(clicked, 1);
  assert.equal(contents.dom.window.document.querySelector("input").value, "person@example.com");
  assert.equal(submitted, 1);
});

test("read target handles reject a replaced or moved control instead of clicking another control", async () => {
  const scope = { agentId: "agent-a", sessionKey: "session-a" };
  const service = createBrowserAutomationService();
  const contents = new DomContents(`<main><button id="save">Save</button><button id="other">Other</button></main>`);
  let otherClicks = 0;
  contents.dom.window.document.querySelector("#other").addEventListener("click", () => { otherClicks += 1; });
  service.attachWebContents(contents, browserPartitionForSession(scope.sessionKey));
  service.activateScope(scope);
  service.registerTab({ tabId: "browser-a", sessionKey: scope.sessionKey, partition: browserPartitionForSession(scope.sessionKey) });
  const page = await service.execute({ action: "read", tabId: "browser-a" }, undefined, scope);
  const save = page.elements.find((element) => element.label === "Save");
  contents.dom.window.document.querySelector("#save").remove();
  await assert.rejects(service.execute({ action: "click", tabId: "browser-a", selector: save.target }, undefined, scope), /Browser click failed\.|target/i);
  assert.equal(otherClicks, 0);
});

test("manual guest navigation invalidates read handles before a later action", async () => {
  const scope = { agentId: "agent-a", sessionKey: "session-a" };
  const service = createBrowserAutomationService();
  const contents = new DomContents(`<main><button id="save">Save</button></main>`);
  service.attachWebContents(contents, browserPartitionForSession(scope.sessionKey));
  service.activateScope(scope);
  service.registerTab({ tabId: "browser-a", sessionKey: scope.sessionKey, partition: browserPartitionForSession(scope.sessionKey) });
  const page = await service.execute({ action: "read", tabId: "browser-a" }, undefined, scope);
  const target = page.elements.find((element) => element.label === "Save").target;
  contents.emit("did-navigate-in-page", {}, "https://example.com/account#changed", true);
  await assert.rejects(service.execute({ action: "click", tabId: "browser-a", selector: target }, undefined, scope), /target|Browser click failed\./i);
});

test("queued browser actions reject a target invalidated before guest execution", async () => {
  const scope = { agentId: "agent-a", sessionKey: "session-a" };
  const service = createBrowserAutomationService();
  const contents = new DomContents(`<main><button id="save">Save</button></main>`);
  service.attachWebContents(contents, browserPartitionForSession(scope.sessionKey));
  service.activateScope(scope);
  service.registerTab({ tabId: "browser-a", sessionKey: scope.sessionKey, partition: browserPartitionForSession(scope.sessionKey) });
  const page = await service.execute({ action: "read", tabId: "browser-a" }, undefined, scope);
  const target = page.elements.find((element) => element.label === "Save").target;
  const pending = service.execute({ action: "click", tabId: "browser-a", selector: target }, undefined, scope);
  contents.emit("did-navigate-in-page", {}, "https://example.com/account#changed", true);
  await assert.rejects(pending, (error) => error instanceof BrowserAutomationError && error.code === "stale-target");
  assert.equal(contents.executedScripts.length, 1);
});

test("a second read replaces the previous page target map", async () => {
  const scope = { agentId: "agent-a", sessionKey: "session-a" };
  const service = createBrowserAutomationService();
  const contents = new DomContents(`<main><button id="save">Save</button></main>`);
  service.attachWebContents(contents, browserPartitionForSession(scope.sessionKey));
  service.activateScope(scope);
  service.registerTab({ tabId: "browser-a", sessionKey: scope.sessionKey, partition: browserPartitionForSession(scope.sessionKey) });
  const firstRead = await service.execute({ action: "read", tabId: "browser-a" }, undefined, scope);
  const oldTarget = firstRead.elements.find((element) => element.label === "Save").target;
  await service.execute({ action: "read", tabId: "browser-a" }, undefined, scope);
  await assert.rejects(service.execute({ action: "click", tabId: "browser-a", selector: oldTarget }, undefined, scope), /target|Browser click failed\./i);
});

test("rejects hidden, disabled, and hidden-input controls at execution time", async () => {
  const scope = { agentId: "agent-a", sessionKey: "session-a" };
  const service = createBrowserAutomationService();
  const contents = new DomContents(`<main><div style="display:none"><button id="ancestor-hidden">Hidden ancestor</button></div><button id="hidden" style="display:none">Hidden</button><button id="transparent" style="opacity:0">Transparent</button><button id="offscreen" style="left:-1000px;top:-1000px">Offscreen</button><button id="disabled" disabled>Disabled</button><input id="secret" type="hidden" value="secret"><form id="disabled-form" disabled><button type="submit">Disabled form</button></form><fieldset disabled><button id="fieldset-disabled">Disabled fieldset</button></fieldset></main>`);
  service.attachWebContents(contents, browserPartitionForSession(scope.sessionKey));
  service.activateScope(scope);
  service.registerTab({ tabId: "browser-a", sessionKey: scope.sessionKey, partition: browserPartitionForSession(scope.sessionKey) });

  await assert.rejects(service.execute({ action: "click", tabId: "browser-a", selector: "#hidden" }, undefined, scope), /Browser click failed\./i);
  await assert.rejects(service.execute({ action: "click", tabId: "browser-a", selector: "#ancestor-hidden" }, undefined, scope), /Browser click failed\./i);
  await assert.rejects(service.execute({ action: "click", tabId: "browser-a", selector: "#transparent" }, undefined, scope), /Browser click failed\./i);
  await assert.rejects(service.execute({ action: "click", tabId: "browser-a", selector: "#offscreen" }, undefined, scope), /Browser click failed\./i);
  await assert.rejects(service.execute({ action: "click", tabId: "browser-a", selector: "#disabled" }, undefined, scope), /Browser click failed\./i);
  await assert.rejects(service.execute({ action: "type", tabId: "browser-a", selector: "#secret", text: "secret" }, undefined, scope), /Browser type failed\./i);
  await assert.rejects(service.execute({ action: "submit", tabId: "browser-a", selector: "#disabled-form" }, undefined, scope), /Browser submit failed\./i);
  await assert.rejects(service.execute({ action: "click", tabId: "browser-a", selector: "#fieldset-disabled" }, undefined, scope), /Browser click failed\./i);
});

test("never exposes password controls or lets Browser operate password-bearing forms", async () => {
  const scope = { agentId: "agent-a", sessionKey: "session-a" };
  const service = createBrowserAutomationService();
  const contents = new DomContents(`<main><form id="login"><input id="email" name="email"><input id="password" name="password" type="password"><button id="submit" type="submit">Sign in</button></form><button id="safe">Safe</button></main>`);
  service.attachWebContents(contents, browserPartitionForSession(scope.sessionKey));
  service.activateScope(scope);
  service.registerTab({ tabId: "browser-a", sessionKey: scope.sessionKey, partition: browserPartitionForSession(scope.sessionKey) });

  const page = await service.execute({ action: "read", tabId: "browser-a" }, undefined, scope);
  assert.equal(page.elements.some((element) => element.name === "password"), false);
  assert.equal(page.elements.some((element) => element.tag === "form"), false);
  await assert.rejects(service.execute({ action: "type", tabId: "browser-a", selector: "#password", text: "secret" }, undefined, scope), /Browser type failed\./i);
  await assert.rejects(service.execute({ action: "click", tabId: "browser-a", selector: "#submit" }, undefined, scope), /Browser click failed\./i);
  await assert.rejects(service.execute({ action: "submit", tabId: "browser-a", selector: "#login" }, undefined, scope), /Browser submit failed\./i);
});

test("rejects an out-of-tree submit control associated with a password form", async () => {
  const scope = { agentId: "agent-a", sessionKey: "session-a" };
  const service = createBrowserAutomationService();
  const contents = new DomContents(`<form id="login"><input name="password" type="password"></form><button id="outside-submit" type="submit" form="login">Sign in</button>`);
  service.attachWebContents(contents, browserPartitionForSession(scope.sessionKey));
  service.activateScope(scope);
  service.registerTab({ tabId: "browser-a", sessionKey: scope.sessionKey, partition: browserPartitionForSession(scope.sessionKey) });

  const page = await service.execute({ action: "read", tabId: "browser-a" }, undefined, scope);
  assert.equal(page.elements.some((element) => element.label === "Sign in"), false);
  await assert.rejects(service.execute({ action: "submit", tabId: "browser-a", selector: "#outside-submit" }, undefined, scope), /Browser submit failed\./i);
});

test("rejects an action target covered by an overlay at its center point", async () => {
  const scope = { agentId: "agent-a", sessionKey: "session-a" };
  const service = createBrowserAutomationService();
  const contents = new DomContents(`<main><button id="save">Save</button><div id="overlay">Overlay</div></main>`);
  let clicks = 0;
  contents.dom.window.document.querySelector("#save").addEventListener("click", () => { clicks += 1; });
  service.attachWebContents(contents, browserPartitionForSession(scope.sessionKey));
  service.activateScope(scope);
  service.registerTab({ tabId: "browser-a", sessionKey: scope.sessionKey, partition: browserPartitionForSession(scope.sessionKey) });
  const page = await service.execute({ action: "read", tabId: "browser-a" }, undefined, scope);
  const target = page.elements.find((element) => element.label === "Save").target;
  const overlay = contents.dom.window.document.querySelector("#overlay");
  contents.dom.window.document.elementFromPoint = () => overlay;

  await assert.rejects(service.execute({ action: "click", tabId: "browser-a", selector: target }, undefined, scope), /Browser click failed\./i);
  assert.equal(clicks, 0);
});

test("does not register a non-webview guest", () => {
  const scope = { agentId: "agent-a", sessionKey: "session-a" };
  const service = createBrowserAutomationService();
  const contents = new FakeContents(44);
  contents.getType = () => "window";
  service.attachWebContents(contents, browserPartitionForSession(scope.sessionKey));
  service.activateScope(scope);
  assert.throws(() => service.registerTab({ tabId: "browser-a", sessionKey: scope.sessionKey, partition: browserPartitionForSession(scope.sessionKey) }), /not attached/i);
});

test("rejects a partition mismatch before registering a browser tab", () => {
  const scope = { agentId: "agent-a", sessionKey: "session-a" };
  const service = createBrowserAutomationService();
  const contents = new FakeContents(43);
  service.attachWebContents(contents, browserPartitionForSession(scope.sessionKey));
  service.activateScope(scope);
  assert.throws(
    () => service.registerTab({ tabId: "browser-a", sessionKey: scope.sessionKey, partition: browserPartitionForSession("session-b") }),
    (error) => error instanceof BrowserAutomationError && /partition/i.test(error.message),
  );
});

test("returns readable errors for failed navigation and missing controls", async () => {
  const { service, contents } = setup();
  const scope = { agentId: "agent-a", sessionKey: "session-a" };

  contents.loadURL = () => Promise.reject(new Error("net::ERR_NAME_NOT_RESOLVED"));
  await assert.rejects(
    service.execute({ action: "navigate", tabId: "browser-a", url: "https://missing.example.test" }, undefined, scope),
    (error) => error instanceof BrowserAutomationError && /Browser navigate failed\.$/.test(error.message),
  );

  contents.executeHandler = () => Promise.reject(new Error("The browser control was not found."));
  await assert.rejects(
    service.execute({ action: "click", tabId: "browser-a", selector: "button#missing" }, undefined, scope),
    (error) => error instanceof BrowserAutomationError && /Browser click failed\.$/.test(error.message),
  );
});

test("Stop aborts pending browser work and stops the guest page", async () => {
  let resolveScript;
  const { service, contents } = setup();
  contents.executeHandler = () => new Promise((resolve) => { resolveScript = resolve; });
  const pending = service.execute({ action: "read", tabId: "browser-a" }, undefined, { agentId: "agent-a", sessionKey: "session-a" });
  service.stop();
  await assert.rejects(pending, (error) => error instanceof BrowserAutomationError && /stopped/i.test(error.message));
  assert.equal(contents.stopped, true);
  resolveScript?.({ text: "late result" });
});

test("an already-aborted signal never reaches the guest page", async () => {
  const { service, contents } = setup();
  const controller = new AbortController();
  controller.abort(new Error("typed-secret-must-not-leak"));
  await assert.rejects(
    service.execute({ action: "read", tabId: "browser-a" }, controller.signal, { agentId: "agent-a", sessionKey: "session-a" }),
    (error) => error instanceof BrowserAutomationError && /stopped/i.test(error.message),
  );
  assert.equal(contents.executedScripts.length, 0);
  assert.equal(contents.loadedUrls.length, 0);

  await assert.rejects(
    service.execute({ action: "navigate", tabId: "browser-a", url: "https://example.com/next" }, controller.signal, { agentId: "agent-a", sessionKey: "session-a" }),
    (error) => error instanceof BrowserAutomationError && /stopped/i.test(error.message),
  );
  assert.equal(contents.loadedUrls.length, 0);
});

test("destroying a tab rejects the outstanding action instead of hanging", async () => {
  const { service, contents } = setup();
  contents.executeHandler = () => new Promise(() => {});
  const pending = service.execute({ action: "read", tabId: "browser-a" }, undefined, { agentId: "agent-a", sessionKey: "session-a" });
  contents.destroy();
  await assert.rejects(pending, (error) => error instanceof BrowserAutomationError && /closed|destroyed/i.test(error.message));
});

test("unregistering a closed or switched tab aborts its pending action", async () => {
  const { service, contents } = setup();
  contents.executeHandler = () => new Promise(() => {});
  const pending = service.execute({ action: "read", tabId: "browser-a" }, undefined, { agentId: "agent-a", sessionKey: "session-a" });
  service.unregisterTab({ tabId: "browser-a", sessionKey: "session-a" });
  await assert.rejects(pending, (error) => error instanceof BrowserAutomationError && /closed/i.test(error.message));
  assert.equal(contents.stopped, true);
});

test("the browser tool is narrow and never includes typed values in activity details", async () => {
  const { service } = setup();
  const activity = [];
  const tool = createBrowserTool(service, { agentId: "agent-a", sessionKey: "session-a" }, (event) => activity.push(event));
  assert.equal(tool.name, "browser");
  assert.match(tool.description, /visible page/i);
  assert.equal(tool.parameters.type, "object");
  assert.equal(tool.parameters.properties.action.type, "string");
  assert.equal(Value.Check(tool.parameters, { action: "tabs" }), true);
  assert.equal(Value.Check(tool.parameters, { action: "read", tabId: "browser-a" }), true);
  assert.equal(Value.Check(tool.parameters, { action: "type", tabId: "browser-a", selector: "#email", text: "do-not-log" }), true);
  const result = await tool.execute("tool-1", { action: "type", tabId: "browser-a", selector: "#email", text: "do-not-log" });
  assert.match(result.content[0].text, /typed/i);
  assert.doesNotMatch(result.content[0].text, /do-not-log/);
  assert.doesNotMatch(JSON.stringify(activity), /do-not-log/);
  const navigationActivity = summarizeBrowserToolCall({ action: "navigate", tabId: "browser-a", url: "https://example.com/account?token=url-secret#fragment" });
  assert.match(navigationActivity, /https:\/\/example\.com\/account/);
  assert.doesNotMatch(navigationActivity, /url-secret|fragment/);
});

test("per-tab partition identity stays out of page metadata and registration cannot cover load errors", async () => {
  const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const mainSource = await readFile(new URL("../electron/main.mjs", import.meta.url), "utf8");
  assert.match(appSource, /getBrowserTabPartition/);
  assert.doesNotMatch(appSource, /attachmentToken|pi_bot_attachment|name:\s*attachmentToken/);
  assert.doesNotMatch(appSource, /addEventListener\("did-attach"/);
  assert.match(mainSource, /browserPartitionForTab/);
  assert.match(mainSource, /issuedBrowserPartitions\.get/);
  assert.match(mainSource, /getAllWebContents/);
  assert.match(mainSource, /recoverAttachedBrowserGuest/);
  const didAttachBlock = mainSource.slice(mainSource.indexOf('did-attach-webview'), mainSource.indexOf('window.webContents.once("destroyed"'));
  assert.match(didAttachBlock, /browserGuestMatchesHost|contents\.hostWebContents/);
  assert.doesNotMatch(didAttachBlock, /event\.sender/);
  assert.doesNotMatch(mainSource, /attachmentToken|mainFrame|params\.name|pendingBrowserAttachments|pendingBrowserPartitions/);
  assert.doesNotMatch(appSource, /setLoadError\(readableError/);
});

test("page failures return stable errors without echoing supplied text", async () => {
  const { service, contents } = setup();
  const activity = [];
  const tool = createBrowserTool(service, { agentId: "agent-a", sessionKey: "session-a" }, (event) => activity.push(event));
  const secret = "page-echoed-secret-123";
  contents.executeHandler = () => Promise.reject(new Error(`The type target is not editable: ${secret}`));
  const result = await tool.execute("tool-2", { action: "type", tabId: "browser-a", selector: "#button", text: secret }, undefined);
  assert.equal(result.isError, true);
  assert.equal(result.details.code, "action-failed");
  assert.doesNotMatch(result.content[0].text, /page-echoed-secret-123/);
  assert.doesNotMatch(JSON.stringify(activity), /page-echoed-secret-123/);
});

test("the real Pi session accepts the browser custom tool definition", async () => {
  const { service } = setup();
  const tool = createBrowserTool(service, { agentId: "agent-a", sessionKey: "session-a" });
  const agentDir = await mkdtemp(path.join(tmpdir(), "pi-bot-browser-tool-"));
  try {
    const { session } = await createAgentSession({
      cwd: agentDir,
      agentDir,
      noTools: "all",
      tools: ["browser"],
      customTools: [tool],
      sessionManager: SessionManager.inMemory(agentDir),
      settingsManager: SettingsManager.inMemory(),
    });
    assert.deepEqual(session.getActiveToolNames(), ["browser"]);
    assert.equal(session.getToolDefinition("browser")?.name, "browser");
    session.dispose();
  } finally {
    await rm(agentDir, { recursive: true, force: true });
  }
});

test("redacts Browser type text in the persisted SQLite transcript", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "pi-bot-browser-transcript-"));
  const profile = {
    id: "assistant",
    name: "Assistant",
    initials: "AS",
    instructions: "",
    workspace: directory,
    workspaceKind: "external",
    workspaceTrusted: false,
    defaultModelKey: "",
    thinkingLevel: "medium",
    archived: false,
  };
  const database = createAppDatabase(path.join(directory, "pi-bot.sqlite"));
  try {
    database.saveState({ setupComplete: true, executionRiskAccepted: true, activeAgentId: "assistant", thinkingLevel: "medium", agents: [profile], currentSessions: {} });
    const manager = createDatabaseSession({ database, profile, agentId: "assistant" });
    protectBrowserSessionManager(manager);
    const secret = "sqlite-transcript-secret";
    manager.appendMessage({ role: "assistant", content: [{ type: "toolCall", id: "tool-1", name: "browser", arguments: { action: "navigate", tabId: "browser-a", url: "https://example.test/account?token=url-secret#fragment", selector: "#secret", text: secret } }] });
    const entries = database.getSessionEntries(manager.getSessionFile());
    assert.equal(entries.at(-1)?.message?.content?.[0]?.arguments?.text, "[redacted]");
    assert.equal(entries.at(-1)?.message?.content?.[0]?.arguments?.url, "[redacted]");
    assert.equal(entries.at(-1)?.message?.content?.[0]?.arguments?.selector, "[redacted]");
    assert.doesNotMatch(JSON.stringify(entries), /sqlite-transcript-secret|url-secret|#secret/);
  } finally {
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("browser guests retain the existing blocked capabilities", async () => {
  const source = await readFile(new URL("../electron/main.mjs", import.meta.url), "utf8");
  assert.match(source, /delete preferences\.preload/);
  assert.match(source, /preferences\.nodeIntegration = false/);
  assert.match(source, /setWindowOpenHandler\(\(\) => \(\{ action: "deny" \}\)\)/);
  assert.match(source, /on\("will-download", \(event\) => event\.preventDefault\(\)\)/);
  assert.match(source, /setPermissionCheckHandler\(\(\) => false\)/);
  assert.match(source, /setPermissionRequestHandler\([^\n]*callback\(false\)/);
  assert.match(source, /event\.preventDefault\(\)/);
});

test("frame navigation uses Electron 43 details URL while retaining the unsafe URL guard", async () => {
  const source = await readFile(new URL("../electron/main.mjs", import.meta.url), "utf8");
  assert.match(source, /on\("will-frame-navigate", \(details\) => \{ if \(!isAllowedBrowserUrl\(details\.url\)\) details\.preventDefault\(\); \}\)/);
  assert.doesNotMatch(source, /on\("will-frame-navigate", \(event, url\)/);
});
