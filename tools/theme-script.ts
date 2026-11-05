import type { Plugin } from "vite";

import { DARK_SCHEME, STORAGE_KEY, THEME } from "../design/system/settings.ts";

const FOLLOWS = Object.fromEntries(
  THEME.options.flatMap((option) =>
    "followsDevice" in option ? [[option.id, option.followsDevice]] : [],
  ),
);

function themeScript(): string {
  const [storageKey, key, attribute, scheme] = [
    STORAGE_KEY,
    THEME.key,
    THEME.attribute,
    DARK_SCHEME,
  ].map((value) => JSON.stringify(value));

  const ids = JSON.stringify(THEME.options.map((option) => option.id));

  return `(function(){try{var t=JSON.parse(localStorage.getItem(${storageKey}))[${key}];if(${ids}.indexOf(t)<0)return;var f=${JSON.stringify(FOLLOWS)}[t];document.documentElement.setAttribute(${attribute},f?f[matchMedia(${scheme}).matches?1:0]:t)}catch(e){}})()`;
}

export function themeScriptPlugin(): Plugin {
  return {
    name: "threadsift-theme-script",
    transformIndexHtml: () => [{ tag: "script", children: themeScript(), injectTo: "head" }],
  };
}
