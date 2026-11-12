import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "manifest-editor/reset.css";
import "manifest-editor/dist/index.css";
import "@manifest-editor/exhibition-preset/dist/index.css";
import "./styles.css";
import { App } from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
