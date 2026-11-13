import type { Plugin } from "vite";

import { DOCUMENT_HEADERS, HASHED_ASSET_HEADERS } from "../src/http/web-headers.ts";

function rule(path: string, headers: Readonly<Record<string, string>>): string {
  const lines = Object.entries(headers).map(([name, value]) => `  ${name}: ${value}`);

  return [path, ...lines].join("\n");
}

export function workerHeadersPlugin(): Plugin {
  return {
    name: "threadsift-worker-headers",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "_headers",
        source: `${rule("/assets/*", HASHED_ASSET_HEADERS)}\n\n${rule("/", DOCUMENT_HEADERS)}\n`,
      });
    },
  };
}
