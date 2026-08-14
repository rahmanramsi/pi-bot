import { readFile } from "node:fs/promises";

const indexHtml = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");

if (/(?:src|href)="\/[^"?]+/.test(indexHtml)) {
  throw new Error("Packaged renderer contains root-relative asset paths that fail from file:// URLs.");
}
