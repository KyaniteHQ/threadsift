import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { Reporter, TestCase, TestResult } from "@playwright/test/reporter";
import type { z } from "zod";

import {
  COMMAND_TIMEOUT_MS,
  OptionsSchema,
  type Options,
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
  "/proc/net/netstat",
  "/proc/net/tcp",
  "/proc/sys/net/core/somaxconn",
  "/proc/sys/net/ipv4/tcp_abort_on_overflow",
  "/sys/fs/cgroup/memory.events",
  "/sys/fs/cgroup/memory.current",
  "/sys/fs/cgroup/memory.max",
];

export default class ContainerCapture implements Reporter {
  readonly #options: Options;

  readonly #startedAt = Math.floor(Date.now() / 1000);

  readonly #hostCountersBefore = readFile("/proc/net/netstat");

  #processBefore = "";

  #captured = false;

  constructor(options: z.input<typeof OptionsSchema>) {
    this.#options = OptionsSchema.parse(options);
  }

  onTestBegin(): void {
    if (this.#processBefore === "") {
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
    const { container, stateDir, captureDir, image, port } = options;
    const deadline = Date.now() + CAPTURE_BUDGET_MS;
    const endedAt = new Date(result.startTime.getTime() + result.duration).toISOString();
    const probes = reachability(options, endedAt, deadline);

    const keep = (name: string, text: string): void => {
      try {
        mkdirSync(captureDir, { recursive: true });
        writeFileSync(join(captureDir, name), redact(text));
      } catch (error) {
        console.error(`container capture: ${name} not written: ${String(error)}`);
      }
    };

    keep("reachability.txt", probes);
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
    keep("container.log", readFile(join(stateDir, "container.log")));
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
  }
}
