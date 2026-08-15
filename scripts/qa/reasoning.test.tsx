import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appendReasoningDelta, finishReasoning, ReasoningRow, startReasoning } from "@/App";
import type { PiBootstrap, TimelineItem } from "@/types";

function bootstrap(): PiBootstrap {
  return {
    transcript: [],
    agents: [],
    activeAgentId: null,
  } as unknown as PiBootstrap;
}

describe("reasoning stream state", () => {
  it("consolidates multiple thinking blocks and marks the result done", () => {
    let data = startReasoning(bootstrap(), "reasoning-1");
    data = appendReasoningDelta(data, "reasoning-1", "Inspect the request");
    data = startReasoning(data, "reasoning-1");
    data = appendReasoningDelta(data, "reasoning-1", "Verify the result");
    data = finishReasoning(data, "reasoning-1");

    expect(data?.transcript).toEqual([
      expect.objectContaining({
        id: "reasoning-1",
        kind: "reasoning",
        body: "Inspect the request\n\nVerify the result",
        status: "done",
      }),
    ]);
  });

  it("removes a reasoning block that never receives readable text", () => {
    const data = finishReasoning(startReasoning(bootstrap(), "reasoning-empty"), "reasoning-empty");
    expect(data?.transcript).toEqual([]);
  });
});

describe("ReasoningRow", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.useRealTimers();
  });

  it("renders reasoning as flat narrative text without a nested disclosure", () => {
    const item: TimelineItem = {
      id: "reasoning-live",
      kind: "reasoning",
      label: "Reasoning",
      body: "Inspecting the current state.",
      status: "running",
      timestamp: "10:00 AM",
    };

    act(() => root.render(<ReasoningRow item={item} />));
    expect(host.querySelector('[data-slot="collapsible-trigger"]')).toBeNull();
    expect(host.textContent).toContain("Inspecting the current state.");

    act(() => root.render(<ReasoningRow item={{ ...item, status: "done" }} />));
    expect(host.textContent).toContain("Inspecting the current state.");
  });
});
