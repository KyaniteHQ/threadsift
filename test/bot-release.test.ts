import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

const ROOT = join(import.meta.dirname, "..");

describe("the release tool keeps SHA256SUMS and the hash pinned in SKILL.md true to the files of bot/", () => {
  let copy = "";

  const outsideAnyRepository = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")),
  );

  const release = (mode: string) =>
    spawnSync("bash", [join(copy, "tools", "bot-release.sh"), mode], {
      encoding: "utf8",
      env: outsideAnyRepository,
    });

  const git = (...args: readonly string[]) =>
    spawnSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", ...args], {
      cwd: copy,
      encoding: "utf8",
      env: outsideAnyRepository,
    });

  const skillPath = () => join(copy, "bot", "skills", "threadsift", "SKILL.md");

  before(() => {
    copy = mkdtempSync(join(tmpdir(), "threadsift-release-"));
    mkdirSync(join(copy, "tools"));
    cpSync(join(ROOT, "bot"), join(copy, "bot"), { recursive: true });
    cpSync(join(ROOT, "tools", "bot-release.sh"), join(copy, "tools", "bot-release.sh"));
    writeFileSync(join(copy, "bot", "VERSION"), "0\n");
    writeFileSync(
      skillPath(),
      readFileSync(skillPath(), "utf8").replace(/TAG=[^ ;]+/u, "TAG=unreleased"),
    );
  });

  after(() => {
    rmSync(copy, { recursive: true });
  });

  it("passes on the files of the repository, so the gate fails when a change leaves them out of date", () => {
    const checked = spawnSync("bash", [join(ROOT, "tools", "bot-release.sh"), "check"], {
      encoding: "utf8",
    });

    assert.deepEqual([checked.status, checked.stderr], [0, ""]);
  });

  it("fails after a change to a hashed file until the files are refreshed", () => {
    appendFileSync(join(copy, "bot", "setup.md"), "A changed line.\n");

    const stale = release("check");

    assert.equal(stale.status, 1);
    assert.match(stale.stderr, /SHA256SUMS does not match/u);
    assert.equal(release("refresh").status, 0);
    assert.equal(release("check").status, 0);
  });

  it("fails when the hash pinned in SKILL.md is another one", () => {
    writeFileSync(
      skillPath(),
      readFileSync(skillPath(), "utf8").replace(
        /SUMS_SHA256=[0-9a-f]{64}/u,
        `SUMS_SHA256=${"1".repeat(64)}`,
      ),
    );

    const pinned = release("check");

    assert.equal(pinned.status, 1);
    assert.match(pinned.stderr, /pins another SHA256SUMS hash/u);
    assert.equal(release("refresh").status, 0);
  });

  it("bumps VERSION, writes the tag and the hash into SKILL.md, and fails when VERSION and the tag differ", () => {
    const version = Number(readFileSync(join(copy, "bot", "VERSION"), "utf8"));
    const released = release("release");

    assert.equal(released.stdout.trim(), `bot-v${String(version + 1)}`);
    assert.match(
      readFileSync(skillPath(), "utf8"),
      new RegExp(`TAG=bot-v${String(version + 1)} SUMS_SHA256=[0-9a-f]{64}`, "u"),
    );
    assert.equal(release("check").status, 0);

    writeFileSync(join(copy, "bot", "VERSION"), "99\n");
    assert.match(release("check").stderr, /pins tag bot-v1 but bot\/VERSION is 99/u);
  });

  it("refuses to refresh after a change to a hashed file once the release is tagged, fails the check when the files are refreshed by hand, and passes again after a new release", () => {
    writeFileSync(join(copy, "bot", "VERSION"), "1\n");
    git("init", "--quiet");
    git("add", ".");
    git("commit", "--quiet", "-m", "release");
    git("tag", "bot-v1");
    appendFileSync(join(copy, "bot", "update.md"), "A change after the release.\n");

    const refused = release("refresh");

    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /changed after bot-v1/u);

    const sums = spawnSync(
      "bash",
      [
        "-c",
        "(cd bot && sha256sum setup.md update.md) > bot/SHA256SUMS; (cd bot/scripts && sha256sum threadsift.sh) >> bot/SHA256SUMS; sha256sum bot/SHA256SUMS",
      ],
      { cwd: copy, encoding: "utf8" },
    ).stdout.slice(0, 64);

    writeFileSync(
      skillPath(),
      readFileSync(skillPath(), "utf8").replace(/SUMS_SHA256=[0-9a-f]{64}/u, `SUMS_SHA256=${sums}`),
    );

    const stale = release("check");

    assert.equal(stale.status, 1);
    assert.match(stale.stderr, /changed after bot-v1/u);
    assert.equal(release("release").stdout.trim(), "bot-v2");
    assert.equal(release("check").status, 0);
    assert.match(
      readFileSync(join(copy, "bot", "CHANGELOG.md"), "utf8"),
      /## Unreleased\n\n## bot-v2\n/u,
    );
  });
});
