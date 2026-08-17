/// <reference types="node" />

import { act } from "react";
import { readFileSync } from "node:fs";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActivityGroup, Composer, groupConversationItems, MarkdownContent, timelineToolStatus } from "@/App";
import { markdownMermaidConfig } from "@/components/ai-elements/message";
import { Conversation, ConversationContent } from "@/components/ai-elements/conversation";
import {
  Message,
  MessageBranch,
  MessageBranchContent,
  MessageBranchNext,
  MessageBranchPage,
  MessageBranchPrevious,
  MessageBranchSelector,
  MessageContent,
  MessageResponse,
  MessageToolbar,
} from "@/components/ai-elements/message";
import { Task, TaskContent, TaskTrigger } from "@/components/ai-elements/task";
import { Terminal } from "@/components/ai-elements/terminal";
import { Tool, ToolContent, ToolHeader, ToolOutput } from "@/components/ai-elements/tool";
import type { PiConfig, TimelineItem } from "@/types";
import kitchenSink from "./fixtures/markdown-kitchen-sink.md?raw";

const markdownStyles = readFileSync("src/styles.css", "utf8");

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
  streaming: true,
  context: { tokens: 10, contextWindow: 100, percent: 10 },
  models: [{ key: "test:model", id: "model", name: "Test model", provider: "test", reasoning: false, contextWindow: 100 }],
  tools: [],
  session: null,
};

const toolItem = (status: TimelineItem["status"]): TimelineItem => ({
  id: `tool-${status}`,
  kind: "tool",
  label: "Tool · bash",
  body: "done",
  input: '{"command":"pwd"}',
  status,
  timestamp: "10:00 AM",
});

function render(element: React.ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(element));
  return { host, root };
}

describe("AI Elements renderer adapters", () => {
  let roots: Root[] = [];
  let markdownStyle: HTMLStyleElement | null = null;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    markdownStyle = document.createElement("style");
    markdownStyle.textContent = markdownStyles;
    document.head.append(markdownStyle);
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
    roots = [];
  });

  afterEach(() => {
    for (const root of roots) act(() => root.unmount());
    document.body.replaceChildren();
    markdownStyle?.remove();
    markdownStyle = null;
    document.documentElement.removeAttribute("data-theme");
    vi.unstubAllGlobals();
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  });

  it("maps real TimelineItem states to the three Tool states", () => {
    expect(timelineToolStatus(toolItem("running"))).toBe("running");
    expect(timelineToolStatus(toolItem("done"))).toBe("completed");
    expect(timelineToolStatus(toolItem("failed"))).toBe("failed");
    expect(timelineToolStatus(toolItem(undefined))).toBe("completed");

    const result = render(<Tool status="failed"><ToolHeader title="Ran command" status="failed" /><ToolContent><ToolOutput output="stderr" errorText="stderr" /></ToolContent></Tool>);
    roots.push(result.root);
    expect(result.host.querySelector('[data-slot="tool"]')?.getAttribute("data-status")).toBe("failed");
    expect(result.host.textContent).toContain("Error");
  });

  it("uses an accessible, open-by-default Task disclosure", () => {
    const result = render(<Task><TaskTrigger title="Working details" /><TaskContent>Activity details</TaskContent></Task>);
    roots.push(result.root);
    const trigger = result.host.querySelector('[data-slot="task-trigger"]') as HTMLButtonElement;

    expect(trigger.tagName).toBe("BUTTON");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(result.host.textContent).toContain("Activity details");
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    act(() => trigger.click());
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(result.host.textContent).not.toContain("Activity details");
  });

  it("labels the disclosure with elapsed working time", () => {
    const startedAt = new Date("2026-08-15T10:00:00.000Z").getTime();
    const completed = render(<ActivityGroup items={[toolItem("done")]} startedAt={startedAt} endedAt={startedAt + 445_000} />);
    roots.push(completed.root);
    expect(completed.host.textContent).toContain("Working for 7m 25s");
    expect(completed.host.textContent).not.toContain("Agent activity");
    expect(completed.host.textContent).not.toContain("step completed");
  });

  it("opens activity while work is running and collapses it when work completes", () => {
    const item = toolItem("running");
    const result = render(<ActivityGroup items={[item]} />);
    roots.push(result.root);
    const trigger = result.host.querySelector('[data-slot="task-trigger"]') as HTMLButtonElement;
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    act(() => result.root.render(<ActivityGroup items={[{ ...item, status: "done" }]} />));
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    const restored = render(<ActivityGroup items={[toolItem("done")]} />);
    roots.push(restored.root);
    expect(restored.host.querySelector('[data-slot="task-trigger"]')?.getAttribute("aria-expanded")).toBe("false");
  });

  it("keeps all process items in one activity block and only exposes the final response", () => {
    const items: TimelineItem[] = [
      { id: "user-1", kind: "user", label: "You", body: "Investigate", timestamp: "10:00 AM" },
      { id: "reasoning-1", kind: "reasoning", label: "Reasoning", body: "Plan", status: "done", timestamp: "10:00 AM" },
      { id: "assistant-progress", kind: "assistant", label: "Assistant", body: "I found the files.", status: "done", timestamp: "10:01 AM" },
      { ...toolItem("done"), id: "tool-1" },
      { id: "assistant-final", kind: "assistant", label: "Assistant", body: "Here is the answer.", status: "done", timestamp: "10:02 AM" },
    ];

    expect(groupConversationItems(items)).toEqual([
      { kind: "message", item: items[0] },
      { kind: "activity", items: items.slice(1, 4) },
      { kind: "message", item: items[4] },
    ]);
  });

  it("keeps an unfinished turn entirely inside activity until a response starts", () => {
    const items: TimelineItem[] = [
      { id: "user-1", kind: "user", label: "You", body: "Investigate", timestamp: "10:00 AM" },
      { id: "reasoning-1", kind: "reasoning", label: "Reasoning", body: "Plan", status: "done", timestamp: "10:00 AM" },
      { ...toolItem("running"), id: "tool-1" },
    ];

    expect(groupConversationItems(items)).toEqual([
      { kind: "message", item: items[0] },
      { kind: "activity", items: items.slice(1) },
    ]);
  });

  it("renders process items as one uniform narrative flow", () => {
    const startedAt = new Date("2026-08-15T10:00:00.000Z").getTime();
    const items: TimelineItem[] = [
      { id: "reasoning-1", kind: "reasoning", label: "Reasoning", body: "Inspect the current implementation.", status: "done", timestamp: "10:00 AM" },
      { id: "progress-1", kind: "assistant", label: "Assistant", body: "I found the relevant files.", status: "done", timestamp: "10:01 AM" },
      toolItem("done"),
      { ...toolItem("done"), id: "tool-2" },
      { id: "progress-2", kind: "assistant", label: "Assistant", body: "The visual contract is now clear.", status: "done", timestamp: "10:02 AM" },
    ];
    const result = render(<ActivityGroup items={items} startedAt={startedAt} endedAt={startedAt + 120_000} />);
    roots.push(result.root);
    act(() => (result.host.querySelector('[data-slot="task-trigger"]') as HTMLButtonElement).click());

    expect(result.host.textContent).not.toContain("Progress update");
    expect(result.host.querySelector('.reasoning-row [data-slot="collapsible-trigger"]')).toBeNull();
    expect(result.host.querySelectorAll('[data-slot="tool-header"]')).toHaveLength(1);
    expect(result.host.textContent).toContain("Ran commands");
    expect(result.host.textContent).toContain("Inspect the current implementation.");
    expect(result.host.textContent).toContain("I found the relevant files.");
  });

  it("renders restored and streaming messages through MessageResponse", () => {
    const result = render(
      <Message from="assistant">
        <MessageContent><MessageResponse mode="static">{"> restored"}</MessageResponse></MessageContent>
      </Message>,
    );
    roots.push(result.root);
    expect(result.host.textContent).toContain("restored");

    act(() => result.root.render(<Message from="assistant"><MessageContent><MessageResponse mode="streaming" isAnimating>streaming text</MessageResponse></MessageContent></Message>));
    expect(result.host.textContent).toContain("streaming text");
  });

  it("links only existing workspace files in assistant markdown", () => {
    const onWorkspaceFile = vi.fn();
    const workspaceFiles = ["src/App.tsx", "README.md"];
    const result = render(
      <MarkdownContent
        body={'I updated src/App.tsx, checked `README.md`, and linked [src/App.tsx](./src/App.tsx). Missing [missing.ts](missing.ts), `../src/App.tsx`, and /tmp/src/App.tsx stay plain. [docs](https://example.com) stays external.'}
        streaming={false}
        workspaceFiles={workspaceFiles}
        onWorkspaceFile={onWorkspaceFile}
      />,
    );
    roots.push(result.root);

    const links = [...result.host.querySelectorAll("a")];
    expect(links.map((link) => link.textContent)).toEqual(["src/App.tsx", "README.md", "src/App.tsx", "docs"]);
    expect(links.slice(0, 3).every((link) => link.getAttribute("href") === "https://pi-bot.invalid/workspace/src%2FApp.tsx" || link.getAttribute("href") === "https://pi-bot.invalid/workspace/README.md")).toBe(true);
    expect(links.slice(0, 3).every((link) => link.getAttribute("target") === null)).toBe(true);
    expect(links[3].getAttribute("target")).toBe("_blank");
    expect(result.host.textContent).toContain("missing.ts");
    expect(result.host.querySelector('a[href="missing.ts"]')).toBeNull();
    expect(result.host.textContent).toContain("../src/App.tsx");
    expect(result.host.querySelector('a[href*="/tmp/src/App.tsx"]')).toBeNull();

    act(() => links[0].click());
    expect(onWorkspaceFile).toHaveBeenCalledWith("src/App.tsx");

    act(() => result.root.render(<MarkdownContent body="Streaming src/App.tsx" streaming workspaceFiles={workspaceFiles} onWorkspaceFile={onWorkspaceFile} />));
    expect(result.host.querySelector('a[href="https://pi-bot.invalid/workspace/src%2FApp.tsx"]')).not.toBeNull();

    const tool = render(<ActivityGroup items={[{ ...toolItem("done"), body: "src/App.tsx", input: '{"path":"src/App.tsx"}' }]} />);
    roots.push(tool.root);
    expect(tool.host.querySelector("a")).toBeNull();
  });

  it("keeps user messages anchored to the right edge", () => {
    const result = render(<Message from="user"><MessageContent>hello</MessageContent></Message>);
    roots.push(result.root);
    const message = result.host.querySelector(".is-user");
    expect(message?.classList.contains("ml-auto")).toBe(true);
    expect(message?.classList.contains("justify-end")).toBe(true);
    expect(message?.classList.contains("flex-row-reverse")).toBe(false);
  });

  it("renders shell commands as terminal text instead of nested JSON", () => {
    const result = render(<ActivityGroup items={[toolItem("done")]} />);
    roots.push(result.root);
    act(() => (result.host.querySelector('[data-slot="task-trigger"]') as HTMLButtonElement).click());
    const tool = result.host.querySelector('[data-slot="tool"]') as HTMLDetailsElement;
    const terminalContent = result.host.querySelector('[data-slot="terminal-content"]') as HTMLDivElement;
    terminalContent.scrollLeft = 120;
    terminalContent.scrollTop = 40;
    tool.open = true;
    act(() => tool.dispatchEvent(new Event("toggle")));
    expect(result.host.querySelector('[data-slot="terminal-command"]')?.textContent).toBe("$pwd");
    expect(result.host.querySelector('[data-slot="terminal"]')).not.toBeNull();
    expect(result.host.querySelector('[data-slot="terminal-output"]')?.textContent).toBe("done");
    expect(result.host.textContent).toContain("Success");
    expect(terminalContent.scrollLeft).toBe(0);
    expect(terminalContent.scrollTop).toBe(0);
  });

  it("keeps non-shell tool input visible", () => {
    const result = render(<ActivityGroup items={[{ ...toolItem("done"), label: "Tool · read", input: '{"path":"README.md"}' }]} />);
    roots.push(result.root);
    act(() => (result.host.querySelector('[data-slot="task-trigger"]') as HTMLButtonElement).click());
    expect(result.host.querySelector('[data-slot="tool-input"]')?.textContent).toContain("README.md");
    expect(result.host.querySelector('[data-slot="tool-output"]')?.textContent).toContain("done");
  });

  it("renders Terminal output and exposes its streaming state", () => {
    const result = render(<Terminal output={'\u001b[32mready\u001b[0m'} isStreaming />);
    roots.push(result.root);
    expect(result.host.querySelector('[data-slot="terminal-content"]')?.textContent).toContain("ready");
    expect(result.host.querySelector('[data-slot="terminal-status"]')?.textContent).toBe("Running");
    expect(result.host.querySelector(".terminal-cursor")).not.toBeNull();
  });

  it("keeps GFM and fenced code rendering in the MessageResponse path", () => {
    const result = render(<MarkdownContent body={"| A | B |\n| --- | --- |\n| 1 | 2 |\n\n```unknown\nconst answer = 42;\n```\n\n```\nplain text\n```"} streaming={false} />);
    roots.push(result.root);
    expect(result.host.querySelector("table")).not.toBeNull();
    expect(result.host.querySelectorAll('[data-streamdown="code-block"]')).toHaveLength(2);
    expect(result.host.querySelector('[data-streamdown="code-block-header"]')).not.toBeNull();
    expect(result.host.querySelector('[data-streamdown="code-block-actions"] button')).not.toBeNull();
    expect(result.host.textContent).toContain("const answer = 42;");
    expect(result.host.textContent).toContain("plain text");

    const external = render(<MarkdownContent body="[docs](https://example.com)" streaming={false} />);
    roots.push(external.root);
    expect(external.host.querySelector('button[data-streamdown="link"]')).not.toBeNull();

    const workspaceCallback = vi.fn();
    const workspace = render(<MarkdownContent body="[file](workspace://src%2FApp.tsx)" streaming={false} onWorkspaceFile={workspaceCallback} />);
    roots.push(workspace.root);
    act(() => (workspace.host.querySelector("a") as HTMLAnchorElement).click());
    expect(workspaceCallback).toHaveBeenCalledWith("src/App.tsx");
  });

  it("renders Mermaid blocks with readable theme-aware colors and controls", async () => {
    vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} });
    const body = "```mermaid\nflowchart LR\n  A[Mulai] --> B{Valid?}\n  B --> C[Selesai]\n```";
    const darkConfig = markdownMermaidConfig("dark").config;
    const lightConfig = markdownMermaidConfig("light").config;
    expect(darkConfig.theme).toBe("base");
    expect(darkConfig.themeVariables?.primaryTextColor).toBe("#f6f7f8");
    expect(lightConfig.themeVariables?.primaryTextColor).toBe("#20242b");
    expect(darkConfig.themeVariables?.primaryTextColor).not.toBe(lightConfig.themeVariables?.primaryTextColor);

    const result = render(<MarkdownContent body={body} streaming={false} theme="dark" />);
    roots.push(result.root);
    await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 50)); });
    const diagram = result.host.querySelector('[data-streamdown="mermaid-block"]') as HTMLDivElement;
    expect(diagram).not.toBeNull();
    expect(diagram.querySelector('button[title="Download diagram"]')).not.toBeNull();
    expect(diagram.querySelector('[data-streamdown="mermaid-block-actions"]')).not.toBeNull();
  });

  it("keeps Streamdown code and table content on one scrollable surface", () => {
    const body = [
      "```typescript",
      "const known = true;",
      "```",
      "",
      "```made-up-language",
      "unknown();",
      "```",
      "",
      "```",
      "plain text",
      "```",
      "",
      "| Name | Value |",
      "| --- | --- |",
      "| first | second |",
    ].join("\n");
    const result = render(<MarkdownContent body={body} streaming={false} />);
    roots.push(result.root);

    const codeBlocks = [...result.host.querySelectorAll('[data-streamdown="code-block"]')];
    expect(codeBlocks).toHaveLength(3);
    expect(codeBlocks[0].querySelector('[data-streamdown="code-block-header"]')?.textContent).toContain("typescript");
    expect(codeBlocks[2].querySelector('[data-streamdown="code-block-header"]')?.textContent).toContain("text");
    for (const block of codeBlocks) {
      expect(block.querySelectorAll('[data-streamdown="code-block-header"]')).toHaveLength(1);
      expect(block.querySelectorAll('[data-streamdown="code-block-body"]')).toHaveLength(1);
      expect(block.querySelectorAll('[data-streamdown="code-block-body"] pre')).toHaveLength(1);
      expect(block.querySelector('[data-streamdown="code-block-body"]')?.classList.contains("overflow-x-auto")).toBe(true);
      expect(block.querySelector('[data-streamdown="code-block-body"] pre')?.closest('[data-streamdown="code-block"]')).toBe(block);
      expect(block.querySelector('button[title="Copy Code"]')).not.toBeNull();
    }

    const tableWrapper = result.host.querySelector('[data-streamdown="table-wrapper"]') as HTMLDivElement;
    expect(tableWrapper).not.toBeNull();
    expect(tableWrapper.querySelectorAll("table, thead, tbody, th, td")).not.toHaveLength(0);
    expect(tableWrapper.querySelector('button[title="Copy table"]')).not.toBeNull();
    expect(tableWrapper.querySelectorAll(":scope > div")).toHaveLength(2);
    expect(tableWrapper.querySelector(':scope > div:last-child')).not.toBeNull();
    expect(tableWrapper.querySelector(':scope > div:last-child')?.classList.contains("overflow-x-auto")).toBe(true);
    expect(tableWrapper.querySelector(':scope > div:last-child > table')).not.toBeNull();
  });

  it("keeps one-surface geometry and overflow stable across light and dark themes", () => {
    const body = [
      `~~~bash\n${"x".repeat(600)}\n~~~`,
      "",
      "| One | Two | Three | Four |",
      "| --- | --- | --- | --- |",
      "| a | b | c | d |",
    ].join("\n");
    const snapshots: string[][] = [];
    const shellColors: string[] = [];

    for (const theme of ["dark", "light"] as const) {
      document.documentElement.dataset.theme = theme;
      const result = render(<MarkdownContent body={body} streaming={false} />);
      roots.push(result.root);
      result.host.style.width = "240px";
      const markdown = result.host.querySelector(".markdown-content") as HTMLDivElement;
      markdown.style.width = "100%";

      const codeBlock = result.host.querySelector('[data-streamdown="code-block"]') as HTMLDivElement;
      const codeBody = codeBlock.querySelector('[data-streamdown="code-block-body"]') as HTMLDivElement;
      const codePre = codeBody.querySelector("pre") as HTMLPreElement;
      const tableWrapper = result.host.querySelector('[data-streamdown="table-wrapper"]') as HTMLDivElement;
      const tableScroll = tableWrapper.querySelector(":scope > div:last-child") as HTMLDivElement;
      expect(getComputedStyle(codeBlock).borderTopWidth).toBe("1px");
      expect(getComputedStyle(codeBody).padding).toBe("0px");
      expect(getComputedStyle(codeBody).borderTopWidth).toBe("0px");
      expect(getComputedStyle(codeBody).overflowX).toBe("auto");
      expect(getComputedStyle(codeBody).maxWidth).toBe("100%");
      expect(getComputedStyle(codePre).borderTopWidth).toBe("0px");
      expect(getComputedStyle(codePre).overflow).toBe("visible");
      expect(getComputedStyle(tableWrapper).borderTopWidth).toBe("1px");
      expect(getComputedStyle(tableScroll).borderTopWidth).toBe("0px");
      expect(getComputedStyle(tableScroll).overflowX).toBe("auto");
      expect(getComputedStyle(tableScroll).maxWidth).toBe("100%");

      const rootStyle = getComputedStyle(document.documentElement);
      shellColors.push(rootStyle.getPropertyValue("--shell"));
      snapshots.push([
        getComputedStyle(codeBlock).borderRadius,
        getComputedStyle(codeBody).padding,
        getComputedStyle(codeBody).overflowX,
        getComputedStyle(tableWrapper).borderRadius,
        getComputedStyle(tableScroll).overflowX,
      ]);
    }

    expect(shellColors[0]).not.toBe(shellColors[1]);
    expect(snapshots[0]).toEqual(snapshots[1]);
  });

  it("copies code with exact whitespace and keeps copy controls keyboard accessible", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const source = "  first line  \n\tsecond line\n\nlast line\n";
    const result = render(<MarkdownContent body={`~~~bash\n${source}~~~`} streaming={false} />);
    roots.push(result.root);

    const copy = result.host.querySelector('button[data-streamdown="code-block-copy-button"]') as HTMLButtonElement;
    expect(copy).not.toBeNull();
    expect(copy.type).toBe("button");
    expect(copy.getAttribute("title")).toBe("Copy Code");
    copy.focus();
    expect(document.activeElement).toBe(copy);
    await act(async () => copy.click());
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(source);
  });

  it("copies tables as Markdown, CSV, and TSV through Streamdown's dropdown", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { write } });
    class TestClipboardItem {
      constructor(readonly items: Record<string, Blob>) {}
    }
    vi.stubGlobal("ClipboardItem", TestClipboardItem);
    const result = render(<MarkdownContent body={"| Name | Value |\n| --- | --- |\n| Alice | 1 |\n| Bob | 2 |"} streaming={false} />);
    roots.push(result.root);
    const copy = result.host.querySelector('button[title="Copy table"]') as HTMLButtonElement;

    for (const [index, [title, expected]] of ([
      ["Copy table as Markdown", "| Name | Value |\n| --- | --- |\n| Alice | 1 |\n| Bob | 2 |"],
      ["Copy table as CSV", "Name,Value\nAlice,1\nBob,2"],
      ["Copy table as TSV", "Name\tValue\nAlice\t1\nBob\t2"],
    ] as const).entries()) {
      await act(async () => copy.click());
      const option = result.host.querySelector(`button[title="${title}"]`) as HTMLButtonElement;
      expect(option).not.toBeNull();
      option.focus();
      expect(document.activeElement).toBe(option);
      await act(async () => option.click());
      expect(write).toHaveBeenCalledTimes(index + 1);
      const item = write.mock.lastCall?.[0]?.[0] as TestClipboardItem;
      expect(await item.items["text/plain"].text()).toBe(expected);
    }
  });

  it("keeps completed restored and streaming MessageResponse markup equivalent", () => {
    const body = "| A | B |\n| --- | --- |\n| 1 | 2 |\n\n```javascript\nconst answer = 42;\n```";
    const restored = render(<MessageResponse mode="static" isAnimating={false}>{body}</MessageResponse>);
    roots.push(restored.root);
    const streaming = render(<MessageResponse mode="streaming" isAnimating={false}>{body}</MessageResponse>);
    roots.push(streaming.root);

    const fingerprint = (host: HTMLElement) => [...host.querySelectorAll("[data-streamdown]")].map((element) => `${element.getAttribute("data-streamdown")}:${element.textContent}`).join("|");
    expect(fingerprint(streaming.host)).toBe(fingerprint(restored.host));
    expect(streaming.host.querySelectorAll('[data-streamdown="code-block"]')).toHaveLength(1);
    expect(streaming.host.querySelector('[data-streamdown="table-wrapper"]')).not.toBeNull();
  });

  it("covers the committed Markdown kitchen sink without weakening the renderer boundary", () => {
    const onWorkspaceFile = vi.fn();
    const restored = render(<MarkdownContent body={kitchenSink} streaming={false} onWorkspaceFile={onWorkspaceFile} />);
    roots.push(restored.root);
    const streaming = render(<MarkdownContent body={kitchenSink} streaming onWorkspaceFile={vi.fn()} />);
    roots.push(streaming.root);

    for (const host of [restored.host, streaming.host]) {
      expect(host.querySelector("mark")?.textContent).toBe("highlight");
      expect(host.querySelector("sub")?.textContent).toBe("2");
      expect(host.querySelector('[data-streamdown="superscript"]')?.textContent).toBe("2");
      expect(host.querySelector("del")?.textContent).toBe("strikethrough");
      expect(host.textContent).toContain("😄");
      expect(host.textContent).toContain("🚀");
      expect(host.textContent).toContain(":unknown-shortcode:");
      expect(host.textContent).toContain("==literal==");
      expect(host.textContent).toContain("H~2~O");
      expect(host.textContent).toContain("x^2^");
      expect(host.textContent).toContain(":smile:");

      expect(host.querySelectorAll("dl > dt")).toHaveLength(2);
      expect(host.querySelectorAll("dl > dd")).toHaveLength(2);
      expect(host.querySelector("u")?.textContent).toBe("underlined");
      expect(host.querySelector("u")?.getAttribute("onclick")).toBeNull();
      expect(host.querySelector("script, iframe, object, embed")).toBeNull();
      expect(host.querySelector('a[href^="javascript:"]')).toBeNull();

      expect(host.querySelectorAll(".katex").length).toBeGreaterThanOrEqual(2);
      expect(host.querySelectorAll('[data-streamdown="code-block"]')).toHaveLength(3);
      expect(host.querySelectorAll('[data-streamdown="code-block-actions"] button')).toHaveLength(6);
      expect(host.textContent).toContain("plain text without a language");
      expect(host.textContent).toContain("indented plain text");

      expect(host.querySelectorAll("#duplicate-heading")).toHaveLength(1);
      expect(host.querySelectorAll("#duplicate-heading-1")).toHaveLength(1);
      expect(host.querySelectorAll("#install")).toHaveLength(1);
      expect(host.querySelector('a[href="#duplicate-heading"]')).not.toBeNull();

      const reference = host.querySelector('a[data-footnote-ref]') as HTMLAnchorElement;
      const backReference = host.querySelector('a[data-footnote-backref]') as HTMLAnchorElement;
      expect(host.querySelector(`[id="${reference.getAttribute("href")?.slice(1)}"]`)).not.toBeNull();
      expect(host.querySelector(`[id="${backReference.getAttribute("href")?.slice(1)}"]`)).not.toBeNull();
      expect(host.querySelector(`[id="${reference.getAttribute("aria-describedby")}"]`)).not.toBeNull();
    }

    const workspaceLink = [...restored.host.querySelectorAll("a")].find((anchor) => anchor.textContent === "Open the workspace fixture") as HTMLAnchorElement;
    expect(workspaceLink).not.toBeNull();
    act(() => workspaceLink.click());
    expect(onWorkspaceFile).toHaveBeenCalledWith("KITCHEN_SINK.md");
  });

  it("supports the full Message branch and toolbar composition", () => {
    const onBranchChange = vi.fn();
    const result = render(
      <MessageBranch onBranchChange={onBranchChange}>
        <MessageBranchContent>
          <div key="first">First response</div>
          <div key="second">Second response</div>
        </MessageBranchContent>
        <MessageToolbar>
          <MessageBranchSelector>
            <MessageBranchPrevious />
            <MessageBranchPage />
            <MessageBranchNext />
          </MessageBranchSelector>
        </MessageToolbar>
      </MessageBranch>,
    );
    roots.push(result.root);
    expect(result.host.textContent).toContain("1 of 2");

    const next = result.host.querySelector('button[aria-label="Next branch"]') as HTMLButtonElement;
    act(() => next.click());
    expect(onBranchChange).toHaveBeenCalledWith(1);
    expect(result.host.textContent).toContain("2 of 2");
  });

  it("sends Enter but preserves IME composition in the PromptInput composer", () => {
    const onPrompt = vi.fn();
    const result = render(<Composer busy={false} disabled={false} config={config} onPrompt={onPrompt} onAbort={vi.fn()} onModelChange={vi.fn()} onThinkingChange={vi.fn()} />);
    roots.push(result.root);
    const textarea = result.host.querySelector("textarea") as HTMLTextAreaElement;
    expect(document.activeElement).toBe(textarea);
    const send = result.host.querySelector('button[aria-label="Send message"]') as HTMLButtonElement;
    const modelSelector = result.host.querySelector(".composer-model-select") as HTMLElement;
    const contextTrigger = result.host.querySelector('button[aria-label="Context usage"]') as HTMLButtonElement;
    expect(send.className).toContain("bg-primary");
    expect(send.className).toContain("text-primary-foreground");
    expect(modelSelector.closest(".composer-actions")).toBe(contextTrigger.closest(".composer-actions"));
    expect(contextTrigger.compareDocumentPosition(modelSelector) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(contextTrigger.textContent).toContain("10%");
    expect(contextTrigger.querySelectorAll("svg circle")).toHaveLength(2);
    expect(contextTrigger.querySelector(".context-trigger-track")).toBeNull();
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setValue?.call(textarea, "hello");
    act(() => textarea.dispatchEvent(new Event("input", { bubbles: true })));
    textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(onPrompt).toHaveBeenCalledWith("hello");

    onPrompt.mockClear();
    setValue?.call(textarea, "two lines");
    act(() => textarea.dispatchEvent(new Event("input", { bubbles: true })));
    textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true }));
    expect(onPrompt).not.toHaveBeenCalled();

    setValue?.call(textarea, "composing");
    act(() => textarea.dispatchEvent(new Event("input", { bubbles: true })));
    const composing = new KeyboardEvent("keydown", { key: "Enter", bubbles: true });
    Object.defineProperty(composing, "isComposing", { value: true });
    textarea.dispatchEvent(composing);
    expect(onPrompt).not.toHaveBeenCalled();
    expect(result.host.querySelector('[data-slot="prompt-input"] > [data-slot="input-group"]')).not.toBeNull();
  });

  it("uses the PromptInput status action to stop a streaming response", () => {
    const onAbort = vi.fn();
    const result = render(<Composer busy disabled config={config} onPrompt={vi.fn()} onAbort={onAbort} onModelChange={vi.fn()} onThinkingChange={vi.fn()} />);
    roots.push(result.root);
    const stop = result.host.querySelector('button[aria-label="Stop response"]') as HTMLButtonElement;
    expect(stop).not.toBeNull();
    act(() => stop.click());
    expect(onAbort).toHaveBeenCalledOnce();
  });

  it("uses the Conversation follow-latest contract", () => {
    const result = render(<Conversation><ConversationContent><div>older</div><div>latest</div></ConversationContent></Conversation>);
    roots.push(result.root);
    expect(result.host.querySelector('[data-slot="conversation"]')).not.toBeNull();
    expect(result.host.querySelector('[data-slot="conversation-content"]')?.textContent).toContain("latest");
  });
});
