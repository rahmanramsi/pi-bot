import { createHash, randomUUID } from "node:crypto";
import { Type } from "typebox";

const browserActions = ["tabs", "read", "navigate", "click", "type", "submit"];
const maxSelectorLength = 800;
const maxTextLength = 20000;
const operationTimeoutMs = 30000;
const browserPartitionPrefix = "persist:pi-bot-browser-";
const browserIsolatedWorldId = 1001;
const tabIdSchema = Type.String({ minLength: 1, maxLength: 160 });
const browserToolParameters = Type.Object({
  action: Type.String({ enum: browserActions }),
  tabId: Type.Optional(tabIdSchema),
  url: Type.Optional(Type.String({ maxLength: 4000 })),
  selector: Type.Optional(Type.String({ minLength: 1, maxLength: maxSelectorLength })),
  text: Type.Optional(Type.String({ maxLength: maxTextLength })),
}, { additionalProperties: false });

export class BrowserAutomationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "BrowserAutomationError";
    this.code = code;
  }
}

export function isAllowedBrowserUrl(value) {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function browserGuestMatchesHost(contents, hostWebContents) {
  return Boolean(contents?.hostWebContents && hostWebContents && contents.hostWebContents.id === hostWebContents.id);
}

export function browserPartitionForSession(sessionKey) {
  const digest = createHash("sha256").update(`pi-bot.workspace-panel:${sessionKey}`).digest("hex");
  return `persist:pi-bot-browser-${digest.slice(0, 32)}`;
}

export function browserPartitionForTab(sessionKey, tabId) {
  const digest = createHash("sha256").update(`pi-bot.workspace-panel:${sessionKey}:tab:${tabId}`).digest("hex");
  return `persist:pi-bot-browser-${digest.slice(0, 32)}`;
}

function sameScope(left, right) {
  return Boolean(left && right && left.agentId === right.agentId && left.sessionKey === right.sessionKey);
}

function scopeKey(scope, tabId) {
  return `${scope.agentId}\u0000${scope.sessionKey}\u0000${tabId}`;
}

function safeTarget(params) {
  if (params.action === "tabs") return "registered tabs";
  if (params.action === "navigate") {
    return safeBrowserUrl(params.url);
  }
  return safeSelector(params.selector || params.tabId);
}

function safeBrowserUrl(value) {
  try {
    return new URL(value).origin;
  } catch {
    return "invalid URL";
  }
}

function safeSelector(value) {
  return String(value)
    .replace(/\[\s*([^\s~|^$*=\]]+)\s*(?:[~|^$*]?=)\s*(?:"[^"]*"|'[^']*'|[^\]\s]+)\s*\]/gi, "[$1]")
    .replace(/#[A-Za-z0-9_-]+/g, "#id")
    .slice(0, 300);
}

export function summarizeBrowserToolCall(params = {}) {
  if (!params || typeof params !== "object") params = {};
  const action = browserActions.includes(params.action) ? params.action : "action";
  return `Browser · ${action} · tab ${String(params.tabId || "unknown").slice(0, 80)} · ${safeTarget({ ...params, action })}`;
}

function normalizeAction(params) {
  if (!params || typeof params !== "object") throw new BrowserAutomationError("invalid-input", "Browser action is invalid.");
  const action = params.action;
  const tabId = typeof params.tabId === "string" ? params.tabId.trim() : "";
  if (!browserActions.includes(action) || action !== "tabs" && (!tabId || tabId.length > 160)) throw new BrowserAutomationError("invalid-input", "Choose a browser action and tab first.");
  const selector = typeof params.selector === "string" ? params.selector.trim() : "";
  if (["click", "type", "submit"].includes(action) && (!selector || selector.length > maxSelectorLength)) throw new BrowserAutomationError("invalid-input", `A CSS selector is required for ${action}.`);
  const text = typeof params.text === "string" ? params.text : "";
  if (action === "type" && text.length > maxTextLength) throw new BrowserAutomationError("invalid-input", "Typed text is too long.");
  const url = typeof params.url === "string" ? params.url.trim() : "";
  if (action === "navigate" && !isAllowedBrowserUrl(url)) throw new BrowserAutomationError("blocked-url", "Only credential-free HTTP(S) URLs can be opened.");
  return { action, tabId, selector, text, url };
}

function abortMessage(signal) {
  return "Browser work was stopped.";
}

function isolatedPageScript(action, selector, text, expectedSignature, pageTarget) {
  const selectorLiteral = JSON.stringify(selector);
  const textLiteral = JSON.stringify(text);
  const expectedLiteral = JSON.stringify(expectedSignature || null);
  const pageTargetLiteral = JSON.stringify(pageTarget || null);
  const shared = String.raw`const formOwner = (node) => node instanceof HTMLFormElement ? node : node?.form || node?.closest?.("form"); const formHasPassword = (form) => Boolean(form && [...form.elements].some((control) => control instanceof HTMLInputElement && control.type === "password")); const passwordBearing = (node) => { const form = formOwner(node); return Boolean(node instanceof HTMLInputElement && node.type === "password" || formHasPassword(form)); }; const authPattern = /\b(?:sign[\s-]*in|log[\s-]*in|log[\s-]*on|oauth|sso|single[\s-]*sign[\s-]*on|passkey|passwordless|webauthn|magic[\s-]*link|one[\s-]*time[\s-]*code|otp|continue\s+with|use\s+(?:a\s+)?(?:passkey|google|apple|github|microsoft))\b/i; const authAttributePattern = /\b(?:username|current-password|new-password|one-time-code|webauthn)\b/i; const authenticationControl = (node) => { const form = formOwner(node); const values = [node.getAttribute("aria-label"), node.getAttribute("autocomplete"), node.getAttribute("name"), node.getAttribute("id"), node.getAttribute("title"), node.getAttribute("href"), node.getAttribute("value"), node.textContent, form?.getAttribute("autocomplete"), form?.getAttribute("action"), form?.getAttribute("name"), form?.getAttribute("id"), form?.textContent]; const attributes = values.filter((value) => typeof value === "string").join(" "); return authPattern.test(attributes) || authAttributePattern.test(attributes); }; const visible = (node) => { if (!(node instanceof HTMLElement)) return false; if (node instanceof HTMLInputElement && node.type === "hidden") return false; for (let current = node; current; current = current.parentElement) { if (current.hasAttribute("hidden") || current.getAttribute("aria-hidden") === "true") return false; const style = getComputedStyle(current); if (style.visibility === "hidden" || style.display === "none" || Number.parseFloat(style.opacity || "1") <= 0) return false; } const rect = node.getBoundingClientRect(); const hasViewportRect = [rect.top, rect.left, rect.right, rect.bottom].every(Number.isFinite); const inViewport = !hasViewportRect || rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth; return rect.width > 0 && rect.height > 0 && inViewport; }; const unobscured = (node) => { const rect = node.getBoundingClientRect(); const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2); return Boolean(hit && (hit === node || node.contains(hit))); }; const disabled = (node) => Boolean(node.hasAttribute("disabled") || node.matches(":disabled") || node.getAttribute("aria-disabled") === "true" || node.closest("fieldset:disabled, fieldset[disabled], form[disabled], form[aria-disabled='true']")); const signature = (node) => ({ tag: node.tagName.toLowerCase(), role: node.getAttribute("role") || "", type: node.getAttribute("type") || "", name: node.getAttribute("name") || "", label: node.getAttribute("aria-label") || node.textContent?.trim().slice(0, 160) || "", placeholder: node.getAttribute("placeholder") || "", href: node instanceof HTMLAnchorElement ? (() => { try { return new URL(node.href).origin; } catch { return ""; } })() : "" }); const matchesSignature = (node, expected) => !expected || Object.entries(expected).every(([key, value]) => signature(node)[key] === value); const resolveTarget = () => ${pageTarget ? `window.__piBotBrowserTargets?.get(${pageTargetLiteral})` : `document.querySelector(${selectorLiteral})`}; const ensure = (node) => { if (!(node instanceof HTMLElement) || !node.isConnected || !visible(node) || disabled(node) || passwordBearing(node) || authenticationControl(node) || !unobscured(node)) throw new Error("The ${action} target is not visible or enabled."); if (!matchesSignature(node, ${expectedLiteral})) throw new Error("The ${action} target changed."); return node; };`;
  if (action === "read") return `(() => { ${shared} window.__piBotBrowserTargets = new Map(); window.__piBotBrowserTargetSequence = 0; const targetFor = (node) => { const parts = []; for (let current = node; current && current !== document.body && parts.length < 8; current = current.parentElement) { const siblings = [...(current.parentElement?.children || [])].filter((peer) => peer.tagName === current.tagName); parts.unshift(current.tagName.toLowerCase() + ":nth-of-type(" + Math.max(1, siblings.indexOf(current) + 1) + ")"); } const selector = parts.join(" > ").slice(0, 240); const sequence = window.__piBotBrowserTargetSequence + 1; window.__piBotBrowserTargetSequence = sequence; const pageTarget = "pi-target-" + sequence; window.__piBotBrowserTargets.set(pageTarget, node); return { selector, pageTarget }; }; const describe = (node) => { const target = targetFor(node); return { target: target.selector, pageTarget: target.pageTarget, ...signature(node), disabled: disabled(node) }; }; const pageUrl = (() => { try { return new URL(location.href).origin; } catch { return "Browser page"; } })(); return { url: pageUrl, title: document.title, text: (document.body?.innerText || "").slice(0, 20000), elements: [...document.querySelectorAll("a,button,input,textarea,select,form,[role=button],[role=link]")].filter((node) => visible(node) && !passwordBearing(node) && !authenticationControl(node)).slice(0, 200).map(describe) }; })()`;
  if (action === "click") return `(() => { ${shared} const node = resolveTarget(); const control = node?.closest("a,button,input,select,textarea,[role=button],[role=link]"); if (!control) throw new Error("The click target is not a normal control."); ensure(control); control.focus(); control.click(); return true; })()`;
  if (action === "type") return `(() => { ${shared} const node = resolveTarget(); ensure(node); if (!(node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement || node instanceof HTMLSelectElement || node instanceof HTMLElement && (node.isContentEditable || node.getAttribute("contenteditable") === "true"))) throw new Error("The type target is not editable."); if (node instanceof HTMLElement && !(node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement || node instanceof HTMLSelectElement)) node.textContent = ${textLiteral}; else { const prototype = node instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : node instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype; const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set; if (!setter) throw new Error("The type target is not editable."); setter.call(node, ${textLiteral}); } node.dispatchEvent(new Event("input", { bubbles: true, composed: true })); node.dispatchEvent(new Event("change", { bubbles: true, composed: true })); return true; })()`;
  return `(() => { ${shared} const control = ensure(resolveTarget()); if (control instanceof HTMLFormElement) { control.requestSubmit(); return true; } if (control instanceof HTMLButtonElement || control instanceof HTMLInputElement && ["submit", "image"].includes(control.type)) { control.click(); return true; } throw new Error("The submit target is not a form or submit control."); })()`;
}

function friendlyError(error, action) {
  if (error instanceof BrowserAutomationError) {
    if (error.code === "action-failed") return new BrowserAutomationError("action-failed", `Browser ${action} failed.`);
    return error;
  }
  return new BrowserAutomationError("action-failed", `Browser ${action} failed.`);
}

function stableAbortError(reason) {
  if (reason instanceof BrowserAutomationError && reason.code === "closed") return new BrowserAutomationError("closed", "The browser tab or session is closed.");
  return new BrowserAutomationError("stopped", abortMessage());
}

function targetSignature(element) {
  return {
    tag: element?.tag || "",
    role: element?.role || "",
    type: element?.type || "",
    name: element?.name || "",
    label: element?.label || "",
    placeholder: element?.placeholder || "",
    href: element?.href || "",
  };
}

export function redactBrowserToolMessage(message) {
  if (!message || message.role !== "assistant" || !Array.isArray(message.content)) return message;
  let changed = false;
  const content = message.content.map((part) => {
    if (part?.type !== "toolCall" || part.name !== "browser" || !part.arguments || typeof part.arguments !== "object") return part;
    const argumentsCopy = { ...part.arguments };
    let partChanged = false;
    for (const key of ["text", "url", "selector"]) {
      if (!Object.hasOwn(argumentsCopy, key)) continue;
      argumentsCopy[key] = "[redacted]";
      partChanged = true;
    }
    if (!partChanged) return part;
    changed = true;
    return { ...part, arguments: argumentsCopy };
  });
  return changed ? { ...message, content } : message;
}

export function protectBrowserSessionManager(manager) {
  if (!manager || typeof manager.appendMessage !== "function") return manager;
  const appendMessage = manager.appendMessage.bind(manager);
  manager.appendMessage = (message) => appendMessage(redactBrowserToolMessage(message));
  return manager;
}

function raceAbort(promise, signal, timeoutMs, onTimeout = () => {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (value, failed = false) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      failed ? reject(value) : resolve(value);
    };
    const onAbort = () => finish(stableAbortError(signal?.reason), true);
    const timer = setTimeout(() => {
      const error = new BrowserAutomationError("timeout", "The browser action timed out.");
      finish(error, true);
      onTimeout(error);
    }, timeoutMs);
    if (signal?.aborted) return onAbort();
    signal?.addEventListener("abort", onAbort, { once: true });
    Promise.resolve(promise).then((value) => finish(value), (error) => finish(error, true));
  });
}

export function createBrowserAutomationService({ timeoutMs = operationTimeoutMs } = {}) {
  const attached = new Map();
  const tabs = new Map();
  const targets = new Map();
  const pending = new Set();
  let activeScope;
  let generation = 0;

  function clearTargetHandles(tabKey) {
    for (const [handle, target] of targets) if (target.tabKey === tabKey) targets.delete(handle);
  }

  function invalidateTabTargets(tab) {
    if (!tab) return;
    tab.pageGeneration += 1;
    clearTargetHandles(tab.key);
  }

  function invalidateScope(scope) {
    for (const [key, tab] of tabs) {
      if (!sameScope(tab, scope)) continue;
      tabs.delete(key);
      clearTargetHandles(key);
      const guest = attached.get(tab.webContentsId);
      if (guest?.tabKey === key) guest.retired = true;
    }
  }

  function stopContents(contents) {
    try { contents.stop?.(); } catch { /* The guest may already be gone. */ }
  }

  function stop() {
    generation += 1;
    for (const operation of pending) {
      operation.controller.abort(new BrowserAutomationError("stopped", "Browser work was stopped."));
      try { operation.contents.stop?.(); } catch { /* The guest may already be gone. */ }
    }
  }

  function destroyWebContents(webContentsId) {
    attached.delete(webContentsId);
    for (const [key, tab] of tabs) {
      if (tab.webContentsId !== webContentsId) continue;
      tabs.delete(key);
      for (const [handle, target] of targets) if (target.tabKey === key) targets.delete(handle);
      for (const operation of pending) if (operation.tab === tab) operation.controller.abort(new BrowserAutomationError("closed", "The browser tab was closed."));
    }
  }

  return {
    attachWebContents(contents, partition) {
      if (!contents || !Number.isInteger(contents.id) || typeof partition !== "string" || !partition.startsWith(browserPartitionPrefix) || typeof contents.getType !== "function" || contents.getType() !== "webview") return;
      const existing = attached.get(contents.id);
      if (existing) {
        if (existing.partition === partition && existing.retired && !contents.isDestroyed?.()) {
          existing.retired = false;
          existing.tabKey = undefined;
        }
        return;
      }
      attached.set(contents.id, { contents, partition, tabKey: undefined, retired: false });
      contents.once?.("destroyed", () => destroyWebContents(contents.id));
      const invalidate = () => {
        const tab = [...tabs.values()].find((entry) => entry.webContentsId === contents.id);
        invalidateTabTargets(tab);
      };
      for (const eventName of ["will-navigate", "did-navigate", "did-navigate-in-page", "did-frame-navigate", "did-redirect-navigation", "did-finish-load"]) contents.on?.(eventName, invalidate);
    },
    activateScope(scope) {
      if (!scope || typeof scope.agentId !== "string" || typeof scope.sessionKey !== "string") throw new BrowserAutomationError("invalid-scope", "The browser session is unavailable.");
      if (!sameScope(activeScope, scope)) {
        stop();
        invalidateScope(activeScope);
        activeScope = { agentId: scope.agentId, sessionKey: scope.sessionKey };
      }
    },
    clearActiveScope() {
      stop();
      invalidateScope(activeScope);
      activeScope = undefined;
    },
    registerTab({ tabId, sessionKey, partition }) {
      if (typeof tabId !== "string" || !tabId.trim() || tabId.length > 160 || typeof sessionKey !== "string" || !sessionKey || sessionKey.length > 2000 || typeof partition !== "string") throw new BrowserAutomationError("invalid-input", "Browser tab registration is invalid.");
      if (!activeScope || activeScope.sessionKey !== sessionKey) throw new BrowserAutomationError("session-isolation", "This browser tab does not belong to the active chat session.");
      if (partition !== browserPartitionForTab(sessionKey, tabId)) throw new BrowserAutomationError("session-isolation", "The browser tab partition does not match the active chat session.");
      const key = scopeKey(activeScope, tabId);
      if (tabs.has(key)) return { tabId };
      const available = [...attached.values()].filter((entry) => entry.partition === partition && !entry.tabKey && !entry.retired && !entry.contents.isDestroyed?.());
      const guest = available.length === 1 ? available[0] : undefined;
      if (!guest) throw new BrowserAutomationError("tab-missing", "The browser tab is not attached for this chat session.");
      guest.tabKey = key;
      tabs.set(key, { ...activeScope, tabId, key, webContentsId: guest.contents.id, contents: guest.contents, partition, pageGeneration: 0 });
      return { tabId };
    },
    unregisterTab({ tabId, sessionKey }) {
      if (!activeScope || activeScope.sessionKey !== sessionKey) return;
      const key = scopeKey(activeScope, tabId);
      const tab = tabs.get(key);
      tabs.delete(key);
      clearTargetHandles(key);
      const guest = tab && attached.get(tab.webContentsId);
      if (guest?.tabKey === key) guest.retired = true;
      for (const operation of pending) {
        if (operation.tab !== tab) continue;
        operation.controller.abort(new BrowserAutomationError("closed", "The browser tab was closed."));
        stopContents(operation.contents);
      }
    },
    stop,
    async execute(params, signal, scope) {
      const action = normalizeAction(params);
      if (!sameScope(activeScope, scope)) throw new BrowserAutomationError("session-isolation", "Browser work is limited to the active agent chat session.");
      if (signal?.aborted) throw new BrowserAutomationError("stopped", "Browser work was stopped.");
      if (action.action === "tabs") return { tabs: [...tabs.values()].filter((tab) => sameScope(tab, scope)).map((tab) => ({ tabId: tab.tabId })) };
      const tab = tabs.get(scopeKey(scope, action.tabId));
      if (!tab || tab.contents.isDestroyed?.()) throw new BrowserAutomationError("tab-missing", "The browser tab is closed or not registered.");
      const controller = new AbortController();
      const abortFromCaller = () => {
        controller.abort(new BrowserAutomationError("stopped", "Browser work was stopped."));
        stopContents(tab.contents);
      };
      signal?.addEventListener("abort", abortFromCaller, { once: true });
      const operation = { controller, contents: tab.contents, tab };
      pending.add(operation);
      const check = () => {
        if (controller.signal.aborted) throw new BrowserAutomationError("stopped", abortMessage(controller.signal));
        if (generation !== operation.generation || !sameScope(activeScope, scope) || tab.contents.isDestroyed?.()) throw new BrowserAutomationError("closed", "The browser tab or session is no longer active.");
      };
      operation.generation = generation;
      try {
        const target = action.action === "read" || action.action === "navigate"
          ? null
          : targets.get(action.selector);
        const targetGeneration = tab.pageGeneration;
        if (!target && typeof action.selector === "string" && action.selector.startsWith("browser-target:")) throw new BrowserAutomationError("stale-target", "The browser target is no longer available.");
        if (target && (target.tabKey !== operation.tab.key || target.pageGeneration !== targetGeneration)) throw new BrowserAutomationError("stale-target", "The browser target is no longer available.");
        const checkTargetGeneration = () => {
          if (target && tab.pageGeneration !== targetGeneration) throw new BrowserAutomationError("stale-target", "The browser target is no longer available.");
        };
        check();
        const selector = target?.selector ?? action.selector;
        const expectedSignature = target?.signature ?? null;
        const pageTarget = target?.pageTarget ?? null;
        const work = Promise.resolve().then(() => {
          check();
          checkTargetGeneration();
          return action.action === "navigate"
            ? Promise.resolve(tab.contents.loadURL(action.url)).then(() => ({ url: safeBrowserUrl(action.url) }))
            : (() => {
              if (typeof tab.contents.executeJavaScriptInIsolatedWorld !== "function") throw new BrowserAutomationError("action-failed", "Browser automation is unavailable for this tab.");
              return tab.contents.executeJavaScriptInIsolatedWorld(browserIsolatedWorldId, [{ code: isolatedPageScript(action.action, selector, action.text, expectedSignature, pageTarget) }], true);
            })();
        });
        const result = await raceAbort(work, controller.signal, timeoutMs, (error) => {
          controller.abort(error);
          stopContents(tab.contents);
        });
        check();
        if (action.action === "navigate") {
          invalidateTabTargets(tab);
        }
        if (action.action !== "read") return result;
        if (!Array.isArray(result?.elements)) return result;
        clearTargetHandles(operation.tab.key);
        const elements = result.elements.map((element) => {
          const handle = `browser-target:${randomUUID()}`;
          targets.set(handle, {
            tabKey: operation.tab.key,
            pageGeneration: tab.pageGeneration,
            selector: element.target,
            pageTarget: element.pageTarget,
            signature: targetSignature(element),
          });
          const { pageTarget: _pageTarget, ...publicElement } = element;
          return { ...publicElement, target: handle };
        });
        return { ...result, elements };
      } catch (error) {
        throw friendlyError(error, action.action);
      } finally {
        pending.delete(operation);
        signal?.removeEventListener("abort", abortFromCaller);
      }
    },
  };
}

function resultText(params, result) {
  if (params.action === "tabs") return `Browser tabs: ${result.tabs.map((tab) => tab.tabId).join(", ") || "none"}.`;
  if (params.action === "read") return JSON.stringify(result) ?? "Browser page read.";
  if (params.action === "navigate") return `Navigated browser tab ${params.tabId} to ${safeTarget(params)}.`;
  if (params.action === "click") return `Clicked ${safeSelector(params.selector)} in browser tab ${params.tabId}.`;
  if (params.action === "type") return `Typed text into ${safeSelector(params.selector)} in browser tab ${params.tabId}.`;
  return `Submitted ${safeSelector(params.selector)} in browser tab ${params.tabId}.`;
}

function toolErrorText(error, action) {
  if (!(error instanceof BrowserAutomationError)) return `Browser ${action} failed.`;
  if (error.code === "action-failed") return `Browser ${action} failed.`;
  if (error.code === "invalid-input") return "Choose a valid browser action and target.";
  if (error.code === "blocked-url") return "Only credential-free HTTP(S) URLs can be opened.";
  if (error.code === "session-isolation") return "Browser work is limited to the active agent chat session.";
  if (error.code === "tab-missing") return "The browser tab is closed or not registered.";
  if (error.code === "stopped") return "Browser work was stopped.";
  if (error.code === "timeout") return "The browser action timed out.";
  if (error.code === "stale-target") return "The browser target is no longer available.";
  if (error.code === "closed") return "The browser tab or session is closed.";
  return `Browser ${action} failed.`;
}

export function createBrowserTool(service, scope, onActivity = () => {}) {
  const activity = (phase, params = {}, failed = false) => onActivity({ phase, failed, action: params.action, tabId: params.tabId, detail: summarizeBrowserToolCall(params), scope });
  return {
    name: "browser",
    label: "Browser",
    description: "Discover and operate Browser tabs in the active chat session through visible page UI.",
    promptSnippet: "Discover and operate Browser tabs",
    promptGuidelines: ["Call tabs first to discover available Browser tab IDs, then read to get visible controls and stable targets.", "Use browser only for visible page content and normal UI controls.", "Never request cookies, storage, passwords, or credential APIs."],
    parameters: browserToolParameters,
    executionMode: "sequential",
    async execute(_toolCallId, params, signal) {
      activity("start", params);
      try {
        const result = await service.execute(params, signal, scope);
        activity("end", params);
        return { content: [{ type: "text", text: resultText(params, result) }], details: { action: params.action, tabId: params.tabId } };
      } catch (error) {
        activity("end", params, true);
        const action = browserActions.includes(params?.action) ? params.action : "action";
        const message = toolErrorText(error, action);
        const code = error instanceof BrowserAutomationError ? error.code : "action-failed";
        throw new BrowserAutomationError(code, message);
      }
    },
  };
}
