# Vault mirror

The Vault mirror writes every Item, Topic page, the Index and the Log as Markdown into the owner's Obsidian vault, in a GitHub repository or in a mounted folder on the container. It never reads the vault back. The mirror core drains a queue through the `VaultTarget` port, and renders, sequences and acknowledges notes. The GitHub adapter publishes GraphQL commits on both targets. The container also registers a folder adapter that owns filesystem reads, publication and file ownership. One path module writes every vault path for both targets, and the Item file plan serves the mirror and the Export alike.

- [Paths](#paths)
- [Queue](#queue)
- [One writer](#one-writer)
- [Bounds, files and retry](#bounds-files-and-retry)
- [Restore and upgrade](#restore-and-upgrade)
- [Settings](#settings)
- [Wikilinks](#wikilinks)
- [File ordering and byte budget](#file-ordering-and-byte-budget)
- [Folder mode](#folder-mode)

## Paths

`vaultNotePath` builds every path under the `Threadsift/` folder.

| Note | Path |
|---|---|
| Item | `Threadsift/items/<Item id>/note-<Item id>.md` |
| Topic page | `Threadsift/topics/topic-<Topic id>.md` |
| Index and Log | `Index.md` and `Log.md` at the root of `Threadsift/` |
| Log month | `Threadsift/log/<YYYY-MM>.md` (UTC month, for example `2026-11.md`) |

- Item ids survive a refresh and a change of title, Topic or Tag. Topic ids keep the first path through a rename, and a merge deletes the losing Topic's path. Both ids survive Export and Restore.
- A month note's name never changes.
- Images and stored post text keep their file keys under the Item's folder.
- The Export keeps its title-based file name and excludes the mirror settings, queue and path inventory.

## Queue

`mirror_notes` holds unique `(kind, subject_id)` subjects with advancing sequences. `STALE` is the one place that says which change makes which notes stale, and every writer joins its batch with the statements of its entry, including the shared Highlight removal path. A lint rule refuses an import of the queue outside the vault modules ([Lint and format](lint-and-format.md)). It is the only thing that stops a writer from queueing notes outside `STALE`: a writer that changes data a note shows and never calls `STALE` is not refused.

| Change | Notes queued |
|---|---|
| Digest or fetch publication | the Topic page, and Item notes that link to a renamed Item |
| Topic membership, a Topic merge, a changed overview line | the Index |
| An overview revision with changed text | its Topic page |
| A changed Related Item list | its source Item |
| A disagreement | the Topic page whose list changed |
| A Topic or Tag merge unit | the notes it changes |
| A deletion | the affected notes, queued while the old references still exist |
| A Log append | only its UTC month, right after the insert |
| Deleting an Item | the months of the entries it deletes |
| A month note added or removed | `Log.md` |

The root `Log.md` links to the published month notes, newest month first. That keeps its links valid while a month is parked or awaits publication.

## One writer

The generation and target identify the singleton lease. `currentVaultNotes` checks the lease and the Restore hold while it selects the current queue sequences immediately before publication.

- Item notes share one commit, Topic page notes share another, and the Index, Log and each due month note have their own commits. A stale subject leaves its commit group, and the writer retries any still-current subjects in that group.
- Folder mode checks the current queue sequence before each file and uses an abort signal with the same deadline as the lease. Its synchronous filesystem operations keep the check and publication in the same Node turn.
- Every acknowledgement removes only sequences at or below those read. An answer lost after GitHub committed leaves the queue for another attempt.
- Each `createCommitOnBranch` carries `expectedHeadOid`, so a moved branch, including a reset, refuses the entire commit. A stale-head refusal reads the new tip and rebuilds from the queue, at most three attempts per lease.
- REST is used only for branch, commit and subtree reads.
- The tick runs the mirror after the sweep, also when the sweep failed, and rethrows the sweep's error after the mirror. A failure inside the mirror is logged as `vault-mirror-failed`, and one that escapes it as `vault-tick-failed`. Neither fails the tick.

## Bounds, files and retry

`VAULT_NOTE_LIMIT` (20), `TOPIC_NOTE_LIMIT` (4), `SHARED_NOTE_LIMIT` (4) and `VAULT_DEADLINE_MS` bound a lease, so the writer takes up to 12 Item notes, 4 Topic page notes and 4 other notes. Each Item makes one D1 batch of 11 selects (`planReads`: the Reader's 10 and the list of stored files) plus its file-progress read. `VAULT_FILE_BYTES` limits each commit to 8 MiB of raw file content, and one Item can span commits.

- The content reader reads one file at a time, and the GitHub adapter encodes it into the commit. Each attempt releases its encoded payload after its single commit.
- `mirror_files` checkpoints each confirmed path with its Git blob SHA and queue sequence. A resumed attempt skips matching paths already present on the branch. An answer lost after publication is recovered by comparing the remote file SHA, so it creates no duplicate commit.
- The deadline starts at claim time. Missing or changed stored files park only that subject for a minute and log the reason, so healthy subjects can drain.
- The tree reader reads only needed nonrecursive subtrees, so an unrelated large vault does not require a complete recursive tree. Only paths whose Git blob SHA differs are sent, so an unchanged note creates no commit. Tree reads may overlap, and mutations are at least one second apart.
- GraphQL rate-limit errors are checked even on HTTP 200 ([GraphQL limits](https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api)).
- `rateLimitWait` reads `Retry-After` with `retryAfterMs` and cuts the wait to one hour, as the Paste path does ([Fetchers](fetchers.md), Cooldown and attempts). A 403 or 429 with no matching limit rule counts as a rate limit when it carries `Retry-After`, and a 429 counts without it. The wait is the header's time or, without one, a minute, and the lease takes the later of that time and its backoff.
- The wait grows exponentially on repeated rate limits and survives lease expiry for the same sealed credential. When the cut ends a wait early, the next lease sends one real request after the hour. If GitHub still limits it, `rate_failures` grows, so the next wait is at least an hour again.
- Other failures wait a minute.

A real GitHub `Retry-After` wait is unverified ([Open items and unverified claims](open-items-and-unverified-claims.md)).

## Restore and upgrade

- `startRestore` checks for a live vault lease in the same batch that starts the Restore. A live lease gives `409 vault-busy` and keeps the uploaded parts for retry.
- `HOLDS_LIBRARY` prevents a new claim while the newest Restore holds the library.
- Save and a completed or cancelled Restore queue the library in their write batch and request a scan for managed paths written by another Instance. GitHub mode scans managed branch paths, and Folder mode scans its written-file list. Cancelling an upload, or a Restore that never got past its check, never changed the library and queues nothing.
- The first new writer after an upgrade backfills an already configured vault.
- No mirror table is restored from a zip.

## Settings

The settings module seals tokens through the Instance's `Sealer`. A missing sealing key prevents Save.

- Verify reads a candidate branch without saving or writing files. It does not prove Contents write permission or permission to update a protected branch. The mirror needs Contents write for its selected repository ([GraphQL authentication](https://docs.github.com/en/graphql/guides/forming-calls-with-graphql#authenticating-with-a-personal-access-token) supports fine-grained tokens).
- With no saved destination the settings view reads GitHub mode with no repository and the branch `main`, and it offers Folder where the target has a folder writer.
- Disconnect and a switch of destination leave the previous target's files in place. Saving the new target queues the full library.

## Wikilinks

A wikilink uses Obsidian's vault-relative path form, without `.md`, for example `[[Threadsift/topics/topic-12|Build tools]]`. The full path identifies the destination even when two notes have the same title. The text after `|` names the destination in context.

- Obsidian 1.15.1 renders brackets, pipes and ampersands literally in that text. An invisible word joiner separates consecutive brackets and keeps a final closing bracket inside the label.
- The Item or Topic note also sets its name in the `aliases` list for lookup in Obsidian. Neither the path nor a link's resolution depends on an alias or a plugin.
- The Log keeps historical names as text, so a Topic merge can drop its old note without leaving links in the history.

Sources: [Obsidian internal links](https://help.obsidian.md/links), [Obsidian aliases](https://help.obsidian.md/aliases), [vault-relative link setting](https://help.obsidian.md/settings#Files+and+links).

## File ordering and byte budget

GitHub's [FileAddition and FileChanges](https://docs.github.com/en/graphql/reference/git#fileaddition) require full base64 contents and unique paths, and a deletion must name an existing path. The writer therefore:

- reads only needed subtrees,
- adds an Item's assets in earlier commits, writes its note last, then deletes obsolete assets,
- when it removes an Item, deletes the note before its assets, because removal reverses that dependency.

A missing file parks that Item and leaves others eligible. The Item's files are planned from one database read and the post text file read after it, so a refresh that lands between the two makes the first plan miss. `readAgainOnce` reads the Item once more when the first plan is missing, and only a second miss parks the Item, the way `getItem` and the Export read an Item again. The size rules:

- An Item file above 100 MiB is omitted, and the writer records its path once in the Log. An omitted image's embed is removed from the Item note. Stored images are checked by size before reading them.
- An Item file that exceeds the writer's 8 MiB budget and fits GitHub's file limit stays queued with `file-too-large`.
- A wiki note, including one Log month, stops rendering at the writer's budget, retains its last published copy and retries after its parked delay. Each monthly render reads entries from that UTC month alone, newest first.

See [GitHub large files](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github).

Memory is a tighter limit than the GitHub request envelope.

- GitHub answered `The request payload cannot be larger than 45MB` to a 55,925,619-byte mutation of twenty 2 MiB images, and a 97,779-byte mutation of 500 small files reached its expected-head guard (probed on 2026-11-17 with an impossible `expectedHeadOid`, so no commit landed). These are measured responses, not a published numeric schema guarantee.
- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/#memory) give 128 MB per isolate, shared by its invocations. For a raw budget B, base64 is at most 4B/3 plus per-file padding. UTF-16 base64 strings, a UTF-16 JSON copy and the UTF-8 network body cost about 20B/3. Reserving another 4B for the raw batch, the current file, hashing and text, and 32 MiB for other work, gives about 117.3 MiB at B = 8 MiB, below 128 MB. This is a conservative allocation model with chosen headroom, not a production memory measurement.
- The resulting base64 body is about 10.7 MiB plus paths and the envelope, below the measured 45 MB refusal. The twenty-image case therefore needs several commits and never retains all forty MiB of image bytes at once.

[CreateCommitOnBranchInput](https://docs.github.com/en/graphql/reference/commits#createcommitonbranchinput) owns the expected-head contract.

## Folder mode

The folder writer uses the same ordering and byte budget as GitHub. It opens path components without following symlinks and uses Linux directory descriptors. The folder must support hard links. Verify checks write access on the mount or existing `Threadsift/` directory, the note directories and the written-file directories it finds, and writes nothing.

### Ownership

The hidden `.written` directory under `Threadsift/` holds one hard-link receipt per published path. The receipt identifies the file across retries, Instance restarts, Restore and a switch away from the folder and back. A file replaced by another program loses that identity.

- An unowned file in the way parks its subject while the other subjects continue. The settings screen names the conflicting path, and the Log keeps one entry per conflict path, even after the subject succeeds.
- If you point Folder mode at a Git checkout, move the checkout's `Threadsift/` files out of the way before switching. Move a conflicting file to let its note publish on the next retry.
- Keep `.written` in the mounted folder and exclude it from sync. A copy without the hard links cannot identify which files the mirror owns.
- Switching destinations and disconnecting leave the old target's files and receipts in place.

### Publication and recovery

The `.staging` directory under `.written` holds the staged bytes and an interrupted operation's receipt information.

- On replacement or deletion the writer moves the existing file aside and checks its inode before discarding it. It uses a hard link to publish complete bytes at a free destination.
- If an unowned file moved aside and another file took its name, the writer preserves the displaced file in `.recovered` under `.written`.
- The next lease reconciles unfinished staging before it reads inventory. A receipt whose destination is gone stays visible to the planner until it is removed.
- The writer syncs the destination and receipt directories before acknowledging the queue.
- Deleting an Item removes its empty output and receipt directories before the writer clears the staging record of that delete, so a stop between the two is repeated by the next lease. A scan also removes the empty Item folders that an earlier build left, when the receipt folder and the output folder are both empty. An owner file or link at the output path keeps the folder and its subject.

### Directory races

Before each write the writer reads the `/proc/self/fd` link of the directory it writes in and refuses the write when the link no longer names the directory it opened. A directory that another process renamed out of the vault folder stops the run with a permission failure. Node has no `openat2` or directory-relative rename and link calls, so a check and its write are two system calls. A process that can write in the vault folder and renames a directory inside that gap still sends that one write outside the vault. Do not let another program move or rename directories under `Threadsift/`.
