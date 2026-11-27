import { basename, dirname } from "node:path";

import type { Plugin } from "vite";
import { defineConfig } from "wxt";

import { LOOPBACK_HOSTS } from "./lib/loopback-hosts.ts";
import { TEXT } from "./lib/text.ts";

const HOSTS = ["https://*/*", ...LOOPBACK_HOSTS.map((host) => `http://${host}/*`)];

const GECKO = {
  id: "{5d3f6c1e-8a47-4c2b-9e0d-3b7a41c9f2a6}",
  data_collection_permissions: { required: ["websiteContent", "authenticationInfo"] },
};

const PAGE_TITLES = new Map([
  ["popup", TEXT.actionTitle],
  ["options", TEXT.settingsTitle],
]);

function escapedText(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
}

const pageTitles: Plugin = {
  name: "threadsift-page-titles",
  transformIndexHtml: (_html, { filename }) => {
    const title = PAGE_TITLES.get(basename(dirname(filename)));

    if (title === undefined) throw new Error(`no page title for ${filename}`);

    return [{ tag: "title", children: escapedText(title), injectTo: "head" }];
  },
};

export default defineConfig({
  vite: () => ({ plugins: [pageTitles] }),
  manifest: ({ browser }) => {
    const manifest = {
      name: "Threadsift",
      description: TEXT.manifestDescription,
      permissions: ["activeTab", "scripting", "storage"],
      optional_permissions: ["cookies", "webRequest"],
      optional_host_permissions: HOSTS,
      action: { default_title: TEXT.actionTitle },
    };

    return browser === "firefox"
      ? { ...manifest, browser_specific_settings: { gecko: GECKO } }
      : manifest;
  },
});
