import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Composer, type ComposerPromptMetadata } from "@/App";
import type { ComposerAttachment, PiConfig } from "@/types";

const config: PiConfig = {
  agentId: "agent",
  workspace: "/workspace",
  workspaceKind: "app",
  workspaceTrusted: true,
  model: "Test model",
  modelKey: "test:model",
  defaultModelKey: "test:model",
  modelAvailable: true,
  provider: "test",
  thinkingLevel: "off",
  availableThinkingLevels: ["off"],
  streaming: false,
  context: { tokens: 0, contextWindow: 100, percent: 0 },
  models: [{ key: "test:model", id: "model", name: "Test model", provider: "test", reasoning: false, contextWindow: 100 }],
  tools: [],
  session: { id: "session-1", attachments: [] },
};

const staged = (id: string, name: string, kind: ComposerAttachment["kind"] = "text"): ComposerAttachment => ({
  id,
  cleanupToken: `${id}-cleanup`,
  name,
  mimeType: kind === "image" ? "image/png" : "text/plain",
  kind,
  size: kind === "image" ? 20 : 12,
  status: "pending",
});

function renderComposer(onPrompt = vi.fn(), composerConfig = config) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = (nextConfig: PiConfig) => act(() => root.render(<Composer busy={false} disabled={false} config={nextConfig} onPrompt={onPrompt} onAbort={vi.fn()} onModelChange={vi.fn()} onThinkingChange={vi.fn()} />));
  render(composerConfig);
  return { host, root, onPrompt, rerender: render };
}

function setTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  setter?.call(textarea, value);
  textarea.setSelectionRange(value.length, value.length);
  act(() => textarea.dispatchEvent(new Event("input", { bubbles: true })));
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.setSelectionRange(value.length, value.length);
  act(() => input.dispatchEvent(new Event("input", { bubbles: true })));
}

async function settle() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

function file(name: string, type: string, contents: string) {
  const selected = new File([contents], name, { type });
  Object.defineProperty(selected, "arrayBuffer", { value: async () => new TextEncoder().encode(contents).buffer });
  return selected;
}

describe("composer context staging and mentions", () => {
  let roots: Root[] = [];
  let bridge: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
    HTMLElement.prototype.scrollIntoView = vi.fn();
    bridge = {
      listComposerContext: vi.fn(async () => ({
        sessionId: "session-1",
        workspace: [{ path: "src/App.tsx", kind: "file" as const }, { path: "docs", kind: "folder" as const }],
        skills: [{ id: "review", name: "review", description: "Review the change" }],
      })),
      pickAttachments: vi.fn(async () => [staged("picker", "picked.md")]),
      stageAttachment: vi.fn(async ({ name, mimeType }: { name: string; mimeType?: string }) => staged(`${name}-id`, name, mimeType?.startsWith("image/") ? "image" : "text")),
      removeAttachment: vi.fn(async () => undefined),
      prompt: vi.fn(async () => undefined),
    };
    Object.defineProperty(window, "piBot", { configurable: true, value: bridge });
    await act(async () => { await Promise.resolve(); });
  });

  afterEach(() => {
    for (const root of roots) act(() => root.unmount());
    roots = [];
    document.body.replaceChildren();
    vi.unstubAllGlobals();
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  });

  it("stages files through the picker, drop, and paste paths and removes them accessibly", async () => {
    const result = renderComposer();
    roots.push(result.root);
    await settle();
    await act(async () => { (result.host.querySelector('[aria-label="Attach files"]') as HTMLButtonElement).click(); await Promise.resolve(); });
    expect(bridge.pickAttachments).toHaveBeenCalledOnce();
    expect(result.host.textContent).toContain("picked.md");

    const textarea = result.host.querySelector("textarea") as HTMLTextAreaElement;
    const dropped = file("drop.txt", "text/plain", "drop");
    const drop = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(drop, "dataTransfer", { value: { files: [dropped] } });
    await act(async () => { textarea.dispatchEvent(drop); await Promise.resolve(); });
    expect(bridge.stageAttachment).toHaveBeenCalledWith(expect.objectContaining({ sessionId: "session-1", name: "drop.txt", mimeType: "text/plain", data: expect.any(Uint8Array) }));

    const pasted = file("clipboard.png", "image/png", "image");
    const paste = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(paste, "clipboardData", { value: { files: [pasted] } });
    await act(async () => { textarea.dispatchEvent(paste); await Promise.resolve(); });
    expect(bridge.stageAttachment).toHaveBeenCalledWith(expect.objectContaining({ sessionId: "session-1", name: "clipboard.png", mimeType: "image/png" }));

    const remove = result.host.querySelector('[aria-label="Remove picked.md"]') as HTMLButtonElement;
    await act(async () => { remove.click(); await Promise.resolve(); });
    expect(bridge.removeAttachment).toHaveBeenCalledWith("picker", "session-1", "picker-cleanup");
    expect(result.host.querySelector('[aria-label="Remove picked.md"]')).toBeNull();
  });

  it("keeps cleanup tokens out of the sent prompt metadata", async () => {
    const onPrompt = vi.fn(async (_request: unknown, _metadata?: ComposerPromptMetadata) => undefined);
    const result = renderComposer(onPrompt);
    roots.push(result.root);
    await settle();
    await act(async () => { (result.host.querySelector('[aria-label="Attach files"]') as HTMLButtonElement).click(); await Promise.resolve(); });
    const textarea = result.host.querySelector("textarea") as HTMLTextAreaElement;
    setTextareaValue(textarea, "Review the picked file");
    await act(async () => { (result.host.querySelector("form") as HTMLFormElement).requestSubmit(); await Promise.resolve(); });
    expect(onPrompt).toHaveBeenCalledWith(expect.objectContaining({
      text: "Review the picked file",
      sessionId: "session-1",
      attachmentIds: ["picker"],
    }), expect.objectContaining({
      attachments: [{ id: "picker", name: "picked.md", mimeType: "text/plain", kind: "text", size: 12 }],
    }));
    const metadata = onPrompt.mock.calls[0]?.[1];
    expect(metadata?.attachments[0]).not.toHaveProperty("cleanupToken");
    expect(JSON.stringify(metadata)).not.toContain("picker-cleanup");
  });

  it("does not leak a deferred stage into a new session and rolls it back in the origin", async () => {
    const stageResult = deferred<ComposerAttachment>();
    bridge.listComposerContext
      .mockResolvedValueOnce({ sessionId: "session-a", workspace: [], skills: [] })
      .mockResolvedValueOnce({ sessionId: "session-b", workspace: [], skills: [] });
    bridge.stageAttachment.mockImplementationOnce(async () => stageResult.promise);
    const result = renderComposer(vi.fn(), { ...config, session: { id: "session-a", attachments: [] } });
    roots.push(result.root);
    await settle();
    const textarea = result.host.querySelector("textarea") as HTMLTextAreaElement;
    const drop = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(drop, "dataTransfer", { value: { files: [file("late-a.txt", "text/plain", "late")] } });
    await act(async () => { textarea.dispatchEvent(drop); await Promise.resolve(); });

    result.rerender({ ...config, session: { id: "session-b", attachments: [staged("existing-b", "existing-b.txt")] } });
    await settle();
    expect(result.host.textContent).not.toContain("late-a.txt");
    stageResult.resolve(staged("late-a", "late-a.txt"));
    await settle();
    expect(result.host.textContent).toContain("existing-b.txt");
    expect(result.host.textContent).not.toContain("late-a.txt");
    expect(bridge.removeAttachment).toHaveBeenCalledWith("late-a", "session-a", "late-a-cleanup");
  });

  it("does not leak a deferred picker result into a new session and rolls it back in the origin", async () => {
    const pickerResult = deferred<ComposerAttachment[]>();
    bridge.listComposerContext
      .mockResolvedValueOnce({ sessionId: "session-a", workspace: [], skills: [] })
      .mockResolvedValueOnce({ sessionId: "session-b", workspace: [], skills: [] });
    bridge.pickAttachments.mockImplementationOnce(async () => pickerResult.promise);
    const result = renderComposer(vi.fn(), { ...config, session: { id: "session-a", attachments: [] } });
    roots.push(result.root);
    await settle();
    await act(async () => { (result.host.querySelector('[aria-label="Attach files"]') as HTMLButtonElement).click(); await Promise.resolve(); });
    expect(bridge.pickAttachments).toHaveBeenCalledWith("session-a");

    result.rerender({ ...config, session: { id: "session-b", attachments: [] } });
    await settle();
    expect(result.host.textContent).not.toContain("picked-a.md");
    pickerResult.resolve([staged("picked-a", "picked-a.md")]);
    await settle();
    expect(result.host.textContent).not.toContain("picked-a.md");
    expect(bridge.removeAttachment).toHaveBeenCalledWith("picked-a", "session-a", "picked-a-cleanup");
  });

  it("does not update the composer after an in-flight picker resolves post-unmount", async () => {
    const pickerResult = deferred<ComposerAttachment[]>();
    bridge.listComposerContext.mockResolvedValueOnce({ sessionId: "session-a", workspace: [], skills: [] });
    bridge.pickAttachments.mockImplementationOnce(async () => pickerResult.promise);
    const result = renderComposer(vi.fn(), { ...config, session: { id: "session-a", attachments: [] } });
    roots.push(result.root);
    await settle();
    await act(async () => { (result.host.querySelector('[aria-label="Attach files"]') as HTMLButtonElement).click(); await Promise.resolve(); });
    const rootIndex = roots.indexOf(result.root);
    if (rootIndex >= 0) roots.splice(rootIndex, 1);
    act(() => result.root.unmount());
    pickerResult.resolve([staged("picked-a", "picked-a.md")]);
    await settle();
    expect(bridge.removeAttachment).toHaveBeenCalledWith("picked-a", "session-a", "picked-a-cleanup");
  });

  it("waits for the authoritative session before enabling attachment staging", async () => {
    const contextResult = deferred<{ sessionId: string; workspace: []; skills: [] }>();
    bridge.listComposerContext.mockImplementationOnce(async () => contextResult.promise);
    const result = renderComposer(vi.fn(), { ...config, session: null });
    roots.push(result.root);
    const attach = result.host.querySelector('[aria-label="Attach files"]') as HTMLButtonElement;
    expect(attach.disabled).toBe(true);
    contextResult.resolve({ sessionId: "created-session", workspace: [], skills: [] });
    await settle();
    expect(attach.disabled).toBe(false);
    await act(async () => { attach.click(); await Promise.resolve(); });
    expect(bridge.pickAttachments).toHaveBeenCalledWith("created-session");
  });

  it("opens grouped command search and sends structured workspace and skill context", async () => {
    const onPrompt = vi.fn(async () => undefined);
    const result = renderComposer(onPrompt);
    roots.push(result.root);
    await settle();
    const textarea = result.host.querySelector("textarea") as HTMLTextAreaElement;
    setTextareaValue(textarea, "Inspect @src");
    expect(document.body.querySelector('[data-slot="command"]')).not.toBeNull();
    expect(document.body.textContent).toContain("Workspace");
    expect(document.body.textContent).toContain("Skills");
    expect(document.body.textContent).toContain("src/App.tsx");

    await act(async () => { textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); await Promise.resolve(); });
    expect(textarea.value).toContain("@src/App.tsx ");
    expect(result.host.querySelector('[aria-label="Remove @src/App.tsx"]')).not.toBeNull();

    setTextareaValue(textarea, `${textarea.value}please review`);
    await act(async () => { textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); await Promise.resolve(); });
    expect(onPrompt).toHaveBeenCalledWith(expect.objectContaining({
      text: "Inspect @src/App.tsx please review",
      sessionId: "session-1",
      attachmentIds: [],
      mentions: [{ kind: "workspace", path: "src/App.tsx", type: "file" }],
    }), expect.objectContaining({ workspace: [{ kind: "file", path: "src/App.tsx" }] }));
  });

  it("supports command filtering, arrow selection, and escape recovery", async () => {
    const result = renderComposer();
    roots.push(result.root);
    await settle();
    const textarea = result.host.querySelector("textarea") as HTMLTextAreaElement;
    setTextareaValue(textarea, "@reset");
    setTextareaValue(textarea, "@");
    const commandInput = document.body.querySelector('[data-slot="command-input"]') as HTMLInputElement;
    setInputValue(commandInput, "review");
    expect(document.body.textContent).toContain("@skill:review");
    expect(document.body.textContent).not.toContain("src/App.tsx");
    await act(async () => { commandInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true })); await Promise.resolve(); });
    expect(textarea.value).toContain("@skill:review ");

    setTextareaValue(textarea, "@reset");
    setTextareaValue(textarea, "@");
    const reopenedCommandInput = document.body.querySelector('[data-slot="command-input"]') as HTMLInputElement;
    await act(async () => { reopenedCommandInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await settle(); });
    expect(document.body.querySelector('[data-slot="command"]')).toBeNull();
    expect(document.activeElement).toBe(textarea);

    setTextareaValue(textarea, "@reset");
    setTextareaValue(textarea, "@");
    await act(async () => { textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })); await Promise.resolve(); });
    await act(async () => { textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); await Promise.resolve(); });
    expect(textarea.value).toContain("@docs/ ");

    setTextareaValue(textarea, "@");
    await act(async () => { textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await settle(); });
    expect(document.body.querySelector('[data-slot="command"]')).toBeNull();
    expect(document.activeElement).toBe(textarea);
  });

  it("shows an explicit empty state when no trusted skills are available", async () => {
    bridge.listComposerContext.mockResolvedValueOnce({
      sessionId: "session-1",
      workspace: [{ path: "src/App.tsx", kind: "file" as const }],
      skills: [],
    });
    const result = renderComposer();
    roots.push(result.root);
    await settle();
    const textarea = result.host.querySelector("textarea") as HTMLTextAreaElement;
    setTextareaValue(textarea, "@");
    expect(document.body.querySelector('[data-testid="composer-skills-empty"]')?.textContent).toContain("No trusted skills are available");
  });

  it("removes the selected mention with Backspace and recovers focus", async () => {
    const result = renderComposer();
    roots.push(result.root);
    await settle();
    const textarea = result.host.querySelector("textarea") as HTMLTextAreaElement;
    setTextareaValue(textarea, "@");
    await act(async () => { textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true })); await Promise.resolve(); });
    expect(textarea.value).toContain("@src/App.tsx ");
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    await act(async () => { textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", bubbles: true })); await Promise.resolve(); });
    expect(textarea.value).toBe("");
    expect(result.host.querySelector('[aria-label="Remove @src/App.tsx"]')).toBeNull();
    expect(document.activeElement).toBe(textarea);
  });

  it("removes a selected mention token even after later text was typed", async () => {
    const result = renderComposer();
    roots.push(result.root);
    await settle();
    const textarea = result.host.querySelector("textarea") as HTMLTextAreaElement;
    setTextareaValue(textarea, "Inspect @src");
    await act(async () => { textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); await Promise.resolve(); });
    setTextareaValue(textarea, `${textarea.value}later text`);
    const remove = result.host.querySelector('[aria-label="Remove @src/App.tsx"]') as HTMLButtonElement;
    await act(async () => { remove.click(); await Promise.resolve(); });
    expect(textarea.value).toBe("Inspect later text");
    expect(result.host.querySelector('[aria-label="Remove @src/App.tsx"]')).toBeNull();
  });

  it("rolls back an earlier staged file when a later file is rejected", async () => {
    const onPrompt = vi.fn(async () => undefined);
    const result = renderComposer(onPrompt);
    roots.push(result.root);
    await settle();
    bridge.stageAttachment
      .mockImplementationOnce(async () => staged("first", "first.txt"))
      .mockImplementationOnce(async () => { throw new Error("unsupported format"); });
    const textarea = result.host.querySelector("textarea") as HTMLTextAreaElement;
    const drop = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(drop, "dataTransfer", { value: { files: [file("first.txt", "text/plain", "one"), file("second.bin", "application/octet-stream", "two")] } });
    await act(async () => { textarea.dispatchEvent(drop); await Promise.resolve(); });
    expect(bridge.removeAttachment).toHaveBeenCalledWith("first", "session-1", "first-cleanup");
    expect(result.host.querySelector('[data-slot="attachment-title"]')).toBeNull();
    expect(result.host.querySelector('[role="alert"]')?.textContent).toContain("unsupported format");
    setTextareaValue(textarea, "Do not send a partial request");
    expect((result.host.querySelector('[aria-label="Send message"]') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { (result.host.querySelector("form") as HTMLFormElement).requestSubmit(); await Promise.resolve(); });
    expect(onPrompt).not.toHaveBeenCalled();
  });
});
