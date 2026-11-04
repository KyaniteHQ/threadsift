import { spawnSync } from "node:child_process";

import { z } from "zod";

const LIMIT_MIB = 64;
const BYTES_PER_UNIT = { B: 1, KiB: 1024, MiB: 1024 ** 2, GiB: 1024 ** 3 };
const BYTES_PER_MIB = 1024 ** 2;
const TOTAL_UPLOAD = /Total Upload: (?<amount>\d+(?:\.\d+)?) (?<unit>B|KiB|MiB|GiB)/u;

const UploadSchema = z.object({
  amount: z.coerce.number(),
  unit: z.enum(["B", "KiB", "MiB", "GiB"]),
});

function dryRunOutput(): string {
  const result = spawnSync(
    "pnpm",
    ["exec", "wrangler", "deploy", "--dry-run", "--outdir", "dist/worker"],
    { encoding: "utf8", env: { ...process.env, WRANGLER_SEND_METRICS: "false" } },
  );

  const output = `${result.stdout}${result.stderr}`;

  if (result.status !== 0) {
    process.stderr.write(output);
    process.exit(result.status ?? 1);
  }

  return output;
}

const output = dryRunOutput();
const upload = UploadSchema.safeParse(TOTAL_UPLOAD.exec(output)?.groups);

if (!upload.success) {
  process.stderr.write(`${output}\nwrangler printed no Total Upload line\n`);
  process.exit(1);
}

const mebibytes = (upload.data.amount * BYTES_PER_UNIT[upload.data.unit]) / BYTES_PER_MIB;

process.stdout.write(
  `Worker bundle: ${mebibytes.toFixed(2)} MiB uncompressed, limit ${LIMIT_MIB} MiB\n`,
);

if (mebibytes > LIMIT_MIB) {
  process.exit(1);
}
