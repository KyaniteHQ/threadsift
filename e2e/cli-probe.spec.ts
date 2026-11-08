import { expect, test } from "@playwright/test";

import { appShell, installCli, lines, settingsView, taskFolders } from "./cli.ts";
import { CODEX_CLI, codexScreen, inventedCodexAuth, writeCodexAuth } from "./codex.ts";
import { isContainerTarget } from "./target.ts";

test.use({ trace: "off", video: "off", screenshot: "off" });

test.describe.configure({ timeout: 180_000 });

test.skip(!isContainerTarget(), "The CLI runners exist only on the container");

const IGNORES_TERM = "trap '' TERM\nwhile :; do sleep 1; done\n";

const STUCK_CLAUDE = `#!/bin/sh
${IGNORES_TERM}`;

const STUCK_CODEX_LOGIN = `#!/bin/sh
if [ "$1" = login ]; then
${IGNORES_TERM}fi
exec /data/cli/bin/codex-real "$@"
`;

const STUCK_PROCESSES = `for p in /proc/[0-9]*; do tr '\\0' ' ' < $p/cmdline 2>/dev/null; echo; done | grep -E '/data/cli/bin/(claude|codex)( |$)' | grep -v grep; true`;

test("a sign-in probe whose child ignores SIGTERM answers within its 15 s and leaves nothing behind", async ({
  browser,
}) => {
  const screen = await codexScreen(browser);

  try {
    installCli(screen, CODEX_CLI);
    writeCodexAuth(screen, inventedCodexAuth());
    appShell(
      screen,
      `set -e
mv /data/cli/bin/codex /data/cli/bin/codex-real
cat > /data/cli/bin/codex <<'SH'
${STUCK_CODEX_LOGIN}SH
cat > /data/cli/bin/claude <<'SH'
${STUCK_CLAUDE}SH
chmod +x /data/cli/bin/codex /data/cli/bin/claude
`,
    );
    screen.fresh.restart();

    const started = Date.now();
    const view = await settingsView(screen);
    const seconds = (Date.now() - started) / 1000;

    expect(view.providers).toEqual(expect.arrayContaining(["claude-code", "codex"]));
    expect(view.signedIn).toEqual([]);
    expect(
      seconds,
      "the read answers at the probe deadline, not after the kill grace",
    ).toBeGreaterThan(14);
    expect(seconds).toBeLessThan(18);

    await expect
      .poll(() => lines(appShell(screen, STUCK_PROCESSES)), { timeout: 30_000 })
      .toEqual([]);
    await expect.poll(() => taskFolders(screen), { timeout: 30_000 }).toEqual([]);
  } finally {
    await screen.close();
  }
});
