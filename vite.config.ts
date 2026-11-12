import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { themeScriptPlugin } from "./tools/theme-script.ts";
import { workerHeadersPlugin } from "./tools/worker-headers.ts";

const apiUrl = process.env["THREADSIFT_API_URL"] ?? "http://127.0.0.1:8080";

export default defineConfig({
  root: "web",
  plugins: [react(), themeScriptPlugin(), workerHeadersPlugin()],
  build: {
    outDir: "../dist/web",
    emptyOutDir: true,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: "zod", test: /(node_modules\/zod\/|zod-jitless)/u, priority: 2 },
            { name: "shared", test: /\/(web\/src|design\/system)\//u, minShareCount: 2 },
          ],
        },
      },
    },
  },
  server: {
    fs: { allow: [".."] },
    proxy: { "/api": apiUrl, "/share": apiUrl },
  },
});
