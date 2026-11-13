import { execFile } from "node:child_process";
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
  private events = 0;

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

  tmpFile(name: string, text: string): string {
    mkdirSync(join(this.path, "tmp"), { recursive: true });

    return this.written(join(this.path, "tmp", name), text);
  }

  taskFile(id: number, name: string, text: string): string {
    mkdirSync(this.taskFolder(id), { recursive: true });

    return this.written(join(this.taskFolder(id), name), text);
  }

  event(body: string): string {
    return this.tmpFile(`event-${String((this.events += 1))}.json`, body);
  }

  tree(): readonly string[] {
    return readdirSync(this.path, { recursive: true }).map(String).toSorted();
  }

  private written(file: string, text: string): string {
    writeFileSync(file, text);

    return file;
  }

  run(args: readonly string[], env: Readonly<Record<string, string>>): Promise<Ran> {
    const options = { env: { PATH: process.env["PATH"] ?? "", ...env } };

    return new Promise((resolve) => {
      execFile(
        "bash",
        [join(this.path, "threadsift.sh"), ...args],
        options,
        (error, stdout, stderr) => {
          resolve({
            word: stdout.trim(),
            reasons: stderr,
            code: error === null ? 0 : (ExitSchema.safeParse(error).data?.code ?? 1),
          });
        },
      );
    });
  }

  remove(): void {
    rmSync(this.path, { recursive: true });
  }
}
