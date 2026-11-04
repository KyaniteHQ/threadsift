import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";

import { expect } from "@playwright/test";

import { nodeInAppNetwork } from "./target.ts";

const LISTENER_SOURCE = `
const http = require("node:http");
const handler = (request, response) => {
  process.stdout.write("request " + request.headers.host + request.url + "\\n");
  response.end("listener");
};
const announce = (port, ipv6) => process.stdout.write("listening " + port + " " + ipv6 + "\\n");
const ipv4 = http.createServer(handler);
ipv4.listen(0, "127.0.0.1", () => {
  const port = ipv4.address().port;
  const ipv6 = http.createServer(handler);
  ipv6.once("error", () => announce(port, false));
  ipv6.listen(port, "::1", () => announce(port, true));
});
process.stdin.resume();
process.stdin.once("end", () => process.exit(0));
setTimeout(() => process.exit(0), 600000);
`;

const LISTENING = /^listening (?<port>\d+) (?<ipv6>true|false)$/u;
const REQUEST = /^request (?<seen>.+)$/u;

export interface Listener {
  readonly port: number;
  readonly controlRequests: readonly string[];
  seen(): readonly string[];
  stop(): Promise<void>;
}

function runInAppNetwork(source: string, args: readonly string[] = []) {
  const { command, args: prefix } = nodeInAppNetwork();

  return spawn(command, [...prefix, "-e", source, ...args]);
}

function announcement(child: ChildProcessWithoutNullStreams, seen: string[]) {
  const lines = createInterface({ input: child.stdout });

  return new Promise<{ port: number; hasIpv6: boolean }>((resolve) => {
    lines.on("line", (line) => {
      const listening = LISTENING.exec(line)?.groups;
      const request = REQUEST.exec(line)?.groups?.["seen"];

      if (listening !== undefined) {
        resolve({ port: Number(listening["port"]), hasIpv6: listening["ipv6"] === "true" });
      } else if (request !== undefined) {
        seen.push(request);
      }
    });
  });
}

const CONTROL_SOURCE = `
fetch(process.argv[1]).then((response) => response.text()).then((text) => process.stdout.write(text));
`;

async function sendControlRequest(url: string): Promise<void> {
  const child = runInAppNetwork(CONTROL_SOURCE, [url]);
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += String(chunk);
  });

  await once(child, "close");
  expect(output, `a control request to ${url}`).toBe("listener");
}

export async function startListener(): Promise<Listener> {
  const child = runInAppNetwork(LISTENER_SOURCE);
  const seen: string[] = [];
  const { port, hasIpv6 } = await announcement(child, seen);
  const controlRequests = [`127.0.0.1:${port}/control`];
  await sendControlRequest(`http://127.0.0.1:${port}/control`);

  if (hasIpv6) {
    controlRequests.push(`[::1]:${port}/control`);
    await sendControlRequest(`http://[::1]:${port}/control`);
  }

  return {
    port,
    controlRequests,
    seen: () => seen,
    stop: async () => {
      if (child.exitCode === null) {
        child.stdin.end();
        await once(child, "close");
      }
    },
  };
}
