import {
  PASTE_RESTORING_REFUSAL,
  RESTORING_REFUSAL,
} from "../src/core/contract/restore-contract.ts";
import { saveUnresolved } from "../src/features/paste/core/item-save.ts";
import { linkVolume, propose, seedVolume } from "./accept-fixtures.ts";
import { proposeDisagreement } from "./disagreement-fixtures.ts";
import { type Answer, Instance, SECRET_KEY } from "./instance.ts";
import { paste, saveProvider } from "./library-fixtures.ts";
import { seedProposal } from "./proposal-seed.ts";
import { holdLibrary, releaseLibrary } from "./restore-fixtures.ts";

export const HELD = { status: 503, body: RESTORING_REFUSAL };

export const PASTE_HELD = { status: 503, body: PASTE_RESTORING_REFUSAL };

const RECORDS = [
  ["highlights", "1 = 1"],
  ["notes", "1 = 1"],
  ["pins", "1 = 1"],
  ["ai_tasks", "1 = 1"],
  ["log_entries", "1 = 1"],
  ["settings", "model = 'saved while held'"],
  ["reddit_settings", "archive_fill = 0"],
] as const;

export interface OwnerLibrary {
  readonly instance: Instance;
  readonly one: number;
  readonly two: number;
  readonly proposals: readonly number[];
}

export async function ownerLibrary(): Promise<OwnerLibrary> {
  const instance = await Instance.start({ secretKey: SECRET_KEY });

  await instance.setUp();
  const one = await paste(instance, "one", { title: "One", tags: ["ml", "machine learning"] });
  const two = await paste(instance, "two", { title: "Two", tags: ["ml"] });
  await paste(instance, "gap", { title: "Gap", topic: "Gaps" });
  const gaps = instance.database.count("select id as n from topics where name = 'Gaps'");

  await saveProvider(instance);

  return {
    instance,
    one,
    two,
    proposals: [
      propose(instance, ["ml", "machine learning"]),
      proposeDisagreement(instance, [one, two]),
      seedProposal(instance, "overview-gap", { topicId: gaps }, { reason: "Gap." }),
    ],
  };
}

type Door = readonly [name: string, send: () => Promise<Answer>, success: number];

export async function ownerDoors({
  instance,
  one,
  two,
  proposals,
}: Readonly<OwnerLibrary>): Promise<readonly Door[]> {
  const reader = await instance.detail(one);
  const text = reader.postText ?? "";
  const item = (path: string) => `/api/items/${String(one)}${path}`;

  return [
    [
      "keep a Highlight",
      () =>
        instance.send("POST", item("/highlights"), {
          target: { kind: "post" },
          revision: reader.highlights.revisions.post,
          selector: { exact: text.slice(0, 20), prefix: "", suffix: text.slice(20, 52), hint: 0 },
        }),
      201,
    ],
    [
      "save a Note",
      () => instance.send("PUT", item("/note"), { body: "typed", revision: reader.note.revision }),
      200,
    ],
    ["ask for a Digest", () => instance.send("POST", `/api/items/${String(two)}/digest`), 200],
    ["ask for a Topic overview", () => instance.send("POST", "/api/topics/reading/overview"), 202],
    ...proposals.map((id): Door => [
      `accept Proposal ${String(id)}`,
      () => instance.send("POST", `/api/proposals/${String(id)}/accept`),
      200,
    ]),
    ["verify the Provider", () => instance.send("POST", "/api/settings/ai/verify"), 200],
    [
      "save the Provider",
      () =>
        instance.send("PUT", "/api/settings/ai", {
          provider: "openai-compatible",
          baseUrl: "http://127.0.0.1:9/v1",
          model: "saved while held",
          key: "not-used",
        }),
      200,
    ],
    [
      "save the Reddit setting",
      () => instance.send("PUT", "/api/settings/reddit", { archiveFill: false }),
      200,
    ],
  ];
}

export function stagedMerge(instance: Instance): void {
  instance.database.exec(
    "insert into tags (id, key, name) values (91, 'big', 'big'), (92, 'bigger', 'bigger')",
  );
  seedVolume(instance, { tags: ["big"], items: 150, from: 1 });
  linkVolume(instance, { tag: "big", items: 150, from: 1 });
  seedProposal(
    instance,
    "tag-merge",
    { fromTagId: 91, intoTagId: 92 },
    {
      id: 70,
      reason: "Same.",
      state: "accepting",
      run: { cursor: 100100, moved: 100, unitRevision: 1 },
    },
  );
  instance.database.exec(
    "insert into pins (kind, from_key, from_name, into_tag_id, created_at) values ('tag-merge', 'big', 'big', 92, 1)",
  );
  instance.database.exec(
    "update item_tags set tag_id = 92 where item_id <= 100100 and tag_id = 91",
  );
  instance.database.exec(
    "update digests set digest = json_set(digest, '$.tags', json_array('bigger')) where item_id <= 100100",
  );
}

export function savedUnresolved(instance: Instance, short: string) {
  return saveUnresolved(instance.core, {
    paste: { address: short, addedByToken: null },
    link: { source: "other", kind: "link", normalizedUrl: short },
    fetched: { status: "unresolved" },
    existing: "refresh",
  });
}

export async function closing<Seen>(instance: Instance, run: () => Promise<Seen>): Promise<Seen> {
  try {
    return await run();
  } finally {
    await instance.close();
  }
}

export async function heldThenReleased<Seen>(
  instance: Instance,
  observe: () => Promise<Seen>,
): Promise<readonly [held: Seen, released: Seen]> {
  holdLibrary(instance, "running", null);
  const held = await observe();

  releaseLibrary(instance);

  return [held, await observe()];
}

export interface DoorRun {
  readonly answers: readonly (readonly [door: string, answer: Answer, success: number])[];
  readonly records: readonly number[];
}

export function recordsOf(instance: Instance): readonly number[] {
  return RECORDS.map(([table, where]) => instance.database.rowCount(table, where));
}

export async function throughDoors(library: Readonly<OwnerLibrary>): Promise<DoorRun> {
  const answers: [string, Answer, number][] = [];

  for (const [door, send, success] of await ownerDoors(library)) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- Each door answers on its own, in the order listed.
    answers.push([door, await send(), success]);
  }

  return { answers, records: recordsOf(library.instance) };
}
