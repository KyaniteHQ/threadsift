import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { z } from "zod";

export const OptionsSchema = z.object({
  container: z.string(),
  stateDir: z.string(),
  captureDir: z.string(),
  publishedUrl: z.string(),
  insideUrl: z.string(),
  port: z.number().int(),
  image: z.string().optional(),
});

export type Options = z.output<typeof OptionsSchema>;

interface Finished {
  readonly stdout: string;
  readonly stderr: string;
  readonly status: number | null;
  readonly error: string;
}

export const COMMAND_TIMEOUT_MS = 8000;

const PODMAN_INFO_FIELDS = [
  "rootless={{.Host.Security.Rootless}}",
  "rootlessNetworkCmd={{.Host.RootlessNetworkCmd}}",
  "networkBackend={{.Host.NetworkBackend}}",
  "ociRuntime={{.Host.OCIRuntime.Name}}",
  "kernel={{.Host.Kernel}}",
  "eventLogger={{.Host.EventLogger}}",
].join(" ");

const LISTEN_STATE = "0A";

const MAC = /\b[0-9a-f]{2}(?::[0-9a-f]{2}){5}\b/giu;

const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/gu;

const LOCAL_IPV4 = /^(?:0\.0\.0\.0|127\.|169\.254\.)/u;

const IPV6 = /\b[0-9a-f]{1,4}(?::[0-9a-f]{0,4}){2,7}\b/giu;

const SECRETS = ["SETUP_CODE", "THREADSIFT_SECRET_KEY", "CLAUDE_CODE_OAUTH_TOKEN"].flatMap(
  (name) => {
    const value = process.env[name];

    return value === undefined || value === "" ? [] : [value];
  },
);

export function redact(text: string): string {
  return SECRETS.reduce((clean: string, secret) => clean.replaceAll(secret, "[redacted]"), text);
}

export function run(command: string, args: readonly string[], deadline: number): Finished {
  const left = deadline - Date.now();

  if (left <= 0) {
    return { stdout: "", stderr: "", status: null, error: "skipped: the capture time ran out" };
  }

  const done = spawnSync(command, args, {
    encoding: "utf8",
    timeout: Math.min(COMMAND_TIMEOUT_MS, left),
    killSignal: "SIGKILL",
  });

  return {
    stdout: done.stdout,
    stderr: done.stderr,
    status: done.status,
    error: done.error?.message ?? "",
  };
}

export function describe(done: Finished): string {
  const error = done.error === "" ? "" : `${done.error}\n`;

  return `${done.stdout}${done.stderr}${error}exit ${done.status}\n`;
}

export function readFile(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    return `${String(error)}\n`;
  }
}

function insideRequest(url: string): string {
  return `fetch(${JSON.stringify(url)}, { signal: AbortSignal.timeout(5000) }).then((response) => console.log(response.status), (error) => console.log(error.cause?.code ?? error.message))`;
}

export function reachability(options: Options, endedAt: string, deadline: number): string {
  const inside = run(
    "podman",
    ["exec", options.container, "node", "--eval", insideRequest(options.insideUrl)],
    deadline,
  );

  const insideTime = new Date().toISOString();

  const published = run(
    "curl",
    [
      "--silent",
      "--show-error",
      "--max-time",
      "5",
      "--output",
      "/dev/null",
      "--write-out",
      "%{http_code}\n",
      options.publishedUrl,
    ],
    deadline,
  );

  const publishedTime = new Date().toISOString();

  return [
    `test ended ${endedAt}`,
    `${insideTime} inside the container, ${options.insideUrl}:`,
    describe(inside),
    `${publishedTime} published port, ${options.publishedUrl}:`,
    describe(published),
  ].join("\n");
}

export function processIdentity(container: string, deadline: number): string {
  return [
    describe(
      run(
        "podman",
        ["inspect", container, "--format", "hostPid={{.State.Pid}} startedAt={{.State.StartedAt}}"],
        deadline,
      ),
    ),
    describe(run("podman", ["exec", container, "cat", "/proc/1/stat"], deadline)),
  ].join("");
}

export function executionIdentity(image: string | undefined, deadline: number): string {
  const imageLine =
    image === undefined
      ? "THREADSIFT_IMAGE is not set\n"
      : describe(
          run(
            "podman",
            ["image", "inspect", image, "--format", "id={{.Id}} digest={{.Digest}}"],
            deadline,
          ),
        );

  return [
    describe(run("podman", ["version"], deadline)),
    describe(run("podman", ["info", "--format", PODMAN_INFO_FIELDS], deadline)),
    imageLine,
    describe(run("uname", ["-srvm"], deadline)),
  ].join("\n");
}

export function ownForwarder(options: Options, deadline: number): string {
  const pastaLog = join(options.stateDir, "pasta.log");
  const rule = `127.0.0.1/${options.port}-${options.port}`;

  const lines = run("ps", ["-eo", "pid,ppid,stat,etime,rss,comm,args"], deadline).stdout.split(
    "\n",
  );

  const own = lines.filter(
    (line, index) => index === 0 || line.includes(pastaLog) || line.includes(rule),
  );

  return own.length > 1 ? own.join("\n") : `${own.join("\n")}\nno forwarder process of this run\n`;
}

export function listeningSockets(port: number): string {
  const portHex = port.toString(16).toUpperCase().padStart(4, "0");

  return readFile("/proc/net/tcp")
    .split("\n")
    .filter((line, index) => {
      const columns = line.trim().split(/\s+/u);

      return (
        index === 0 || (columns[3] === LISTEN_STATE && columns[1]?.endsWith(`:${portHex}`) === true)
      );
    })
    .join("\n");
}

export function withoutHostNetwork(log: string): string {
  const kept: string[] = [];
  let inSummary = false;

  for (const line of log.split("\n")) {
    if (line.includes("Template interface")) inSummary = true;

    if (line.includes("Inbound forwarding rules")) inSummary = false;

    if (!inSummary && !/ARP announcement|NDP/u.test(line)) kept.push(line);
  }

  return kept
    .join("\n")
    .replaceAll(MAC, "<mac>")
    .replaceAll(IPV4, (address) => (LOCAL_IPV4.test(address) ? address : "<ip>"))
    .replaceAll(IPV6, "<ip6>");
}
