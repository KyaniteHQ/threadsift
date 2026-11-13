import type { Plugin } from "vite";

import { DARK_SCHEME, PAGE_SETTINGS, STORAGE_KEY } from "../design/system/settings.ts";

const SERVE_ADDRESS = "/theme-script.js";

function themeScript(): string {
  const rows = JSON.stringify(
    PAGE_SETTINGS.map((row) => ({
      key: row.key,
      attribute: row.attribute,
      default: row.default,
      options: row.options.map((option) =>
        "followsDevice" in option
          ? { id: option.id, followsDevice: option.followsDevice }
          : { id: option.id },
      ),
    })),
  );

  return `(function(){try{var s=JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)}))||{};for(var r of ${rows}){var o=r.options.find(function(o){return o.id===s[r.key]})||r.options.find(function(o){return o.id===r.default});document.documentElement.setAttribute(r.attribute,o.followsDevice?o.followsDevice[matchMedia(${JSON.stringify(DARK_SCHEME)}).matches?1:0]:o.id)}}catch(e){}})()`;
}

export function themeScriptPlugin(): Plugin {
  const source = themeScript();
  let address = SERVE_ADDRESS;

  return {
    name: "threadsift-theme-script",
    configureServer: (server) => {
      server.middlewares.use(SERVE_ADDRESS, (_request, response) => {
        response.setHeader("Content-Type", "text/javascript");
        response.end(source);
      });
    },
    buildStart() {
      if (this.environment.mode !== "build") return;

      const reference = this.emitFile({ type: "asset", name: "theme-script.js", source });

      address = `/${this.getFileName(reference)}`;
    },
    transformIndexHtml: () => [{ tag: "script", attrs: { src: address }, injectTo: "head" }],
  };
}
