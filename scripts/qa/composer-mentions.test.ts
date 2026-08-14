import { describe, expect, it } from "vitest";
import { findWorkspaceMention, insertWorkspaceMention, matchingWorkspaceFiles } from "@/lib/workspace-mentions";

const files = [
  { path: "src/App.tsx", kind: "file" },
  { path: "src/components", kind: "folder" },
  { path: "docs/design-system.md", kind: "file" },
] as const;

describe("workspace composer mentions", () => {
  it("finds a mention only at a word boundary", () => {
    expect(findWorkspaceMention("Please inspect @src/Ap", 22)).toEqual({ start: 15, end: 22, query: "src/Ap" });
    expect(findWorkspaceMention("email@example.com", 17)).toBeNull();
    expect(findWorkspaceMention("@src/App.tsx next", 17)).toBeNull();
  });

  it("filters files and folders by their workspace path", () => {
    expect(matchingWorkspaceFiles(files, "src")).toEqual([files[0], files[1]]);
    expect(matchingWorkspaceFiles(files, "components")).toEqual([files[1]]);
  });

  it("inserts a selected path and leaves the cursor after it", () => {
    expect(insertWorkspaceMention("Review @", { start: 7, end: 8, query: "" }, "src/App.tsx")).toEqual({
      value: "Review @src/App.tsx ",
      cursor: 20,
    });
  });
});
