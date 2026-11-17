import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { Reporter, TestCase, TestResult } from "@playwright/test/reporter";
import type { z } from "zod";

import {
  COMMAND_TIMEOUT_MS,
  OptionsSchema,
  type Options,
  containerListeners,
  containerTcpCounters,
  describe,
  executionIdentity,
  listeningSockets,
  ownForwarder,
  processIdentity,
  reachability,
  readFile,
  redact,
  run,
  withoutHostNetwork,
} from "./container-probes.ts";

const CAPTURE_BUDGET_MS = 30_000;

const EVENT_FORMAT =
  '{"time":"{{.Time}}","status":"{{.Status}}","name":"{{.Name}}","exitCode":"{{.ContainerExitCode}}"}';

const CONTAINER_FILES = [
  "/proc/net/tcp",
  "/proc/sys/net/core/somaxconn",
  "/proc/sys/net/ipv4/tcp_abort_on_overflow",
  "/sys/fs/cgroup/memory.events",
  "/sys/fs/cgroup/memory.current",
  "/sys/fs/cgroup/memory.max",
];

function runFolder(startedAtSeconds: number): string {
  return new Date(startedAtSeconds * 1000).toISOString().replace(".000Z", "Z").replaceAll(":", "-");
}

export default class ContainerCapture implements Reporter {
  readonly #options: Options;

  readonly #startedAt = Math.floor(Date.now() / 1000);

  readonly #hostCountersBefore = readFile("/proc/net/netstat");

  #processBefore = "";

  #tcpCountersBefore = "";

  #captured = false;

  constructor(options: z.input<typeof OptionsSchema>) {
    this.#options = OptionsSchema.parse(options);
  }

  onTestBegin(): void {
    if (this.#processBefore === "") {
      this.#tcpCountersBefore = containerTcpCounters(
        this.#options.container,
        Date.now() + COMMAND_TIMEOUT_MS,
      );
      this.#processBefore = processIdentity(
        this.#options.container,
        Date.now() + 2 * COMMAND_TIMEOUT_MS,
      );
    }
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    if (this.#captured || result.status === test.expectedStatus) return;
    this.#captured = true;
    const options = this.#options;
    const { container, stateDir, image, port } = options;
    const captureDir = join(options.captureDir, runFolder(this.#startedAt));
    const deadline = Date.now() + CAPTURE_BUDGET_MS;
    const reportedAt = new Date().toISOString();
    const tcpCountersAfter = containerTcpCounters(container, deadline);
    const containerLog = readFile(join(stateDir, "container.log"));
    const probes = reachability(options, reportedAt, deadline);

    const keep = (name: string, text: string): void => {
      try {
        mkdirSync(captureDir, { recursive: true, mode: 0o700 });
        writeFileSync(join(captureDir, name), redact(text), { mode: 0o600 });
      } catch (error) {
        console.error(`container capture: ${name} not written: ${String(error)}`);
      }
    };

    keep("reachability.txt", probes);
    keep("container-tcp-counters-before.txt", this.#tcpCountersBefore);
    keep("container-tcp-counters-after.txt", tcpCountersAfter);
    keep("container-listeners.txt", containerListeners(container, deadline));
    keep("container.log", containerLog);
    keep("execution-identity.txt", executionIdentity(image, deadline));
    keep("container-process-before.txt", this.#processBefore);
    keep("container-process-after.txt", processIdentity(container, deadline));
    keep(
      "container-state.txt",
      describe(
        run(
          "podman",
          ["inspect", container, "--format", "{{json .State}} RestartCount={{.RestartCount}}"],
          deadline,
        ),
      ),
    );

    const events = run(
      "podman",
      [
        "events",
        "--stream=false",
        "--format",
        EVENT_FORMAT,
        "--since",
        String(this.#startedAt),
        "--filter",
        `container=${container}`,
      ],
      deadline,
    );

    keep("container-events.jsonl", events.stdout);
    keep("container-events-status.txt", `exit ${events.status}\n${events.stderr}${events.error}\n`);
    keep(
      "container-sockets.txt",
      describe(
        run("podman", ["exec", container, "tail", "-n", "+1", ...CONTAINER_FILES], deadline),
      ),
    );
    keep("pasta.log", withoutHostNetwork(readFile(join(stateDir, "pasta.log"))));
    keep("port-forward-processes.txt", ownForwarder(options, deadline));
    keep("host-counters-before.txt", this.#hostCountersBefore);
    keep("host-counters-after.txt", readFile("/proc/net/netstat"));
    keep("host-listen-sockets-after.txt", listeningSockets(port));
    keep(
      "kernel-log.txt",
      describe(
        run("journalctl", ["--dmesg", "--no-pager", "--since", `@${this.#startedAt}`], deadline),
      ),
    );
    console.error(`container capture: evidence written to ${captureDir}`);
  }
}
