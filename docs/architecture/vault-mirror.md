# Vault mirror

`src/core/vault-mirror.ts` drains the queue through the same GitHub GraphQL commit writer on both install targets. `src/http/vault-routes.ts` and `web/src/ObsidianPage.tsx` own the owner-only settings routes and screen.

- **Identity.** `vaultNotePath` uses `Threadsift/items/<Item id>/note-<Item id>.md` and `Threadsift/topics/topic-<Topic id>.md`. Item ids survive refresh, title, Topic and Tag changes. Topic ids keep the first path through a rename, and a merge deletes the losing Topic's path. Both ids survive Export and Restore. The singleton notes are `Index.md` and `Log.md` at the root of the `Threadsift/` folder. Images and stored post text keep their file keys under that folder. The Export keeps its title-based file name and excludes the mirror settings, queue and path inventory.
- **Queue.** `mirror_notes` holds unique `(kind, subject_id)` subjects with advancing sequences. Item writers join the guarded batch with `queueVaultItems`, including the shared Highlight removal path. Digest or fetch publication queues changes to the Topic page and to Item notes that link to a renamed Item. Index changes come from Topic membership, a Topic merge or a changed overview line. An overview revision queues its Topic page if the text changed, and a changed Related Item list queues its source Item. A disagreement queues the Topic page whose list changed. Topic and Tag merge units queue the notes they change, and deletion queues the affected notes while the old references still exist. Each Log append queues the Log immediately after its insert. A Log entry can change even when an overview or pick leaves its own note unchanged.
- **One writer.** The generation and sealed credential identify the singleton lease. `vaultCurrent` checks that lease, the queued sequences and the canonical Restore hold in one read immediately before the branch update. Acknowledgements remove only sequences at or below those read. An answer lost after GitHub committed leaves the queue for another attempt. Each `createCommitOnBranch` carries `expectedHeadOid`, so a moved branch, including a reset, refuses the entire commit. A stale-head refusal reads the new tip and rebuilds from the queue, at most three attempts per lease (a chosen bound). REST remains only for branch, commit and subtree reads; no REST blob, tree, commit or ref mutation remains.
- **Bounds.** `VAULT_NOTE_LIMIT` and `VAULT_DEADLINE_MS` are chosen bounds. `detailReads` issues 11 SELECT statements per Item in one batch, so 20 notes use 220 Reader SELECT statements, in 20 D1 batch calls, plus one file-progress SELECT per Item. D1 counts a batch as one query against its per-invocation limit of 1,000 on Paid and 50 on Free ([D1 limits](https://developers.cloudflare.com/d1/platform/limits/)); this arithmetic is not a measured production bound and excludes the writer's other queries. The note-count bound is 20, below the contract maximum of 500. `VAULT_FILE_BYTES` limits each commit to 8 MiB of raw file contents; one Item can span commits. See the byte budget below.
- **Files and retry.** `vault-content.ts` reads and encodes one file at a time. `mirror_files` checkpoints each confirmed path with its Git blob SHA and queue sequence; a resumed attempt skips matching paths already present on the branch. An answer lost after publication is recovered by comparing the remote file SHA, so it creates no duplicate commit. Each attempt releases its encoded payload after its single commit. The deadline starts at claim time. Missing or changed stored files park only that subject for a minute and log the reason; healthy subjects can drain. `vault-tree.ts` reads only needed nonrecursive subtrees, so an unrelated large vault does not require a complete recursive tree. Only paths whose Git blob SHA differs are sent; an unchanged note creates no commit. Requests are serial, with at least one second between mutations. GraphQL rate-limit errors are checked even on HTTP 200. Cooldowns preserve Retry-After and reset headers, grow exponentially on repeated rate limits, and survive lease expiry for the same sealed credential; other failures wait a minute ([GraphQL limits](https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api)). The tick runs sweep and mirror as separate best-effort tasks.
- **Restore and upgrade.** `startRestore` checks for a live vault lease in the same batch that starts the Restore. A live lease gives `409 vault-busy` and keeps the uploaded parts for retry. The canonical `HOLDS_LIBRARY` predicate prevents a new claim while the newest Restore holds the library. Save and a completed or cancelled Restore queue the library in their write batch and request a scan for managed paths written by another Instance. Cancelling an upload that never changed the library queues nothing. The first new writer after an upgrade backfills an already configured vault. No mirror table is restored from a zip.
- **Settings.** `vault-settings.ts` seals tokens through the Instance's `Sealer`. Verify reads a candidate branch without saving or writing files; it does not prove Contents write permission or permission to update a protected branch. A missing sealing key prevents Save. Disconnect leaves repository files in place.

A real GitHub `Retry-After` wait and resume remains unverified on both install targets. The 600-Item Imports, 60 further note updates per target and two bounded 450-request impossible-head probes produced no rate refusal. No further load should be sent to force one. `docs/architecture/open-items-and-unverified-claims.md` records the missing evidence and the run that would establish it.

## Wikilinks

`vault-markdown.ts` uses Obsidian's vault-relative path form, without `.md`, for example `[[Threadsift/topics/topic-12|Build tools]]`. The full path identifies the destination even when two notes have the same title. The text after `|` names the destination in context. The Item or Topic note also sets its name in the `aliases` list for lookup in Obsidian. Neither the path nor a link's resolution depends on an alias or a plugin. The Log keeps historical names as text, so a Topic merge can drop its old note without leaving links in the history. [Obsidian internal links](https://help.obsidian.md/links), [Obsidian aliases](https://help.obsidian.md/aliases), [vault-relative link setting](https://help.obsidian.md/settings#Files+and+links).

## File ordering and byte budget

GitHub's [FileAddition and FileChanges](https://docs.github.com/en/graphql/reference/git#fileaddition) require full base64 contents and unique paths; a deletion must name an existing path. The writer reads only needed subtrees, adds an Item's assets in earlier commits, writes its note last, then deletes obsolete assets. Removing an Item reverses that dependency: delete its note before its assets. A missing file parks that Item, leaving others eligible. A file over the writer's budget and at or below GitHub's limit stays queued with `file-too-large`. A file above 100 MiB is omitted, and the writer records its path once in the Log. Stored images are checked by size before reading them, and the wiki renderer counts output bytes page by page while retaining at most one note within the byte budget. [GitHub large files](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github).

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
