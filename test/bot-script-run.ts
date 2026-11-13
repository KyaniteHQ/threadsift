import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { z } from "zod";

const SCRIPT = join(import.meta.dirname, "..", "bot", "scripts", "threadsift.sh");

const ExitSchema = z.object({ code: z.number() });

export interface Ran {
  readonly word: string;
  readonly reasons: string;
  readonly code: number;
}

export class ScriptFolder {
  readonly path = mkdtempSync(join(tmpdir(), "threadsift-script-"));

  constructor() {
    copyFileSync(SCRIPT, join(this.path, "threadsift.sh"));
  }

  taskFolder(id: number | string): string {
    return join(this.path, "tasks", String(id));
  }

  fileOf(id: number, name: string): string | null {
    try {
      return readFileSync(join(this.taskFolder(id), name), "utf8");
    } catch {
      return null;
    }
  }

  tmpFile(prefix: string, text: string, extension = "json"): string {
    mkdirSync(join(this.path, "tmp"), { recursive: true });

    const file = join(
      this.path,
      "tmp",
      `${prefix}-${randomBytes(16).toString("hex")}.${extension}`,
    );

    writeFileSync(file, text);

    return file;
  }

  event(body: string): string {
    return this.tmpFile("event", body);
  }

  tree(): readonly string[] {
    return readdirSync(this.path, { recursive: true }).map(String).toSorted();
  }

  run(args: readonly string[], env: Readonly<Record<string, string>>, input = ""): Promise<Ran> {
    return this.executed("bash", [join(this.path, "threadsift.sh"), ...args], env, input);
  }

  async heredoc(
    name: string,
    text: string | Uint8Array,
    verb = "write",
  ): Promise<{ readonly delimiter: string; readonly ran: Ran }> {
    const { word: delimiter } = await this.run(["mark"], {});
    const hex = delimiter.slice("TS_".length);

    const command = Buffer.concat([
      Buffer.from(`exec "$1" ${verb} "$2" <<'${delimiter}'\n`),
      Buffer.from(text),
      Buffer.from(`\n${delimiter}\n`),
    ]);

    return { delimiter, ran: await this.script(command, name.replace("<hex>", hex)) };
  }

  script(command: string | Uint8Array, ...args: readonly string[]): Promise<Ran> {
    return this.executed("bash", ["-s", join(this.path, "threadsift.sh"), ...args], {}, command);
  }

  made(prefix: string, text: string | Uint8Array, extension = "json"): Promise<string> {
    return this.madeInParts(prefix, [text], extension);
  }

  async madeInParts(
    prefix: string,
    parts: readonly (string | Uint8Array)[],
    extension = "json",
  ): Promise<string> {
    const [first = "", ...rest] = parts;
    const { delimiter, ran } = await this.heredoc(`${prefix}-<hex>.${extension}`, first);
    const name = `${prefix}-${delimiter.slice("TS_".length)}.${extension}`;

    if (ran.word !== "ok") {
      throw new Error(`write printed [${ran.word}] code ${String(ran.code)} ${ran.reasons}`);
    }

    await rest.reduce(
      (chain, part) => chain.then(() => this.appended(name, part)),
      Promise.resolve(),
    );

    return join(this.path, "tmp", name);
  }

  private async appended(name: string, part: string | Uint8Array): Promise<void> {
    const { ran } = await this.heredoc(name, part, "append");

    if (ran.word !== "ok") {
      throw new Error(`append printed ${ran.word}`);
    }
  }

  private executed(
    program: string,
    args: readonly string[],
    env: Readonly<Record<string, string>>,
    input: string | Uint8Array,
  ): Promise<Ran> {
    const options = {
      env: { PATH: process.env["PATH"] ?? "", ...env },
      cwd: this.path,
    };

    return new Promise((resolve) => {
      const child = execFile(program, [...args], options, (error, stdout, stderr) => {
        resolve({
          word: stdout.trim(),
          reasons: stderr,
          code: error === null ? 0 : (ExitSchema.safeParse(error).data?.code ?? 1),
        });
      });

      child.stdin?.on("error", () => {});
      child.stdin?.end(input);
    });
  }

  remove(): void {
    rmSync(this.path, { recursive: true });
  }
}
