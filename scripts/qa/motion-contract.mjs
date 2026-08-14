import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const files = {
  package: "package.json",
  design: "DESIGN.md",
  motion: "src/lib/motion.tsx",
  main: "src/main.tsx",
  app: "src/App.tsx",
  button: "src/components/ui/button.tsx",
  dialog: "src/components/ui/dialog.tsx",
  select: "src/components/ui/select.tsx",
  styles: "src/styles.css",
};

const sources = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([name, file]) => [name, await readFile(resolve(root, file), "utf8")])),
);
const packageJson = JSON.parse(sources.package);
const failures = [];

function requireText(name, pattern, description) {
  if (!pattern.test(sources[name])) failures.push(description);
}

if (!packageJson.dependencies?.motion) failures.push("motion must be a production dependency");
requireText("motion", /from ["']motion\/react["']/, "shared motion boundary must import motion/react");
requireText("motion", /MotionConfig reducedMotion=["']user["']/, "MotionConfig must honor the user reduced-motion preference");
requireText("main", /<MotionProvider>/, "renderer root must use MotionProvider");
requireText("app", /AnimatePresence/, "interaction surfaces must use AnimatePresence");
requireText("app", /layoutId=/, "selection or navigation needs a shared layout indicator");
requireText("app", /whileTap=/, "actionable interaction surfaces need press feedback");
requireText("app", /behavior:\s*reducedMotion\s*\?\s*["']auto["']\s*:\s*["']smooth["']/, "interaction-triggered scrolling must honor reduced motion");
requireText("app", /event\.key !== ["']Escape["'][\s\S]*setPickerOpen\(false\)/, "workspace tab picker must close with Escape");
requireText("button", /data-motion=["']button["']/, "shared Button must expose the motion contract");
requireText("dialog", /from ["']@\/lib\/motion["']/, "shared Dialog must use the motion boundary");
requireText("dialog", /data-motion=["']dialog-content["']/, "shared Dialog content must expose the motion contract");
requireText("dialog", /const DialogMotionContext/, "shared Dialog must track open state for exit cleanup");
requireText("dialog", /const \[present, setPresent\] = React\.useState\(open\)/, "shared Dialog must keep its portal present during exit");
requireText("dialog", /if \(!open\) setPresent\(false\)/, "shared Dialog must unmount after its close animation");
requireText("dialog", /animate=\{\{ opacity: open \? 1 : 0 \}\}/, "shared Dialog must animate its open and closed states");
requireText("select", /from ["']@\/lib\/motion["']/, "shared Select must use the motion boundary");
requireText("select", /data-motion=["']select-content["']/, "shared Select content must expose the motion contract");
requireText("select", /state\.open \? \{ opacity: 1, y: 0, scale: 1 \} : \{ opacity: 0, y: -4, scale: 0\.98 \}/, "shared Select must animate its open and closed states");
requireText("design", /## 1\. Motion principles/, "root DESIGN.md must define motion principles");
requireText("design", /## 5\. Accessibility and human factors/, "root DESIGN.md must define accessibility motion rules");
requireText("design", /prefers-reduced-motion/, "design contract must mention reduced motion");

const directLayoutAnimation = /animate=\{[^}]*\b(?:width|height|top|right|bottom|left|margin|padding)\s*:/s;
if (directLayoutAnimation.test(sources.app) || directLayoutAnimation.test(sources.motion)) {
  failures.push("layout properties must not be directly animated with Motion");
}
if (/@keyframes agent-working-enter/.test(sources.styles)) {
  failures.push("Motion-owned agent entry must not retain a duplicate transform keyframe");
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "RED", failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: "GREEN", checks: 19 }, null, 2));
