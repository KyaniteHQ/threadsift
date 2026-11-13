import "./zod-jitless.ts";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans/700.css";
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

import { loadFaces, facesOf } from "../../design/system/style-faces.ts";
import { App } from "./App.tsx";
import { preloadPage } from "./lazy-pages.tsx";
import { FACE_WAIT_MS, settledOrAborted } from "./load-fonts.ts";
import { storedSettings } from "./use-settings.ts";

const container = document.querySelector("#root");

if (container === null) {
  throw new Error("web/index.html has no #root element");
}

preloadPage(window.location.pathname);

const settings = storedSettings();

await settledOrAborted(loadFaces(facesOf(settings)), AbortSignal.timeout(FACE_WAIT_MS));

createRoot(container).render(
  <StrictMode>
    <App settings={settings} />
  </StrictMode>,
);
