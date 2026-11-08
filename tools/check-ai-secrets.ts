import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { crc32, deflateRawSync } from "node:zlib";

import { z } from "zod";

import { zipEntries } from "./zip-entries.ts";

interface Inspection {
  readonly matches: number;
  readonly entries: number;
}

interface ScanResult extends Inspection {
  readonly files: number;
}

const EMBEDDED_ZIP = /data:application\/zip;base64,([A-Za-z0-9+/=]+)/gu;
const ZIP_LOCAL = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const SETUP_CODE_LINE = /^Setup code: (?!\[redacted\]$)\S+$/mu;

const CodexAuthSchema = z.object({
  tokens: z.object({ access_token: z.string(), refresh_token: z.string(), id_token: z.string() }),
});

function codexCredentials(encoded: string | undefined): string[] {
  if (encoded === undefined || encoded === "") return [];

  const { tokens } = CodexAuthSchema.parse(
    JSON.parse(Buffer.from(encoded, "base64").toString("utf8")),
  );

  return [encoded, tokens.access_token, tokens.refresh_token, tokens.id_token];
}

function credentialForms(key: string) {
  const values = [key, `Bearer ${key}`];

  return values.flatMap((value) => [
    Buffer.from(value),
    Buffer.from(encodeURIComponent(value)),
    Buffer.from(Buffer.from(value).toString("base64")),
    Buffer.from(Buffer.from(value).toString("base64url")),
  ]);
}

function inspect(input: Uint8Array, needles: readonly Uint8Array[]): Inspection {
  const data = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  let matches = needles.some((needle) => data.includes(needle)) ? 1 : 0;
  let entries = 0;

  const embedded = [...data.toString("utf8").matchAll(EMBEDDED_ZIP)].map((match) =>
    Buffer.from(match[1] ?? "", "base64"),
  );

  const archives = data.subarray(0, 4).equals(ZIP_LOCAL) ? [data, ...embedded] : embedded;

  for (const archive of archives) {
    for (const entry of zipEntries(archive)) {
      const nested = inspect(entry, needles);
      matches += nested.matches;
      entries += 1 + nested.entries;
    }
  }

  return { matches, entries };
}

function plantedZip(value: Uint8Array, method: 0 | 8): Buffer {
  const payload = method === 8 ? deflateRawSync(value) : value;
  const name = Buffer.from("control");
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(method, 8);
  local.writeUInt32LE(crc32(value), 14);
  local.writeUInt32LE(payload.length, 18);
  local.writeUInt32LE(value.length, 22);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(method, 10);
  central.writeUInt32LE(crc32(value), 16);
  central.writeUInt32LE(payload.length, 20);
  central.writeUInt32LE(value.length, 24);
  central.writeUInt16LE(name.length, 28);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12);
  end.writeUInt32LE(local.length + name.length + payload.length, 16);

  return Buffer.concat([local, name, payload, central, name, end]);
}

function positiveControls(needles: readonly Uint8Array[]): number {
  let count = 0;

  if (
    !SETUP_CODE_LINE.test("x\nSetup code: abc\ny") ||
    SETUP_CODE_LINE.test("Setup code: [redacted]")
  )
    throw new Error("Setup code positive control failed");
  count += 1;

  for (const needle of needles) {
    if (inspect(needle, needles).matches !== 1)
      throw new Error("Credential positive control failed");
    count += 1;

    for (const method of [0, 8] as const) {
      const html = Buffer.from(
        `data:application/zip;base64,${plantedZip(needle, method).toString("base64")}`,
      );

      if (inspect(html, needles).matches < 1)
        throw new Error("Embedded ZIP positive control failed");
      count += 1;
    }
  }

  return count;
}

function inspectFile(path: string, needles: readonly Uint8Array[], logged: boolean): ScanResult {
  const data = readFileSync(path);
  const found = inspect(data, needles);
  const unredacted = logged && SETUP_CODE_LINE.test(data.toString("utf8")) ? 1 : 0;

  return { files: 1, ...found, matches: found.matches + unredacted };
}

function scan(directory: string, needles: readonly Uint8Array[]): ScanResult {
  const totals = { files: 0, entries: 0, matches: 0 };
  const logged = basename(directory) === "logs";

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    const found = entry.isDirectory() ? scan(path, needles) : inspectFile(path, needles, logged);

    totals.files += found.files;
    totals.entries += found.entries;
    totals.matches += found.matches;
  }

  return totals;
}

const env = z
  .object({
    THREADSIFT_WRONG_AI_KEY: z.string().min(1),
    THREADSIFT_WRONG_GITHUB_TOKEN: z.string().min(1),
    CLOUDFLARE_WORKERS_AI_TOKEN: z.string().optional(),
    CLAUDE_CODE_OAUTH_TOKEN: z.string().optional(),
    CODEX_AUTH_JSON_B64: z.string().optional(),
    THREADSIFT_CODEX_REFRESHED_B64: z.string().optional(),
    THREADSIFT_E2E_GITHUB_TOKEN: z.string().optional(),
    THREADSIFT_PROOF_SECRETS_FILE: z.string().optional(),
  })
  .parse(process.env);

const [directory, floor = "1", extra] = process.argv.slice(2);

if (directory === undefined || extra !== undefined)
  throw new Error("Usage: node tools/check-ai-secrets.ts <artifacts> [minimum-files]");

const minimumFiles = z.coerce.number().int().positive().parse(floor);

const proofSecrets =
  env.THREADSIFT_PROOF_SECRETS_FILE === undefined
    ? []
    : readFileSync(env.THREADSIFT_PROOF_SECRETS_FILE, "utf8").split("\n");

const needles = [
  ...proofSecrets,
  env.THREADSIFT_WRONG_AI_KEY,
  env.THREADSIFT_WRONG_GITHUB_TOKEN,
  env.CLOUDFLARE_WORKERS_AI_TOKEN ?? "",
  env.CLAUDE_CODE_OAUTH_TOKEN ?? "",
  ...codexCredentials(env.CODEX_AUTH_JSON_B64),
  ...codexCredentials(env.THREADSIFT_CODEX_REFRESHED_B64),
  env.THREADSIFT_E2E_GITHUB_TOKEN ?? "",
]
  .filter((key) => key !== "")
  .flatMap((key) => credentialForms(key));

const controls = positiveControls(needles);
const result = scan(directory, needles);

console.log(JSON.stringify({ ...result, positiveControls: controls, minimumFiles }));

process.exitCode = result.matches > 0 || result.files < minimumFiles ? 1 : 0;
