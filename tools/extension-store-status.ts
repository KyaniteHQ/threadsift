import { appendFileSync } from "node:fs";

import { z } from "zod";

import {
  type StoreAccess,
  chromeAuthorization,
  firefoxAuthorization,
  found,
  present,
} from "./extension-store-access.ts";
import { git } from "./release-git.ts";
import { ReleaseError, TAG_PREFIX, parseVersion } from "./release-versions.ts";

const BEHIND_LIMIT_DAYS = 21;
const DAY_MS = 86_400_000;
const CHROME_API = "https://chromewebstore.googleapis.com/v2";
const FIREFOX_API = "https://addons.mozilla.org/api/v5/addons/addon";
const FIREFOX_REFUSED_ADDON = new Set(["deleted", "disabled", "rejected"]);
const CHROME = "Chrome Web Store";
const FIREFOX = "Firefox Add-ons";

export interface Expected {
  readonly version: string;
  readonly tag: { readonly name: string; readonly days: number } | undefined;
}

interface StoreState {
  readonly store: string;
  readonly shown: readonly string[];
  readonly submission: string;
  readonly problems: readonly string[];
}

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
  status: z.string(),
  is_disabled: z.boolean(),
  current_version: z.object({ version: z.string() }).nullable(),
});
const FirefoxVersionSchema = z.object({
  version: z.string(),
  file: z.object({ status: z.string() }),
});

export function stableVersion(tag: string): string {
  const version = tag.startsWith(TAG_PREFIX) ? tag.slice(TAG_PREFIX.length) : "";
  const parsed = parseVersion(version);
  if (parsed === undefined || parsed.rc !== undefined) {
    throw new ReleaseError(
      `${JSON.stringify(tag)} is not a stable release tag v<X.Y.Z>; a release candidate never reaches a store`,
    );
  }
  return version;
}

export function tagged(tag: string): Expected {
  const version = stableVersion(tag);
  const created = git("for-each-ref", "--format=%(creatordate:unix)", `refs/tags/${tag}`);
  if (created === "") {
    throw new ReleaseError(`the clone holds no tag ${tag}; fetch the tags first`);
  }
  return {
    version,
    tag: { name: tag, days: Math.floor((Date.now() - Number(created) * 1000) / DAY_MS) },
  };
}

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
  const addonUrl = `${FIREFOX_API}/${encodeURIComponent(access.firefoxExtension.replaceAll(/^\{|\}$/gu, ""))}`;
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
      url: `${addonUrl}/versions/${TAG_PREFIX}${encodeURIComponent(expected.version)}/`,
      headers: { authorization: firefoxAuthorization(access) },
    },
    FirefoxVersionSchema,
  );
  const shown = addon.current_version === null ? [] : [addon.current_version.version];
  return {
    store: FIREFOX,
    shown,
    submission:
      version === undefined
        ? `${expected.version} not uploaded`
        : `${version.version} ${version.file.status}`,
    problems: [
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

function report(states: readonly StoreState[], expected: Readonly<Expected>): string {
  const age =
    expected.tag === undefined
      ? ""
      : `, ${expected.tag.name} is ${String(expected.tag.days)} days old`;
  return [
    `Extension ${expected.version}${age}`,
    "",
    "| Store | Public version | Submission | Problems |",
    "|---|---|---|---|",
    ...states.map(
      (state) =>
        `| ${state.store} | ${state.shown.join(", ") || "none"} | ${state.submission} | ${state.problems.join("; ") || "none"} |`,
    ),
    "",
  ].join("\n");
}

export async function storeStatus(
  access: Readonly<StoreAccess>,
  expected: Readonly<Expected>,
): Promise<boolean> {
  const states = await Promise.all([chromeState(access, expected), firefoxState(access, expected)]);
  const text = report(states, expected);
  process.stdout.write(text);
  const summary = process.env["GITHUB_STEP_SUMMARY"];
  if (summary !== undefined && summary !== "") appendFileSync(summary, text);
  return states.every((state) => state.problems.length === 0);
}
