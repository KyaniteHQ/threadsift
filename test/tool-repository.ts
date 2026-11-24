import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempDisposableSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const REPOSITORY = join(import.meta.dirname, "..");

const TOOL_FILES = ["doc-lines.ts", "doc-refs.ts", "docs-impact.ts", "check-core-layout.ts"];

const ENVIRONMENT = {
  ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_"))),
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
};

const IDENTITY = ["-c", "user.name=Test", "-c", "user.email=test@example.test"];

type Files = Readonly<Record<string, string>>;

function write(root: string, files: Files): void {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
}

export class ToolRepository implements Disposable {
  private readonly scratch: DisposableStack;
  private readonly root: string;

  constructor(files: Files) {
    using stack = new DisposableStack();
    const folder = stack.use(mkdtempDisposableSync(join(tmpdir(), "threadsift-tool-repository-")));

    this.root = folder.path;
    mkdirSync(join(this.root, "tools"));

    for (const file of TOOL_FILES) {
      cpSync(join(REPOSITORY, "tools", file), join(this.root, "tools", file));
    }

    cpSync(
      join(REPOSITORY, "tools", "oxlint", "threadsift"),
      join(this.root, "tools", "oxlint", "threadsift"),
      { recursive: true },
    );
    symlinkSync(join(REPOSITORY, "node_modules"), join(this.root, "node_modules"));
    write(this.root, { ".gitignore": "node_modules\n", ...files });
    this.git("init", "--quiet");
    this.scratch = stack.move();
  }

  private git(...args: readonly string[]): string {
    const run = spawnSync("git", [...IDENTITY, ...args], {
      cwd: this.root,
      encoding: "utf8",
      env: ENVIRONMENT,
    });

    if (run.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${run.stderr}`);

    return run.stdout;
  }

  commit(files: Files = {}): string {
    write(this.root, files);
    this.git("add", "--all");
    this.git("commit", "--quiet", "--message", "a commit");

    return this.git("rev-parse", "HEAD").trim();
  }

  write(files: Files): void {
    write(this.root, files);
  }

  move(from: string, to: string): void {
    this.git("mv", from, to);
  }

  run(tool: string, ...args: readonly string[]) {
    const run = spawnSync(process.execPath, [join(this.root, "tools", tool), ...args], {
      cwd: this.root,
      encoding: "utf8",
      env: ENVIRONMENT,
    });

    return { status: run.status, stdout: run.stdout, stderr: run.stderr };
  }

  [Symbol.dispose](): void {
    this.scratch.dispose();
  }
}
