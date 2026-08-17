import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "@/App";
import { MotionProvider } from "@/lib/motion";
import type { PiBootstrap, PiBotBridge } from "@/types";

const data: PiBootstrap = {
  activeAgentId: "assistant",
  agents: [{ id: "assistant", name: "Assistant", initials: "🤖", description: "", instructions: "", workspace: "/tmp/pi-bot", workspaceKind: "app", workspaceTrusted: true, defaultModelKey: "test:model", thinkingLevel: "off", archived: false, pinned: false }],
  authenticated: true,
  config: {
    agentId: "assistant", workspace: "/tmp/pi-bot", workspaceKind: "app", workspaceTrusted: true,
    model: "test", modelKey: "test:model", defaultModelKey: "test:model", modelAvailable: true,
    provider: "test", thinkingLevel: "off", availableThinkingLevels: ["off"], streaming: false,
    context: { tokens: 0, contextWindow: 1, percent: 0 }, models: [], tools: [], session: null,
  },
  sessions: [],
  sessionsByAgent: { assistant: [] },
  setup: { required: false, canContinue: true, canImportPiAuth: false, piAuthPath: "", credentialStorage: "protected-app-file", providers: [] },
  transcript: [],
  scheduledJobs: [],
  attention: [],
  attentionUnreadCount: 0,
};

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitFor(condition: () => void) {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    try {
      condition();
      return;
    } catch {
      await wait(20);
    }
  }
  condition();
}

describe("Settings navigation", () => {
  let host: HTMLDivElement;
  let root: Root;
  let bridge: PiBotBridge;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    bridge = new Proxy({
      connect: vi.fn(async () => data),
      getTheme: vi.fn(async () => "dark" as const),
      onEvent: vi.fn(() => () => {}),
      getWorkspacePreferences: vi.fn(async () => null),
      listWorkspaceFiles: vi.fn(async () => []),
      updateAgent: vi.fn(async (profile) => ({ ...data, agents: [profile] })),
    }, {
      get(target, property) {
        return Reflect.get(target, property) ?? vi.fn(async () => data);
      },
    }) as unknown as PiBotBridge;
    Object.defineProperty(window, "piBot", { configurable: true, value: bridge });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  });

  it("opens App Settings from the sidebar button", async () => {
    await act(async () => {
      root.render(<MotionProvider><App /></MotionProvider>);
      await wait(30);
    });
    const settings = host.querySelector('[aria-label="App settings"]') as HTMLButtonElement;
    expect(settings).not.toBeNull();

    await act(async () => {
      settings.click();
      await wait(300);
    });

    await waitFor(() => expect(host.textContent).toContain("App Settings"));
  });

  it("pins an agent from its context menu", async () => {
    await act(async () => {
      root.render(<MotionProvider><App /></MotionProvider>);
      await wait(30);
    });
    const agent = host.querySelector('[aria-label="Assistant"]') as HTMLButtonElement;

    await act(async () => {
      agent.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 40, clientY: 80 }));
      await wait(30);
    });
    const pin = [...document.body.querySelectorAll('[data-slot="context-menu-item"]')]
      .find((item) => item.textContent?.includes("Pin agent")) as HTMLElement;
    expect(pin).not.toBeNull();

    await act(async () => {
      pin.click();
      await wait(30);
    });
    expect(bridge.updateAgent).toHaveBeenCalledWith(expect.objectContaining({ id: "assistant", pinned: true }));
    await waitFor(() => expect(host.querySelector('[title="Pinned"]')).not.toBeNull());
  });
});
