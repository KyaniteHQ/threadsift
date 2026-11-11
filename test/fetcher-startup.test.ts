import assert from "node:assert/strict";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { pathToFileURL } from "node:url";

import { SavedItemResponseSchema } from "../src/http/schemas.ts";
import { fetcherFile } from "./fetcher-record.ts";
import { Instance } from "./instance.ts";

const FIRST = fetcherFile("first.mts");

const SECOND = fetcherFile("second.mts");

const FETCHERS_FOLDER = fetcherFile("");

const COMMA_URL = pathToFileURL(fetcherFile("comma,in-name.mts")).href.replace(",", "%2C");

const MISSING = fetcherFile("missing.mts");

const REFUSED = [
  ["a relative path", "test/fetchers/first.mts", "specifier", "TypeError"],
  ["a bare package name", "left-pad", "specifier", "TypeError"],
  ["another scheme", "https://example.com/plugin.mts", "specifier", "TypeError"],
  ["a file URL with a query", `${pathToFileURL(FIRST).href}?x=1`, "specifier", "TypeError"],
  ["a file URL with a fragment", `${pathToFileURL(FIRST).href}#x`, "specifier", "TypeError"],
  ["a file URL with a remote host", "file://example.com/plugin.mts", "specifier", "TypeError"],
  ["a missing file", MISSING, "file", "Error"],
  ["a directory", FETCHERS_FOLDER, "file", "TypeError"],
  ["a module with no default export", fetcherFile("no-default-export.mts"), "shape", "ZodError"],
  ["a default export with no fetch", fetcherFile("default-without-fetch.mts"), "shape", "ZodError"],
  ["a module whose import throws", fetcherFile("import-throws.mts"), "import", "Error"],
] as const;

const refusal = async (list: string): Promise<string> => {
  const outcome = await Instance.start({ fetchers: list }).then(
    (instance) => instance,
    (error: Error) => error,
  );

  if (outcome instanceof Instance) {
    await outcome.close();

    return "the start was not refused";
  }

  return outcome.message;
};

const failedAt = (module: string, stage: string, errorClass: string) =>
  `fetcher module ${JSON.stringify(module)} failed at ${stage} (${errorClass})`;

describe("the container loads the modules named in THREADSIFT_FETCHERS before it starts any work", () => {
  for (const [name, module, stage, errorClass] of REFUSED) {
    it(`refuses to start with ${name}, names the module and the stage and drops the module's own message`, async () => {
      const message = await refusal(module);

      assert.equal(message, failedAt(module, stage, errorClass));
      assert.equal(message.includes("IMPORTMARKER"), false);
    });
  }

  for (const [name, list] of [
    ["an empty entry between two modules", `${FIRST},,${SECOND}`],
    ["a trailing comma", `${FIRST},`],
    ["a leading comma", `,${FIRST}`],
  ] as const) {
    it(`refuses to start with ${name}`, async () => {
      assert.equal(await refusal(list), failedAt("", "specifier", "TypeError"));
    });
  }

  it("refuses to start when two entries name one file, also through a link or a file URL", async () => {
    const folder = await mkdtemp(join(tmpdir(), "threadsift-fetchers-"));
    const link = join(folder, "again.mts");
    const fileUrl = pathToFileURL(FIRST).href;

    try {
      await symlink(FIRST, link);

      const messages = await Promise.all(
        [`${FIRST},${FIRST}`, `${FIRST},${link}`, `${FIRST},${fileUrl}`].map((list) =>
          refusal(list),
        ),
      );

      assert.deepEqual(messages, [
        failedAt(FIRST, "file", "TypeError"),
        failedAt(link, "file", "TypeError"),
        failedAt(fileUrl, "file", "TypeError"),
      ]);
    } finally {
      await rm(folder, { recursive: true });
    }
  });

  it("loads an absolute path, a file URL with a percent-encoded comma and the localhost form, and trims each entry", async () => {
    const instance = await Instance.start({
      fetchers: ` ${FIRST} , ${COMMA_URL} ,${pathToFileURL(fetcherFile("short.mts")).href.replace("file://", "file://localhost")}`,
    });

    try {
      await instance.setUp();

      const read = async (url: string) => {
        const { item } = await instance.read("POST", "/api/items", SavedItemResponseSchema, {
          url,
        });

        await instance.settledItem(item.id);

        return instance.detail(item.id);
      };

      assert.equal((await read("https://first.test/a")).postText?.includes("FIRSTMARKER"), true);
      assert.equal((await read("https://comma.test/a")).postText?.includes("COMMAMARKER"), true);
      assert.equal((await read("https://short.test/a")).title, "A short page");
    } finally {
      await instance.close();
    }
  });

  for (const [name, list] of [
    ["unset", undefined],
    ["empty", ""],
    ["blank", "   "],
  ] as const) {
    it(`starts with no plug-in when the variable is ${name}`, async () => {
      const instance = await Instance.start({ fetchers: list });

      await instance.close();
    });
  }
});
