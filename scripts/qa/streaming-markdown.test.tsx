import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MarkdownContent } from "@/App";

const reactGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

const fixtures = [
  { name: "paragraph", body: "Streaming text.", renderedText: "Streaming text." },
  { name: "list", body: "- one\n- two", renderedText: "one" },
  { name: "fenced code", body: "```ts\nconst answer = 42;\n```", renderedText: "const answer = 42;" },
  { name: "table", body: "| A | B |\n| --- | --- |\n| 1 | 2 |", renderedText: "AB12" },
  { name: "blockquote", body: "> A streamed note.", renderedText: "A streamed note." },
  { name: "CJK paragraph", body: "人間向けの説明は、短いバッチで表示します。", renderedText: "人間向けの説明" },
] as const;

describe("streaming markdown caret contract", () => {
  beforeAll(() => {
    reactGlobal.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    reactGlobal.IS_REACT_ACT_ENVIRONMENT = false;
  });

  let host: HTMLDivElement | undefined;
  let root: Root | undefined;

  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = undefined;
    host = undefined;
  });

  it.each(fixtures)("keeps the caret out of the markdown DOM for $name", ({ body, renderedText }) => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    act(() => root?.render(<MarkdownContent body={body} streaming />));

    const content = host.querySelector('[data-motion="streaming-caret"]');
    expect(content).not.toBeNull();
    expect(content?.querySelector('[data-motion="streaming-caret"]')).toBeNull();
    expect(content?.lastElementChild).not.toBeNull();
    expect(content?.textContent).toContain(renderedText);
  });
});
