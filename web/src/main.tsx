import "./zod-jitless.ts";
import "@fontsource/commit-mono/400.css";
import "@fontsource/commit-mono/500.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans/700.css";
import "@fontsource-variable/schibsted-grotesk/wght.css";
import "../../design/system/tokens.css";
import "../../design/system/components.css";
import "./page.css";
import "./access.css";
import "./highlights-page.css";
import "./page-links.css";
import "./row-list.css";
import "./topic-page.css";
import "./import-page.css";
import "./index-page.css";
import "./log-page.css";
import "./proposals-page.css";
import "./quote-text.css";
import "./related.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.tsx";
import { preloadPage } from "./lazy-pages.tsx";
import { currentPath } from "./routing.ts";
import { storedSettings } from "./use-settings.ts";

const container = document.querySelector("#root");

if (container === null) {
  throw new Error("web/index.html has no #root element");
}

preloadPage(currentPath());

const settings = storedSettings();

createRoot(container).render(
  <StrictMode>
    <App settings={settings} />
  </StrictMode>,
);
