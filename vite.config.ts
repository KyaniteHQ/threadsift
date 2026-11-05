import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { themeScriptPlugin } from "./tools/theme-script.ts";

export default defineConfig({
  root: "web",
  plugins: [react(), themeScriptPlugin()],
  build: { outDir: "../dist/web", emptyOutDir: true },
  server: {
    fs: { allow: [".."] },
    proxy: { "/api": process.env["THREADSIFT_API_URL"] ?? "http://127.0.0.1:8080" },
  },
});
