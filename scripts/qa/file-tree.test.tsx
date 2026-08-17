import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FilesSidebar } from "@/App";
import type { PiBotBridge, WorkspaceFile } from "@/types";

const wait = (milliseconds = 0) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function file(path: string): WorkspaceFile {
  return { path, kind: "file" };
}

function folder(path: string): WorkspaceFile {
  return { path, kind: "folder" };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => { resolve = nextResolve; });
  return { promise, resolve };
}

describe("FilesSidebar", () => {
  let host: HTMLDivElement;
  let root: Root;
  let bridge: PiBotBridge;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
    bridge = {
      listWorkspaceFiles: vi.fn(async () => [
        file("src/components/App.tsx"), file("src/components/other.ts"), file("src/components/views/App.tsx"),
        folder("src/components"), folder("src/components/views"), folder("src"),
        file("lib/App.test.tsx"), file("lib/other.md"), folder("lib"),
        file("packages/match.txt"), file("packages/ignore.txt"), folder("packages"), file("README.md"),
      ]),
      openWorkspaceFile: vi.fn(async () => {}),
    } as unknown as PiBotBridge;
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

  async function render(workspace = "/workspace") {
    await act(async () => {
      root.render(<FilesSidebar workspace={workspace} />);
      await wait();
    });
  }

  it("renders the primitive hierarchy with controlled expansion and file selection", async () => {
    await render();
    const tree = host.querySelector('[role="tree"]');
    expect(tree).not.toBeNull();
    expect(tree?.getAttribute("aria-label")).toBe("Workspace files");

    const sourceFolder = host.querySelector('[data-path="src"]') as HTMLDivElement;
    expect(sourceFolder.getAttribute("aria-expanded")).toBe("false");
    const expand = sourceFolder.querySelector('[data-slot="collapsible-trigger"]') as HTMLSpanElement;
    await act(async () => {
      expand.click();
      await wait();
    });
    expect(sourceFolder.getAttribute("aria-expanded")).toBe("true");

    const nestedFolder = host.querySelector('[data-path="src/components"]') as HTMLDivElement;
    expect(nestedFolder).not.toBeNull();
    await act(async () => {
      (nestedFolder.querySelector('[data-slot="collapsible-trigger"]') as HTMLSpanElement).click();
      await wait();
    });
    const selectedFile = host.querySelector('[data-path="src/components/App.tsx"]') as HTMLDivElement;
    expect(selectedFile).not.toBeNull();
    await act(async () => selectedFile.click());
    expect(bridge.openWorkspaceFile).toHaveBeenCalledWith("src/components/App.tsx");
    expect(selectedFile.getAttribute("aria-selected")).toBe("true");
  });

  it("supports keyboard selection and arrow expansion", async () => {
    await render();
    const treeItems = () => [...host.querySelectorAll<HTMLElement>('[role="treeitem"][data-file-tree-path]')];
    const item = (path: string) => host.querySelector(`[data-path="${path}"]`) as HTMLDivElement;
    const press = async (path: string, key: string) => {
      await act(async () => {
        item(path).dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
        await wait();
      });
    };
    expect(treeItems().filter((candidate) => candidate.tabIndex === 0)).toHaveLength(1);
    item("src").focus();
    expect(document.activeElement).toBe(item("src"));
    await press("src", "ArrowDown");
    expect(document.activeElement).toBe(item("lib"));
    await press("lib", "ArrowUp");
    expect(document.activeElement).toBe(item("src"));
    await press("src", "ArrowRight");
    expect(item("src").getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(item("src"));
    await press("src", "ArrowRight");
    expect(document.activeElement).toBe(item("src/components"));
    await press("src/components", "ArrowRight");
    expect(item("src/components").getAttribute("aria-expanded")).toBe("true");
    await press("src/components", "ArrowRight");
    expect(document.activeElement).toBe(item("src/components/App.tsx"));
    await press("src/components/App.tsx", "ArrowLeft");
    expect(document.activeElement).toBe(item("src/components"));
    await press("src/components", "ArrowLeft");
    expect(item("src/components").getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(item("src/components"));
    await press("src/components", "ArrowLeft");
    expect(document.activeElement).toBe(item("src"));
    await press("src", "ArrowLeft");
    expect(item("src").getAttribute("aria-expanded")).toBe("false");
    await press("src", "End");
    expect(document.activeElement).toBe(item("README.md"));
    await press("README.md", "Home");
    expect(document.activeElement).toBe(item("src"));
    await press("src", "Enter");
    expect(item("src").getAttribute("aria-selected")).toBe("true");
    expect(bridge.openWorkspaceFile).not.toHaveBeenCalled();
    const readme = item("README.md");
    await act(async () => readme.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(bridge.openWorkspaceFile).toHaveBeenCalledWith("README.md");
    expect(readme.getAttribute("aria-selected")).toBe("true");
    await act(async () => readme.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true })));
    expect(bridge.openWorkspaceFile).toHaveBeenCalledTimes(2);
  });

  it("filters descendants, refreshes, and replaces data when the workspace changes", async () => {
    await render();
    const input = host.querySelector('input[aria-label="Filter files"]') as HTMLInputElement;
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    valueSetter?.call(input, "App");
    await act(async () => {
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await wait();
    });
    expect(host.querySelector('[data-path="src"]')).not.toBeNull();
    expect(host.querySelector('[data-path="src/components/App.tsx"]')).not.toBeNull();
    expect(host.querySelector('[data-path="src/components/views/App.tsx"]')).not.toBeNull();
    expect(host.textContent).not.toContain("README.md");
    valueSetter?.call(input, "");
    await act(async () => {
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await wait();
    });

    const refreshed = [folder("docs"), file("docs/guide.md")];
    (bridge.listWorkspaceFiles as ReturnType<typeof vi.fn>).mockResolvedValueOnce(refreshed);
    await act(async () => {
      (host.querySelector('button[aria-label="Refresh files"]') as HTMLButtonElement).click();
      await wait();
    });
    expect(host.textContent).toContain("docs");
    expect(host.textContent).not.toContain("App.tsx");

    const switched = [file("notes.md")];
    (bridge.listWorkspaceFiles as ReturnType<typeof vi.fn>).mockResolvedValueOnce(switched);
    await act(async () => {
      root.render(<FilesSidebar workspace="/other-workspace" />);
      await wait();
    });
    expect(host.textContent).toContain("notes.md");
    expect(host.textContent).not.toContain("docs");
  });

  it("keeps matching branches while omitting unrelated folder descendants", async () => {
    await render();
    const input = host.querySelector('input[aria-label="Filter files"]') as HTMLInputElement;
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    valueSetter?.call(input, "App");
    await act(async () => {
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await wait();
    });
    expect(host.querySelector('[data-path="src"]')).not.toBeNull();
    expect(host.querySelector('[data-path="lib"]')).not.toBeNull();
    expect(host.querySelector('[data-path="src/components/App.tsx"]')).not.toBeNull();
    expect(host.querySelector('[data-path="src/components/views/App.tsx"]')).not.toBeNull();
    expect(host.querySelector('[data-path="src/components/views"]')?.getAttribute("aria-expanded")).toBe("true");
    expect(host.querySelector('[data-path="lib/App.test.tsx"]')).not.toBeNull();
    expect(host.textContent).not.toContain("other.ts");
    expect(host.textContent).not.toContain("other.md");

    valueSetter?.call(input, "packages");
    await act(async () => {
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await wait();
    });
    expect(host.querySelector('[data-path="packages"]')).not.toBeNull();
    expect(host.querySelector('[data-path="packages/match.txt"]')).toBeNull();
    expect(host.querySelector('[data-path="packages/ignore.txt"]')).toBeNull();
  });

  it("ignores a deferred refresh response after switching workspaces", async () => {
    await render("/workspace-one");
    const refresh = deferred<WorkspaceFile[]>();
    const switched = deferred<WorkspaceFile[]>();
    (bridge.listWorkspaceFiles as ReturnType<typeof vi.fn>)
      .mockImplementationOnce(() => refresh.promise)
      .mockImplementationOnce(() => switched.promise);

    await act(async () => {
      (host.querySelector('button[aria-label="Refresh files"]') as HTMLButtonElement).click();
      await wait();
    });
    await act(async () => {
      root.render(<FilesSidebar workspace="/workspace-two" />);
      await wait();
    });
    await act(async () => {
      switched.resolve([file("workspace-two.md")]);
      await wait();
    });
    expect(host.textContent).toContain("workspace-two.md");

    await act(async () => {
      refresh.resolve([file("stale-workspace-one.md")]);
      await wait();
    });
    expect(host.textContent).toContain("workspace-two.md");
    expect(host.textContent).not.toContain("stale-workspace-one.md");
  });

  it("keeps loading, error, and empty states user-visible", async () => {
    (bridge.listWorkspaceFiles as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("Workspace unavailable"));
    await render();
    expect(host.textContent).toContain("Workspace unavailable");

    (bridge.listWorkspaceFiles as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    await act(async () => {
      (host.querySelector('button[aria-label="Refresh files"]') as HTMLButtonElement).click();
      await wait();
    });
    expect(host.textContent).toContain("No files yet");
  });
});
