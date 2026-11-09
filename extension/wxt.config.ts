import { defineConfig } from "wxt";

import { TEXT } from "./lib/text.ts";

const HOSTS = ["https://*/*", "http://localhost/*", "http://127.0.0.1/*"];

const GECKO = {
  id: "{5d3f6c1e-8a47-4c2b-9e0d-3b7a41c9f2a6}",
  data_collection_permissions: { required: ["websiteContent", "authenticationInfo"] },
};

export default defineConfig({
  manifest: ({ browser }) => {
    const manifest = {
      name: "Threadsift",
      description: TEXT.manifestDescription,
      permissions: ["activeTab", "scripting", "storage"],
      optional_host_permissions: HOSTS,
      action: { default_title: TEXT.actionTitle },
    };

    return browser === "firefox"
      ? { ...manifest, browser_specific_settings: { gecko: GECKO } }
      : manifest;
  },
});
