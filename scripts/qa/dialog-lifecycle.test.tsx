import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitFor(condition: () => void, timeout = 2_000) {
  const deadline = Date.now() + timeout;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      condition();
      return;
    } catch (error) {
      lastError = error;
      await wait(20);
    }
  }

  throw lastError;
}

function DialogHarness() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button">Open dialog</button>
      </DialogTrigger>
      <DialogContent showCloseButton={false}>
        <DialogTitle>Motion lifecycle test</DialogTitle>
        <DialogClose asChild>
          <button type="button">Close dialog</button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}

describe("shared Dialog motion lifecycle", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    const requestAnimationFrame = (callback: FrameRequestCallback): number =>
      window.setTimeout(() => callback(performance.now()), 16);
    vi.stubGlobal("requestAnimationFrame", requestAnimationFrame);
    vi.stubGlobal("cancelAnimationFrame", (handle: number) => window.clearTimeout(handle));
    window.requestAnimationFrame = requestAnimationFrame;
    window.cancelAnimationFrame = (handle) => window.clearTimeout(handle);

    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    act(() => root.render(<DialogHarness />));
  });

  afterEach(() => {
    act(() => root.unmount());
    document.querySelectorAll("[data-motion^=dialog-]").forEach((node) => node.remove());
    host.remove();
    vi.unstubAllGlobals();
  });

  it("restores outside accessibility after the animated close exit", async () => {
    const openButton = host.querySelector("button") as HTMLButtonElement;

    await act(async () => {
      openButton.click();
      await wait(80);
    });

    expect(host.getAttribute("aria-hidden")).toBe("true");
    expect(document.querySelector('[data-motion="dialog-content"]')?.getAttribute("data-state")).toBe("open");

    const closeButton = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "Close dialog",
    ) as HTMLButtonElement;

    await act(async () => {
      closeButton.click();
      await wait(80);
    });

    expect(document.querySelector('[data-motion="dialog-content"]')).not.toBeNull();
    expect(document.querySelector('[data-motion="dialog-content"]')?.getAttribute("data-state")).toBe("closed");

    await waitFor(() => {
      expect(document.querySelector('[data-motion="dialog-content"]')).toBeNull();
    });

    expect(host.hasAttribute("aria-hidden")).toBe(false);
  });
});
