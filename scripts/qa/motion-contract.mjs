import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const files = {
  package: "package.json",
  design: "DESIGN.md",
  motion: "src/lib/motion.tsx",
  streaming: "src/lib/streaming.ts",
  main: "src/main.tsx",
  app: "src/App.tsx",
  button: "src/components/ui/button.tsx",
  dialog: "src/components/ui/dialog.tsx",
  conversation: "src/components/ai-elements/conversation.tsx",
  aiMessage: "src/components/ai-elements/message.tsx",
  aiTask: "src/components/ai-elements/task.tsx",
  aiTool: "src/components/ai-elements/tool.tsx",
  select: "src/components/ui/select.tsx",
  styles: "src/styles.css",
};

const sources = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([name, file]) => [name, await readFile(resolve(root, file), "utf8")])),
);
const packageJson = JSON.parse(sources.package);
const failures = [];
let checkCount = 0;

function requireText(name, pattern, description) {
  checkCount += 1;
  if (!pattern.test(sources[name])) failures.push(description);
}

checkCount += 1;
if (!packageJson.dependencies?.motion) failures.push("motion must be a production dependency");
requireText("motion", /from ["']motion\/react["']/, "shared motion boundary must import motion/react");
requireText("motion", /MotionConfig reducedMotion=["']user["']/, "MotionConfig must honor the user reduced-motion preference");
requireText("motion", /streamBatchMs: 40/, "streaming motion must use the documented 40ms batch timing");
requireText("design", /--motion-stream-caret.*1100ms/, "streaming caret timing must be documented");
requireText("main", /<MotionProvider>/, "renderer root must use MotionProvider");
requireText("app", /AnimatePresence/, "interaction surfaces must use AnimatePresence");
requireText("app", /function ActivityItem[\s\S]*?<Tool className=\{`activity-item/, "activity items should use the AI Elements Tool adapter");
requireText("app", /function ActivityGroup[\s\S]*?<Task className=["']activity-group["']/, "activity groups should use the AI Elements Task adapter");
requireText("app", /className=["']activity-list-motion["']/, "activity group details should expose the fade surface");
requireText("aiTask", /CollapsibleContent[\s\S]*data-slot=["']task-content["']/, "Task content should use the shared Collapsible primitive");
requireText("app", /layoutId=/, "selection or navigation needs a shared layout indicator");
requireText("app", /whileTap=/, "actionable interaction surfaces need press feedback");
requireText("app", /createStreamDeltaBatcher/, "assistant deltas must use the stream batcher");
requireText("app", /streaming-caret/, "streaming text must expose its active-generation cue");
requireText("app", /layout=["']position["']/, "streaming messages must preserve text scale during reflow");
requireText("conversation", /initial=\{reducedMotion \? ["']instant["'] : ["']smooth["']\}/, "conversation scrolling must honor reduced motion");
requireText("conversation", /useStickToBottomContext/, "conversation must expose follow-latest scroll state");
requireText("app", /<ConversationScrollButton/, "conversation must expose a jump-to-latest control");
requireText("aiMessage", /Streamdown/, "MessageResponse must use Streamdown");
requireText("aiTool", /ToolHeader[\s\S]*ToolContent/, "tool adapter must expose header and content components");
requireText("app", /<DropdownMenu>[\s\S]*<DropdownMenuContent/, "workspace tab picker must use the shared DropdownMenu");
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
requireText("styles", /data-motion=\"streaming-caret\"\]\s*>\s*:last-child::after/, "streaming caret must stay inline with the final markdown block");
requireText("styles", /prefers-reduced-motion[\s\S]*streaming-caret/, "streaming caret must have a reduced-motion CSS path");

requireText("styles", /@keyframes activity-fade-in/, "activity Task details should define an opacity-only fade");
requireText("styles", /data-slot=["']task-content["'][^}]*animation: activity-fade-in 220ms ease-out both/, "activity Task details should animate opacity without reflow");
requireText("styles", /data-slot=["']tool["']\]\[open\][^}]*data-slot=["']tool-content["'][^}]*animation: activity-fade-in 220ms ease-out both/, "activity Tool details should fade when opened");
requireText("styles", /activity-fade-in[\s\S]*prefers-reduced-motion/, "activity Task fade must have a reduced-motion path");

const directLayoutAnimation = /animate=\{[^}]*\b(?:width|height|top|right|bottom|left|margin|padding)\s*:/s;
if (directLayoutAnimation.test(sources.app) || directLayoutAnimation.test(sources.motion)) {
  failures.push("layout properties must not be directly animated with Motion");
}
if (/@keyframes agent-working-enter/.test(sources.styles)) {
  failures.push("Motion-owned agent entry must not retain a duplicate transform keyframe");
}
if (/components\/ui\/accordion/.test(sources.app) || /<Accordion\b/.test(sources.app)) {
  failures.push("ActivityGroup must not retain the old Accordion implementation");
}
if (/slide-(?:in|out)|collapsible-content-height|animate-(?:in|out)/.test(sources.aiTask)) {
  failures.push("activity Task content must not animate slide or height");
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "RED", failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: "GREEN", checks: checkCount }, null, 2));
