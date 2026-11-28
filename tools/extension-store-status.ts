import { appendFileSync } from "node:fs";

import { z } from "zod";

import { GECKO_ID } from "../extension/lib/gecko-id.ts";
import {
  type StoreAccess,
  chromeAuthorization,
  firefoxAuthorization,
  found,
  present,
} from "./extension-store-access.ts";

const BEHIND_LIMIT_DAYS = 21;
const CHROME_API = "https://chromewebstore.googleapis.com/v2";
const FIREFOX_API = "https://addons.mozilla.org/api/v5/addons/addon";
const FIREFOX_REFUSED_ADDON = new Set(["deleted", "disabled", "rejected"]);
const CHROME_HOLDS = new Set(["PENDING_REVIEW", "STAGED", "PUBLISHED", "PUBLISHED_TO_TESTERS"]);
const FIREFOX_EXTENSION_NAME = "FIREFOX_EXTENSION_ID";
const CHROME = "Chrome Web Store";
const FIREFOX = "Firefox Add-ons";

export const STORES = [CHROME, FIREFOX] as const;

export type Store = (typeof STORES)[number];

export interface Expected {
  readonly version: string;
  readonly tag: { readonly name: string; readonly days: number } | undefined;
}

export interface StoreState {
  readonly store: Store;
  readonly shown: readonly string[];
  readonly submission: string;
  readonly holds: boolean;
  readonly problems: readonly string[];
}

export type StoreRead =
  | { readonly kind: "read"; readonly state: StoreState }
  | { readonly kind: "failed"; readonly store: Store; readonly error: string };

interface Revision {
  readonly state: string;
  readonly versions: readonly string[];
}

const RevisionSchema = z
  .object({
    state: z.string(),
    distributionChannels: z.array(z.object({ crxVersion: z.string().optional() })).optional(),
  })
  .transform((revision): Revision => ({
    state: revision.state,
    versions: (revision.distributionChannels ?? []).flatMap((channel) =>
      channel.crxVersion === undefined ? [] : [channel.crxVersion],
    ),
  }))
  .optional();
const ChromeStatusSchema = z.object({
  publishedItemRevisionStatus: RevisionSchema,
  submittedItemRevisionStatus: RevisionSchema,
  takenDown: z.boolean().optional(),
  warned: z.boolean().optional(),
});
const FirefoxAddonSchema = z.object({
  guid: z.string(),
  status: z.string(),
  is_disabled: z.boolean(),
  current_version: z.object({ version: z.string() }).nullable(),
});
const FirefoxVersionSchema = z.object({
  version: z.string(),
  file: z.object({ status: z.string() }),
});

function behind(
  store: string,
  shown: readonly string[],
  expected: Readonly<Expected>,
): readonly string[] {
  const { tag } = expected;
  if (tag === undefined || shown.includes(expected.version) || tag.days < BEHIND_LIMIT_DAYS) {
    return [];
  }
  return [
    `${store} still shows ${shown.join(", ") || "no version"} ${String(tag.days)} days after ${tag.name}`,
  ];
}

function rejected(revision: Readonly<Revision> | undefined): readonly string[] {
  return revision?.state === "REJECTED"
    ? [`${CHROME} rejected ${revision.versions.join(", ") || "a revision"}`]
    : [];
}

async function chromeState(
  access: Readonly<StoreAccess>,
  expected: Readonly<Expected>,
): Promise<StoreState> {
  const item = await present(
    {
      store: CHROME,
      url: `${CHROME_API}/publishers/${access.chromePublisher}/items/${access.chromeExtension}:fetchStatus`,
      headers: { authorization: await chromeAuthorization(access.chromeSignIn) },
    },
    ChromeStatusSchema,
  );
  const published = item.publishedItemRevisionStatus;
  const submitted = item.submittedItemRevisionStatus;
  const shown = published?.state === "PUBLISHED" ? published.versions : [];
  return {
    store: CHROME,
    shown,
    holds: [published, submitted].some(
      (revision) =>
        revision !== undefined &&
        CHROME_HOLDS.has(revision.state) &&
        revision.versions.includes(expected.version),
    ),
    submission:
      submitted === undefined
        ? "none"
        : `${submitted.state} ${submitted.versions.join(", ")}`.trim(),
    problems: [
      ...(item.takenDown === true ? [`${CHROME} took the item down`] : []),
      ...(item.warned === true ? [`${CHROME} warned the item for a policy violation`] : []),
      ...rejected(published),
      ...rejected(submitted),
      ...behind(CHROME, shown, expected),
    ],
  };
}

async function firefoxState(
  access: Readonly<StoreAccess>,
  expected: Readonly<Expected>,
): Promise<StoreState> {
  const addonUrl = `${FIREFOX_API}/${encodeURIComponent(access.firefoxExtension)}`;
  const addon = await present(
    {
      store: FIREFOX,
      url: `${addonUrl}/`,
      headers: { authorization: firefoxAuthorization(access) },
    },
    FirefoxAddonSchema,
  );
  const version = await found(
    {
      store: FIREFOX,
      url: `${addonUrl}/versions/${encodeURIComponent(expected.version)}/`,
      headers: { authorization: firefoxAuthorization(access) },
    },
    FirefoxVersionSchema,
  );
  const shown = addon.current_version === null ? [] : [addon.current_version.version];
  return {
    store: FIREFOX,
    shown,
    holds: version !== undefined,
    submission:
      version === undefined
        ? `${expected.version} not uploaded`
        : `${version.version} ${version.file.status}`,
    problems: [
      ...(addon.guid === GECKO_ID
        ? []
        : [
            `${FIREFOX_EXTENSION_NAME} names the add-on ${addon.guid}, not the Extension's ${GECKO_ID}`,
          ]),
      ...(FIREFOX_REFUSED_ADDON.has(addon.status)
        ? [`the add-on's status is ${addon.status}`]
        : []),
      ...(addon.is_disabled ? ["the add-on is disabled"] : []),
      ...(version?.file.status === "disabled"
        ? [`${FIREFOX} rejected or disabled ${version.version}`]
        : []),
      ...behind(FIREFOX, shown, expected),
    ],
  };
}

function row(read: Readonly<StoreRead>): string {
  if (read.kind === "failed")
    return `| ${read.store} | unknown | unknown | the read failed: ${read.error} |`;
  const { state } = read;
  return `| ${state.store} | ${state.shown.join(", ") || "none"} | ${state.submission} | ${state.problems.join("; ") || "none"} |`;
}

async function settled(store: Store, read: () => Promise<StoreState>): Promise<StoreRead> {
  try {
    return { kind: "read", state: await read() };
  } catch (error) {
    return { kind: "failed", store, error: error instanceof Error ? error.message : String(error) };
  }
}

export function readStores(
  access: Readonly<StoreAccess>,
  expected: Readonly<Expected>,
): Promise<readonly StoreRead[]> {
  return Promise.all([
    settled(CHROME, () => chromeState(access, expected)),
    settled(FIREFOX, () => firefoxState(access, expected)),
  ]);
}

export function reportStores(reads: readonly StoreRead[], expected: Readonly<Expected>): boolean {
  const age =
    expected.tag === undefined
      ? ""
      : `, ${expected.tag.name} is ${String(expected.tag.days)} days old`;
  const text = [
    `Extension ${expected.version}${age}`,
    "",
    "| Store | Public version | Submission | Problems |",
    "|---|---|---|---|",
    ...reads.map((read) => row(read)),
    "",
  ].join("\n");
  process.stdout.write(text);
  const summary = process.env["GITHUB_STEP_SUMMARY"];
  if (summary !== undefined && summary !== "") appendFileSync(summary, text);
  return reads.every((read) => read.kind === "read" && read.state.problems.length === 0);
}
