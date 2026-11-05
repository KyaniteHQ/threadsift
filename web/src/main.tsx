import "@fontsource-variable/bricolage-grotesque/opsz.css";
import "@fontsource-variable/figtree/wght.css";
import "@fontsource-variable/geist-mono/wght.css";
import "@fontsource-variable/geist/wght.css";
import "@fontsource-variable/instrument-sans/wght.css";
import "@fontsource-variable/jetbrains-mono/wght.css";
import "@fontsource-variable/newsreader/opsz-italic.css";
import "@fontsource-variable/newsreader/opsz.css";
import "@fontsource-variable/source-serif-4/opsz.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans/700.css";
import "@fontsource/instrument-serif/400-italic.css";
import "@fontsource/instrument-serif/400.css";
import "../../design/system/tokens.css";
import "../../design/system/components.css";
import "./page.css";
import "./access.css";
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
