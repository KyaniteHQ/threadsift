# Vault mirror

`src/core/vault-mirror.ts` drains the queue through the same GitHub GraphQL commit writer on both install targets. `src/http/vault-routes.ts` and `web/src/ObsidianPage.tsx` own the owner-only settings routes and screen.

- **Identity.** Item notes use `Threadsift/items/<Item id>/note-<Item id>.md`. The Item id survives refresh, title, Topic and Tag changes, Export and Restore. A nonempty title becomes an `aliases` entry. `itemNote` in `src/core/item-note.ts` is shared with the Export, which keeps its title-based file name. Images and stored post text keep their existing file keys under `Threadsift/`.
- **Queue.** `queueVaultItems` joins the Paste's batch, including thread publication and failed short-link resolution. `mirror_notes` holds unique `(kind, subject_id)` subjects with advancing sequences; its first supported kind is `item`. It has no Item foreign key, so a deletion survives Restore undo. The Export excludes the queue, the written-path inventory `mirror_files`, the sealed `vault_settings`.
- **One writer.** The generation and sealed credential identify the singleton lease. `vaultCurrent` checks that lease, the queued sequences and the canonical Restore hold immediately before the branch update. Acknowledgements remove only sequences at or below those read. An answer lost after GitHub committed leaves the queue for another attempt. Each `createCommitOnBranch` carries `expectedHeadOid`, so a moved branch, including a reset, refuses the entire commit. A stale-head refusal reads the new tip and rebuilds from the queue, at most three attempts per lease (a chosen bound). REST remains only for branch, commit and subtree reads; no REST blob, tree, commit or ref mutation remains.
- **Bounds.** `VAULT_NOTE_LIMIT` and `VAULT_DEADLINE_MS` are chosen bounds. `detailReads` issues 11 SELECT statements per Item in one batch, so 20 notes use 220 Reader SELECT statements, in 20 D1 batch calls, plus one file-progress SELECT per Item. D1 counts a batch as one query against its per-invocation limit of 1,000 on Paid and 50 on Free ([D1 limits](https://developers.cloudflare.com/d1/platform/limits/)); this arithmetic is not a measured production bound and excludes the writer's other queries. The note-count bound is 20, below the contract maximum of 500. `VAULT_FILE_BYTES` limits each commit to 8 MiB of raw file contents; one Item can span commits. See the byte budget below.
- **Files and retry.** `vault-content.ts` reads and encodes one file at a time. `mirror_files` checkpoints each confirmed path with its Git blob SHA and queue sequence; a resumed attempt skips matching paths already present on the branch. An answer lost after publication is recovered by comparing the remote file SHA, so it creates no duplicate commit. Each attempt releases its encoded payload after its single commit. The deadline starts at claim time. Missing or changed stored files park only that subject for a minute and log the reason; healthy subjects can drain. `vault-tree.ts` reads only needed nonrecursive subtrees, so an unrelated large vault does not require a complete recursive tree. Only paths whose Git blob SHA differs are sent; an unchanged note creates no commit. Requests are serial, with at least one second between mutations. GraphQL rate-limit errors are checked even on HTTP 200. Cooldowns preserve Retry-After and reset headers, grow exponentially on repeated rate limits, and survive lease expiry for the same sealed credential; other failures wait a minute ([GraphQL limits](https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api)). The tick runs sweep and mirror as separate best-effort tasks.
- **Restore.** The canonical `HOLDS_LIBRARY` predicate pauses the writer while the newest Restore holds the library. Starting a Restore invalidates the lease. Save and a completed or cancelled Restore reconcile the repository's managed Item paths with the current library, including paths written by another Instance. Cancelling an upload that never changed the library does not requeue it. No mirror table is restored from a zip.
- **Settings.** `vault-settings.ts` seals tokens through the Instance's `Sealer`. Verify reads a candidate branch without saving or writing files; it does not prove Contents write permission or permission to update a protected branch. A missing sealing key prevents Save. Disconnect leaves repository files in place.

A real GitHub `Retry-After` wait and resume remains unverified on both install targets. The 600-Item Imports, 60 further note updates per target and two bounded 450-request impossible-head probes produced no rate refusal. No further load should be sent to force one. `docs/architecture/open-items-and-unverified-claims.md` records the missing evidence and the run that would establish it.

## File ordering and byte budget

GitHub's [FileAddition and FileChanges](https://docs.github.com/en/graphql/reference/git#fileaddition) require full base64 contents and unique paths; a deletion must name an existing path. The writer reads only needed subtrees, adds an Item's assets in earlier commits, writes its note last, then deletes obsolete assets. Removing an Item reverses that dependency: delete its note before its assets. A missing file parks that Item, leaving others eligible. A single file above the byte budget remains queued with `file-too-large`; it needs a smaller source file before it can mirror.

The smaller constraint is memory, not the GitHub request envelope:

- GitHub returned `The request payload cannot be larger than 45MB` for a 55,925,619-byte mutation containing twenty 2 MiB images on 2026-11-17. A 97,779-byte mutation containing 500 small files reached its expected-head guard. These are measured responses, not a published numeric schema guarantee. Repeat the refusal probe with a private repository token read from a file, twenty base64 files, and an impossible `expectedHeadOid`; no commit can land. The command below repeats both refusal probes.
- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/#memory) gives 128 MB per isolate, shared by its invocations. For a raw budget B, base64 is at most 4B/3 plus per-file padding. Allowing UTF-16 base64 strings and a UTF-16 JSON copy plus the UTF-8 network body costs about 20B/3. Reserving another 3B for the current file, hashing and text and 32 MiB for other work gives about 109.3 MiB at B = 8 MiB, below 128 MB. This is a conservative allocation model with chosen headroom, not a production memory measurement. The resulting base64 body is about 10.7 MiB plus paths and the envelope, below the measured 45 MB refusal. The twenty-image case therefore needs several commits and never retains all forty MiB of image bytes at once.

Set `VAULT_PROBE_INPUT` to a private JSON file containing `repository`, `branch` and `token` for the disposable test vault, then run:

```sh
node --input-type=module - <<'JS'
import { readFileSync } from 'node:fs';
const { repository, branch, token } = JSON.parse(readFileSync(process.env.VAULT_PROBE_INPUT));
for (const [count, bytes] of [[500, 100], [20, 2 * 1024 * 1024]]) {
  const contents = Buffer.alloc(bytes, 65).toString('base64');
  const body = JSON.stringify({
    query: 'mutation($input: CreateCommitOnBranchInput!) { createCommitOnBranch(input:$input) { commit { oid } } }',
    variables: { input: {
      branch: { repositoryNameWithOwner: repository, branchName: branch },
      expectedHeadOid: '0'.repeat(40), message: { headline: 'Capacity refusal probe' },
      fileChanges: { additions: Array.from({ length: count }, (_, n) => ({ path: `Threadsift/capacity-probe/${n}.bin`, contents })), deletions: [] }
    } }
  });
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'user-agent': 'Threadsift/1' }, body
  });
  const result = await response.json();
  console.log(Buffer.byteLength(body), response.status, result.errors?.map(error => error.message));
}
JS
```

[CreateCommitOnBranchInput](https://docs.github.com/en/graphql/reference/commits#createcommitonbranchinput) owns the expected-head contract. [GraphQL authentication](https://docs.github.com/en/graphql/guides/forming-calls-with-graphql#authenticating-with-a-personal-access-token) supports fine-grained tokens; the mirror needs Contents write for its selected repository. Verify proves read access only.

## Design, not built

- **Folder mode, container only.** Write the same files into a mounted vault folder.
- **Other content changes.** Queue the affected note subjects in the same batch as a deleted Item, a new Digest, a Read state change, a Highlight or Note, a Topic page, a Related Item, a Log entry, an Index change, or an accepted Proposal. A Proposal that renames or merges Topics or Tags rewrites every affected note. The current slice queues Pastes and reconciliation only.
- **Topic paths and links.** A Topic page note keeps its first path through a rename. An accepted merge deletes the merged-away Topic's note and rewrites wikilinks to the survivor. Related Items become wikilinks. Topic page notes, the Index and the Log extend the existing subject queue and writer.
- **Oversized files.** Leave a file above GitHub's 100 MiB limit out of the vault and add a line to the Log ([GitHub large files](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github)).
