import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans/700.css";
import "../../design/system/tokens.css";
import "../../design/system/components.css";
import "./page.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.tsx";

const container = document.querySelector("#root");

if (container === null) {
  throw new Error("web/index.html has no #root element");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
