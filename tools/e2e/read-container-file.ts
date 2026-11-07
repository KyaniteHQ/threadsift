import { readFileSync } from "node:fs";

const MISSING_STATUS = 3;

const [path = ""] = process.argv.slice(2);

try {
  process.stdout.write(readFileSync(path));
} catch (error) {
  if (
    error instanceof Error &&
    "code" in error &&
    ["ENOENT", "ENOTDIR"].includes(String(error.code))
  ) {
    process.exitCode = MISSING_STATUS;
  } else {
    throw error;
  }
}
