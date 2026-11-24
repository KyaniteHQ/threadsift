import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { storedBytes } from "./file-store-fixtures.ts";
import { Instance } from "./instance.ts";
import { createAgentToken } from "./mcp-client.ts";
import { paste } from "./related-fixtures.ts";
import { rows } from "./sqlite-fixtures.ts";

const PNG = new Uint8Array(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64",
  ),
);

const JPEG = Uint8Array.of(
  0xff,
  0xd8,
  0xff,
  0xe0,
  0,
  0x10,
  0x4a,
  0x46,
  0x49,
  0x46,
  0,
  1,
  0xff,
  0xd9,
);

const GIF = new TextEncoder().encode("GIF89a\u0001\u0000\u0001\u0000\u0000\u0000\u0000;");

const WEBP = new TextEncoder().encode(
  "RIFF\u0000\u0000\u0000\u0000WEBPVP8 \u0000\u0000\u0000\u0000",
);

const AVIF = Uint8Array.of(
  0,
  0,
  0,
  0x18,
  ...new TextEncoder().encode("ftypavif"),
  0,
  0,
  0,
  0,
  ...new TextEncoder().encode("avifmif1"),
);

const HTML = new TextEncoder().encode("<html><script>alert(1)</script></html>");

const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

const dataUrl = (type: string, bytes: Uint8Array) =>
  `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;

interface Case {
  readonly alt: string;
  readonly address: string;
  readonly expected: string | null;
}

const CASES: readonly Case[] = [
  {
    alt: "png",
    address: dataUrl("image/png", PNG),
    expected: "image/png",
  },
  {
    alt: "jpeg",
    address: dataUrl("image/jpeg", JPEG),
    expected: "image/jpeg",
  },
  {
    alt: "jpg",
    address: dataUrl("image/jpg", JPEG),
    expected: "image/jpeg",
  },
  {
    alt: "gif",
    address: dataUrl("image/gif", GIF),
    expected: "image/gif",
  },
  {
    alt: "webp",
    address: dataUrl("image/webp", WEBP),
    expected: "image/webp",
  },
  {
    alt: "avif",
    address: dataUrl("image/avif", AVIF),
    expected: "image/avif",
  },
  {
    alt: "png that is a jpeg",
    address: dataUrl("image/png", JPEG),
    expected: null,
  },
  {
    alt: "png that is a page",
    address: dataUrl("image/png", HTML),
    expected: null,
  },
  {
    alt: "svg",
    address: dataUrl("image/svg+xml", SVG),
    expected: null,
  },
  {
    alt: "page typed as html",
    address: dataUrl("text/html", HTML),
    expected: null,
  },
  {
    alt: "not base64",
    address: "data:image/png,abc",
    expected: null,
  },
];

const MediaRowSchema = z.object({
  position: z.number(),
  file_key: z.string(),
  content_type: z.string(),
});

const servedAs = (instance: Instance, key: string) => instance.request(`/api/files/${key}`);

describe("an Article's inline images are stored when the declared type and the bytes agree, and every other one stays out of the file route", () => {
  let instance: Instance;
  let itemId: number;
  let otherId: number;
  let stored: readonly z.infer<typeof MediaRowSchema>[];

  const storedPng = () => {
    const png = stored.find(({ content_type: type }) => type === "image/png");

    assert.ok(png !== undefined, "a PNG is stored");

    return png;
  };

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();

    const images = CASES.map(({ alt, address }) => `![${alt}](${address})`).join("\n\n");

    itemId = await paste(instance, "with-images", {
      title: "With images",
      noDigest: true,
      postText: images,
    });
    otherId = await paste(instance, "without-images", { title: "Without images", noDigest: true });

    stored = rows(
      instance,
      MediaRowSchema,
      "select position, file_key, content_type from media where item_id = ? and outcome = 'stored' order by position",
      itemId,
    );
  });

  after(() => instance.close());

  it("stores each image whose declared type matches its bytes, and no other", () => {
    assert.deepEqual(
      stored.map(({ content_type: contentType }) => contentType),
      CASES.flatMap(({ expected }) => (expected === null ? [] : [expected])),
    );
  });

  it("serves a stored image with its own bytes, a generated filename and nosniff", async () => {
    const response = await servedAs(instance, storedPng().file_key);

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/png");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.match(
      response.headers.get("content-disposition") ?? "",
      /^inline; filename="image-\d+\.png"$/u,
    );
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), PNG);
  });

  it("serves every stored type with its own content type", async () => {
    const served = await Promise.all(
      stored.map(async ({ file_key: key }) => {
        const response = await servedAs(instance, key);

        await response.arrayBuffer();

        return [response.status, response.headers.get("content-type")];
      }),
    );

    assert.deepEqual(served, [
      [200, "image/png"],
      [200, "image/jpeg"],
      [200, "image/jpeg"],
      [200, "image/gif"],
      [200, "image/webp"],
      [200, "image/avif"],
    ]);
  });

  it("leaves each image it did not store as its alt text, with no data address in the post text", async () => {
    const { postText } = await instance.detail(itemId);

    assert.ok(postText !== null);
    assert.ok(!postText.includes("data:"));

    for (const { alt } of CASES.filter(({ expected }) => expected === null)) {
      assert.ok(postText.includes(alt), `the post text keeps the alt text "${alt}"`);
    }
  });

  it("answers 404, with the body of an unknown key, for image bytes in the store that no stored media row of the Item names", async () => {
    const { file_key: pngKey } = storedPng();
    const [name = ""] = pngKey.split("/").slice(-1);
    const orphans = [`items/${String(itemId)}/img-0-0-98.png`, `items/${String(otherId)}/${name}`];
    const unknown = `items/${String(itemId)}/img-0-0-99.png`;

    try {
      await Promise.all(orphans.map((key) => instance.core.files.put(key, PNG)));

      const held = await Promise.all(orphans.map((key) => storedBytes(instance, key)));

      assert.deepEqual(held, [PNG, PNG]);

      const answers = await Promise.all(
        [...orphans, unknown].map((key) => servedAs(instance, key)),
      );
      const bodies = await Promise.all(answers.map((answer) => answer.text()));

      assert.deepEqual(
        answers.map(({ status }) => status),
        [404, 404, 404],
      );
      assert.deepEqual(
        bodies.map((body) => z.object({ error: z.string() }).parse(JSON.parse(body))),
        Array.from({ length: 3 }, () => ({ error: "Not found" })),
      );
      assert.ok(
        answers.every((answer) => answer.headers.get("x-content-type-options") === "nosniff"),
      );
      const control = await servedAs(instance, pngKey);

      await control.arrayBuffer();
      assert.equal(control.status, 200);
    } finally {
      await instance.core.files.delete(orphans);
    }
  });

  it("serves the image to a token with the read scope and refuses a token without it", async () => {
    const reader = await createAgentToken(instance, "reads", ["read"]);
    const adder = await createAgentToken(instance, "adds", ["add"]);

    const path = `/api/files/${storedPng().file_key}`;
    const answers = await Promise.all(
      [reader, adder].map((token) =>
        instance.sendWithToken(token.value, "GET", path).then(({ status }) => status),
      ),
    );

    assert.deepEqual(answers, [200, 403]);
  });
});
