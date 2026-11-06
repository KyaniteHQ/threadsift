import { spawn } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";

import { z } from "zod";

import type { Instance } from "./access.ts";
import { nodeInAppNetwork } from "./target.ts";

const SOURCE = `
const http = require("node:http");
const readline = require("node:readline");
let sourceRequests = 0;
let sourceCredential = false;
let targetRequests = 0;
let targetCredential = false;
const target = http.createServer((request, response) => {
  if (request.url !== "/control") {
    targetRequests++;
    targetCredential ||= request.headers.authorization !== undefined;
  }
  response.end("ready");
});
const source = http.createServer((request, response) => {
  if (request.url === "/control") return response.end("ready");
  sourceRequests++;
  sourceCredential ||= request.headers.authorization !== undefined;
  response.writeHead(307, {location: "http://127.0.0.1:" + target.address().port + "/target"});
  response.end();
});
target.listen(0, "127.0.0.1", () => source.listen(0, "127.0.0.1", async () => {
  for (const server of [source, target]) {
    const response = await fetch("http://127.0.0.1:" + server.address().port + "/control");
    if (await response.text() !== "ready") process.exit(1);
  }
  console.log(JSON.stringify({port: source.address().port}));
}));
readline.createInterface({input:process.stdin}).on("line", () => console.log(JSON.stringify({sourceRequests,sourceCredential,targetRequests,targetCredential})));
process.stdin.on("end", () => {source.close();target.close();});
`;

const Announcement = z.object({ port: z.number() });

const RedirectStats = z.object({
  sourceRequests: z.number(),
  sourceCredential: z.boolean(),
  targetRequests: z.number(),
  targetCredential: z.boolean(),
});

export async function redirectListener(instance: Instance) {
  const { command, args } = nodeInAppNetwork(instance);

  const child = spawn(command, [...args, "-e", SOURCE]);
  const lines = createInterface({ input: child.stdout });
  const iterator = lines[Symbol.asyncIterator]();
  const first = await iterator.next();
  const { port } = Announcement.parse(JSON.parse(first.value ?? "null"));

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    stats: async () => {
      child.stdin.write("stats\n");
      const next = await iterator.next();

      return RedirectStats.parse(JSON.parse(next.value ?? "null"));
    },
    close: async () => {
      child.stdin.end();
      await once(child, "close");
      lines.close();
    },
  };
}
