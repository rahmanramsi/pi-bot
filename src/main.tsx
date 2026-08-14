import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

window.piBot.reportRendererStage("entry");
createRoot(document.getElementById("root")!).render(<App />);
