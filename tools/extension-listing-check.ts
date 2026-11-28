import remarkParse from "remark-parse";
import { unified } from "unified";
import { z } from "zod";

export const BROWSERS = ["chrome", "firefox"] as const;

export type Browser = (typeof BROWSERS)[number];

const REASON_PLACES: Readonly<
  Record<Browser, { readonly part: string; readonly section: string; readonly named: boolean }>
> = {
  chrome: {
    part: "Chrome Web Store, Privacy practices",
    section: "Permission justifications",
    named: false,
  },
  firefox: { part: "Firefox Add-ons", section: "Description", named: true },
};

const OPTIONAL_HOSTS = "Optional host permissions";
const NO_DATA_COLLECTED = "none";
const PROCESSOR = unified().use(remarkParse);

const Names = z.array(z.string()).readonly().default([]);

export const ManifestPermissionsSchema = z.object({
  permissions: Names,
  optional_permissions: Names,
  host_permissions: Names,
  optional_host_permissions: Names,
  content_scripts: z
    .array(z.object({ matches: Names }).readonly())
    .readonly()
    .default([]),
  browser_specific_settings: z
    .object({
      gecko: z
        .object({
          data_collection_permissions: z
            .object({ required: Names, optional: Names })
            .readonly()
            .optional(),
        })
        .readonly()
        .optional(),
    })
    .readonly()
    .optional(),
});

type ManifestPermissions = z.infer<typeof ManifestPermissionsSchema>;

type Piece =
  | { readonly kind: "heading"; readonly depth: number; readonly text: string }
  | { readonly kind: "text"; readonly value: string }
  | { readonly kind: "other" };

function manifestEntries(manifest: Readonly<ManifestPermissions>): readonly string[] {
  const data = manifest.browser_specific_settings?.gecko?.data_collection_permissions;
  const named = [
    ...manifest.permissions,
    ...manifest.optional_permissions,
    ...(data?.required ?? []).filter((name) => name !== NO_DATA_COLLECTED),
    ...(data?.optional ?? []),
  ].map((name) => `\`${name}\``);
  const required = new Set([
    ...manifest.host_permissions,
    ...manifest.content_scripts.flatMap(({ matches }) => matches),
  ]);

  return [
    ...named,
    ...[...required].map((pattern) => `Required host permission \`${pattern}\``),
    ...(manifest.optional_host_permissions.length > 0 ? [OPTIONAL_HOSTS] : []),
  ];
}

function piecesOf(listing: string): readonly Piece[] {
  return PROCESSOR.parse(listing).children.map((block): Piece => {
    if (block.type === "heading") {
      const text = block.children
        .map((child) => {
          if (child.type === "text") return child.value;

          return child.type === "inlineCode" ? `\`${child.value}\`` : "";
        })
        .join("")
        .trim();

      return { kind: "heading", depth: block.depth, text };
    }

    return block.type === "code" && block.lang === "text"
      ? { kind: "text", value: block.value.trim() }
      : { kind: "other" };
  });
}

function reasonsIn(pieces: readonly Piece[], part: string, section: string): Map<string, string> {
  const reasons = new Map<string, string>();
  let place: readonly [string | null, string | null] = [null, null];
  let waiting: string | null = null;

  for (const piece of pieces) {
    if (piece.kind === "text" && waiting !== null) reasons.set(waiting, piece.value);

    if (piece.kind === "heading" && piece.depth <= 3) {
      place = piece.depth === 3 ? [place[0], piece.text] : [piece.text, null];
    }

    waiting =
      piece.kind === "heading" && piece.depth === 4 && place[0] === part && place[1] === section
        ? piece.text
        : null;
  }

  return reasons;
}

function plain(entry: string): string {
  return entry.replaceAll("`", "");
}

export function checkListing(
  file: string,
  listing: string,
  manifests: Readonly<Record<Browser, Readonly<ManifestPermissions>>>,
): Readonly<Record<Browser, number>> {
  const pieces = piecesOf(listing);
  const counts = { chrome: 0, firefox: 0 };

  for (const browser of BROWSERS) {
    const { part, section, named } = REASON_PLACES[browser];
    const reasons = reasonsIn(pieces, part, section);
    const entries = manifestEntries(manifests[browser]);
    const missing = entries.filter((entry) => {
      const reason = reasons.get(entry) ?? "";

      return reason === "" || (named && !reason.startsWith(`${plain(entry)}: `));
    });

    if (missing.length > 0) {
      throw new Error(
        `${file}: ${part}, ${section}, gives no reason for ${missing.map((entry) => `"#### ${entry}"`).join(", ")} of the ${browser} manifest: each heading needs a text block right under it${named ? " that starts with the heading's name and a colon" : ""}`,
      );
    }

    counts[browser] = entries.length;
  }

  return counts;
}
