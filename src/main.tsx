import { createRoot } from "react-dom/client";
import { App } from "./App";
import { MotionProvider } from "./lib/motion";
import "./styles.css";

window.piBot.reportRendererStage("entry");
createRoot(document.getElementById("root")!).render(
  <MotionProvider>
    <App />
  </MotionProvider>,
);
