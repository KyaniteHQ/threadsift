import { readFileSync } from "node:fs";

import { z } from "zod";

const HOST_PERMISSIONS = "Host permissions";
const NO_DATA_COLLECTED = "none";

const Names = z.array(z.string()).readonly().default([]);

export const ManifestPermissionsSchema = z.object({
  permissions: Names,
  optional_permissions: Names,
  host_permissions: Names,
  optional_host_permissions: Names,
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

class ListingCheckFailed extends Error {}

function manifestEntries({
  permissions,
  optional_permissions: optional,
  host_permissions: hosts,
  optional_host_permissions: optionalHosts,
  browser_specific_settings: settings,
}: Readonly<ManifestPermissions>): readonly string[] {
  const data = settings?.gecko?.data_collection_permissions;
  const named = [
    ...permissions,
    ...optional,
    ...(data?.required ?? []).filter((name) => name !== NO_DATA_COLLECTED),
    ...(data?.optional ?? []),
  ].map((name) => `\`${name}\``);

  return hosts.length + optionalHosts.length > 0 ? [...named, HOST_PERMISSIONS] : named;
}

function partHeadings(listing: string, part: string): ReadonlySet<string> | null {
  const lines = listing.split("\n");
  const start = lines.indexOf(`## ${part}`);

  if (start === -1) return null;

  const headings = new Set<string>();
  let fenced = false;

  for (const line of lines.slice(start + 1)) {
    if (line.startsWith("```")) fenced = !fenced;
    else if (!fenced && line.startsWith("## ")) break;
    else if (!fenced && /^#{3,6} /u.test(line)) headings.add(line.replace(/^#+ /u, "").trim());
  }

  return headings;
}

interface StorePart {
  readonly browser: string;
  readonly part: string;
  readonly manifest: ManifestPermissions;
}

export function checkListing(listingFile: string, stores: readonly StorePart[]): void {
  const listing = readFileSync(listingFile, "utf8");

  for (const { browser, part, manifest } of stores) {
    const headings = partHeadings(listing, part);

    if (headings === null) throw new ListingCheckFailed(`${listingFile} has no "## ${part}" part`);

    const entries = manifestEntries(manifest);
    const missing = entries.filter((entry) => !headings.has(entry));

    if (missing.length > 0) {
      throw new ListingCheckFailed(
        `${listingFile}, ${part}, has no heading for ${missing.join(", ")} of the ${browser} manifest`,
      );
    }

    process.stdout.write(
      `${part}: a heading for each of the ${String(entries.length)} permission entries of the ${browser} manifest\n`,
    );
  }
}
