import type { Plugin } from "vite";

import { DARK_SCHEME, PAGE_SETTINGS, STORAGE_KEY } from "../design/system/settings.ts";

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
  return {
    name: "threadsift-theme-script",
    transformIndexHtml: () => [{ tag: "script", children: themeScript(), injectTo: "head" }],
  };
}
