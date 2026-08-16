import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserPanel } from "@/App";

const initialUrl = "https://www.google.com/";
const navigatedUrl = "https://www.google.com/?zx=123";

function BrowserPanelHarness() {
  const [tab, setTab] = React.useState({ id: "browser", kind: "browser" as const, url: initialUrl });
  return <BrowserPanel tab={tab} partition="persist:browser-test" onChange={(next) => setTab((current) => ({ ...current, ...next }))} />;
}

describe("BrowserPanel navigation", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
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

  it("keeps the webview source stable when a same-page navigation updates the saved tab", () => {
    act(() => root.render(<BrowserPanelHarness />));
    const webview = host.querySelector("webview");
    if (!webview) throw new Error("BrowserPanel did not render a webview.");
    Object.assign(webview, {
      getURL: () => navigatedUrl,
      getTitle: () => "Google",
      canGoBack: () => false,
      canGoForward: () => false,
    });

    act(() => webview.dispatchEvent(new Event("did-navigate-in-page")));

    expect(webview.getAttribute("src")).toBe(initialUrl);
  });
});
