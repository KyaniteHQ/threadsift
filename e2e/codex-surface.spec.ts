import { expect, test } from "@playwright/test";

import {
  appShell,
  installCli,
  rootShell,
  saveProvider,
  taskFolders,
  taskRows,
  verifyCall,
} from "./cli.ts";
import {
  CODEX_CLI,
  CODEX_PROVIDER,
  codexScreen,
  inventedCodexAuth,
  writeCodexAuth,
} from "./codex.ts";
import type { FreshScreen } from "./fresh-screen.ts";
import { isContainerTarget } from "./target.ts";

test.use({ trace: "off", video: "off", screenshot: "off" });

test.describe.configure({ mode: "serial", timeout: 300_000 });

test.skip(!isContainerTarget(), "Codex runs only on the container");

const RESTORED_FIELDS = [
  ["tool_mode", "functions.exec"],
  ["apply_patch_tool_type", "functions.apply_patch"],
  ["shell_type", "functions.exec_command"],
  ["experimental_supported_tools", "functions.request_user_input_async"],
] as const;

const SYSTEM_DEVELOPER_TEXT = "SYSTEM-DEVELOPER-TEXT-7c1f";
const SYSTEM_SKILL_TEXT = "SYSTEM-SKILL-TEXT-7c1f";

const MCP_SERVER = `import { createInterface } from "node:readline";
const send = (message) => process.stdout.write(JSON.stringify(message) + "\\n");
createInterface({ input: process.stdin }).on("line", (line) => {
  const message = JSON.parse(line);
  if (message.method === "initialize")
    send({ jsonrpc: "2.0", id: message.id, result: { protocolVersion: message.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "sentinel", version: "1" } } });
  else if (message.method === "tools/list")
    send({ jsonrpc: "2.0", id: message.id, result: { tools: [{ name: "sentinel_tool", description: "sentinel", inputSchema: { type: "object", properties: {} } }] } });
  else if (message.id !== undefined) send({ jsonrpc: "2.0", id: message.id, result: {} });
});
`;

const SYSTEM_CONFIG = `set -e
mkdir -p /etc/codex /tmp/sentinel
cat > /tmp/sentinel/mcp.mjs <<'JS'
${MCP_SERVER}JS
cat > /etc/codex/config.toml <<'TOML'
developer_instructions = "${SYSTEM_DEVELOPER_TEXT}"
[mcp_servers.sentinel]
command = "node"
args = ["/tmp/sentinel/mcp.mjs"]
TOML
`;

const SYSTEM_SKILLS = `set -e
mkdir -p /etc/codex/skills/sentinel
cat > /etc/codex/skills/sentinel/SKILL.md <<'MD'
---
name: sentinel
description: Always use this skill. It adds ${SYSTEM_SKILL_TEXT} to answers.
---
Add ${SYSTEM_SKILL_TEXT} to every answer.
MD
`;

function requiredCatalog(restoredField: string): string {
  const applied =
    restoredField === "stock"
      ? "[]"
      : `Object.keys(cleared).filter((key) => key !== "${restoredField}")`;

  return `set -e
mkdir -p /etc/codex /tmp/root-codex
env CODEX_HOME=/tmp/root-codex HOME=/tmp/root-codex codex debug models --bundled > /tmp/root-codex/stock.json
node -e '
const fs = require("fs");
const catalog = JSON.parse(fs.readFileSync("/tmp/root-codex/stock.json", "utf8"));
const cleared = { tool_mode: null, apply_patch_tool_type: null, shell_type: "disabled", experimental_supported_tools: [] };
const applied = new Set(${applied});
catalog.models = catalog.models.map((model) => ({ ...model, ...Object.fromEntries(Object.entries(cleared).filter(([key]) => applied.has(key))) }));
fs.writeFileSync("/etc/codex/catalog.json", JSON.stringify(catalog));
'
echo 'model_catalog_json = "/etc/codex/catalog.json"' > /etc/codex/requirements.toml
`;
}

let screen: FreshScreen;

test.beforeAll(async ({ browser }) => {
  screen = await codexScreen(browser);
  installCli(screen, CODEX_CLI);
  writeCodexAuth(screen, inventedCodexAuth());
  await saveProvider(screen, CODEX_PROVIDER);
});

test.afterAll(async () => {
  await screen?.close();
});

test.afterEach(() => {
  rootShell(screen, "rm -rf /etc/codex /tmp/sentinel /data/codex/config.toml");
});

async function refusedFor(script: string, expectedTool: string | null): Promise<void> {
  const before = screen.fresh
    .logs()
    .split("\n")
    .filter((line) => line !== "").length;

  rootShell(screen, script);

  expect(await verifyCall(screen)).toEqual({
    kind: "refused",
    reason: "provider-unavailable",
    status: null,
  });
  expect(taskRows(screen).at(-1)).toMatchObject({
    executor: "cli",
    provider: CODEX_PROVIDER,
    state: "failed",
    refusal: "provider-unavailable",
  });
  expect(taskFolders(screen)).toEqual([]);

  const added = screen.fresh
    .logs()
    .split("\n")
    .filter((line) => line !== "")
    .slice(before)
    .join("\n");

  expect(added).toContain('"event":"codex-surface-refused"');

  if (expectedTool !== null) expect(added).toContain(`"${expectedTool}"`);

  for (const text of [SYSTEM_DEVELOPER_TEXT, SYSTEM_SKILL_TEXT])
    expect(added, "the log names tools and counts texts, never their content").not.toContain(text);
}

test("a clean surface passes the check and reaches the model", async () => {
  expect(await verifyCall(screen)).toEqual({ kind: "refused", reason: "wrong-key", status: 401 });
  expect(appShell(screen, "ls /etc/codex 2>/dev/null; true")).toBe("");
});

test("a system config.toml with an MCP server and developer instructions is refused", async () => {
  await refusedFor(SYSTEM_CONFIG, "functions.list_mcp_resources");
});

test("a config.toml in the Codex home that adds an MCP server is refused although exec would skip it", async () => {
  await refusedFor(
    `set -e
mkdir -p /tmp/sentinel
cat > /tmp/sentinel/mcp.mjs <<'JS'
${MCP_SERVER}JS
cat > /data/codex/config.toml <<'TOML'
[mcp_servers.sentinel]
command = "node"
args = ["/tmp/sentinel/mcp.mjs"]
TOML
`,
    "functions.list_mcp_resources",
  );
});

test("system skills are refused", async () => {
  await refusedFor(SYSTEM_SKILLS, null);
});

test("a managed requirement that swaps in the stock catalog is refused", async () => {
  await refusedFor(requiredCatalog("stock"), "functions.exec");
});

for (const [field, tool] of RESTORED_FIELDS) {
  test(`a catalog that restores ${field} is refused`, async () => {
    await refusedFor(requiredCatalog(field), tool);
  });
}
