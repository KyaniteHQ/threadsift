# Files

The `FileStore` port has two adapters, each a `FileBackend` that receives only keys and prefixes the grammar accepted. `checkedFileStore` parses every key before it calls the adapter. The container writes under `<DATA_DIR>/files`. Cloudflare writes to the R2 bucket `threadsift-files`, bound as `FILES`. `put` takes a byte array, because R2 needs a known length for a streamed `put`.

- [Key grammar](#key-grammar)
- [Listing](#listing)
- [Container folder](#container-folder)
- [Reading post text](#reading-post-text)
- [Writing and publishing a long post text](#writing-and-publishing-a-long-post-text)
- [Image files and the file route](#image-files-and-the-file-route)
- [Digest of a long post text](#digest-of-a-long-post-text)
- [Cleanup](#cleanup)

An Article's images and the photos of an X post are stored as fetched (see Media in the [Data model outline](data-model-outline.md)). The app does not resize them, because that would need two image paths (an Images binding on Cloudflare, a native library in the container) for a feature the spec does not ask for.

The port has no byte range for `get` and no multipart upload for a file of unknown length (every multipart part but the last must be at least 5 MiB; R2 docs, Workers API and multipart uploads). The Restore needs neither. It stores each 32 MiB part of the zip as its own object and reads a window by skipping to it in the part's stream, and its `files` phase puts the Item files under the `items/` root with the keys the zip names.

## Key grammar

The file-key module is the one place that defines a key. `checkedFileStore` calls it before either adapter touches storage, so nothing decodes or normalizes a key after the check. A key or prefix outside the grammar makes the call throw `FileRefused`, and a delete batch is checked whole before any key is removed.

| Root | Key | Holds |
|---|---|---|
| `items` | `items/<id>/<name>` | an Item's post text and image files |
| `exports` | `exports/<id>/<name>` | one export's objects, named `part-<n>-<g>`, `dir-<n>-<g>` or `tail-<g>` with the attempt number `g` ([Export, backup and restore](export-backup-and-restore.md)) |
| `restores` | `restores/<id>/part-<n>` | the parts of an uploaded Restore zip |

- `<name>` is 1 to 225 ASCII letters, digits, `.`, `-` and `_`, other than `.` and `..`.
- `<id>` is a canonical positive integer of at most 16 digits (`CANONICAL_NUMBER_SOURCE`), because every owner id is a row id that the app reads as a JavaScript number.
- A prefix ends in a slash, so `items/1/` never matches `items/10/`.
- `get`, `delete` and `list` also accept a temporary file name of up to 255 bytes, `.tmp-<hex>-<name>`, whose embedded `<name>` is valid (`parseStoredKey`). A leftover of a 225-byte name (30 + 225 = 255 bytes) can therefore be listed and removed.
- The image route serves `items/` keys only. `cleanFiles` sweeps `items/` only. The sweep stage `exports` removes `exports/` objects. The sweep stage `restores` (`cleanRestoreParts`) removes `restores/` objects: a Restore deletes its parts when it is done, is cancelled or refuses the zip, and keeps them for Resume when it fails with `gave-up`, and the sweep deletes them 24 hours after the failure (see Restore in [Export, backup and restore](export-backup-and-restore.md)).

## Listing

Both adapters list in the order of the key strings and return only keys the grammar accepts, so every listed key can go back into `get` and `delete`.

- The container pages by the last key it returned. `keysAfter` skips the item folders that end before that key, so a page costs the folders it needs and not every folder.
- R2 pages by its own cursor, at most 1,000 keys, and its `delete` takes at most 1,000 keys, so the adapter splits a longer batch.

Listing 4,500 files in 1,500 Item folders in pages of 100 (the page size of `cleanFiles`) takes 0.16 to 0.19 s (3 runs on the owner's workstation, 2026-11-13).

## Container folder

`put` writes a temporary file `.tmp-<random>-<name>` in the key's folder, syncs it and renames it into place, so a reader never sees half a file and two puts never share a temporary path.

- The temporary prefix takes 30 bytes (12 random bytes as hex), so the grammar allows a name of 255 - 30 = 225 bytes (`FILE_NAME_MAX`), and a temporary name always fits a Linux file name.
- The name ends with the key's own file name, so `finalKeyOf` maps a temporary file to the key it will become, and the cleanup protects it as it protects that key.
- The adapter throws `FileRefused` for a symlinked or non-directory path component and for a leaf that is not a regular file (`lstat`, then `O_NOFOLLOW` on open).
- The trust assumption is that no other local process swaps the store's folders while the app runs, because the check and the open are two steps for a parent folder.

## Reading post text

`items.post_text_key` names the file that holds an Item's post text. A row holds `post_text` or `post_text_key`, never both, and the `items_post_text_check` CHECK refuses a row that sets both. `getItem` reads the file and drops the key from the answer.

- A key outside the grammar, a key in another Item's folder, a missing file and a refused file all give `postText: null` with status 200 and one log line, so one bad file does not hide the Item.
- Any other storage error, such as a permission error or an outage, is not hidden as missing content and ends in a 500.
- When a refresh deleted the old file after `getItem` read the row, `getItem` reads the Item once more, and a second miss gives `postText: null`.
- A refresh keeps the old text and file until committed content replaces or clears them, so a failed fetch, an `ok` result with no content and a Paste while a job is open leave the file readable.

## Writing and publishing a long post text

The fetch job stores a post text over `INLINE_TEXT_BYTES` (1,000,000 UTF-8 bytes) in the store, and `readArticle` returns the whole Markdown, so the job and not the reader splits at the limit.

The key is `items/<item id>/post-<job id>-<attempt>.md`. A job id is never reused, and a job gets a new attempt number whenever a runner takes it over, so a key is never written twice. Only a Digest job, which writes no file, starts its count at 0 again when its input moved ([Jobs, leases and the schedule](jobs-leases-and-the-schedule.md), Attempts belong to a generation). A newer X answer for an Item closes its open `x_verify` job and opens another, so the input of an `x_verify` job never moves after its first claim. One SQL expression builds the key (`postText` of `attemptFileKeys`), so the claim, the fetch job and the cleanup share one formatter.

Two requeues keep the attempt number, and neither may follow a file write, because a key written twice would replace a file nothing names yet. The batch that publishes a key also closes the job.

- A fetch wait counts an attempt when it is `limited` (`countsAttempt: limited` in `waitingOutcome`), which a rate limit or an X reread (`readAgain`) sets. It ends before any file is written: `settledContent` takes `Concluded`, which has no wait member, so `tsc` refuses a `Fetched` there.
- A stale-result requeue needs a `currency` on the outcome. The Digest outcomes and `guardedOutcome` set one and write no post text file, and a fetch job gets one only from `lostOutcome`, whose guard never holds. A fetch outcome with a `currency`, or a wait after `placePostText`, would write one key twice.

The job writes the file first. Only the guarded finishing batch (the job is `running` at the attempt its runner claimed) sets `post_text_key`, so a file that stops being protected never becomes protected again.

`finish` tells three outcomes apart:

| Outcome | Files it deletes |
|---|---|
| After a commit | the files the attempt superseded |
| After a rejected finish (the claim was lost) | only the files its own attempt wrote that no row names, never another attempt's file, because the container runs 4 jobs at once and a runner that was taken over can still be inside its attempt while the new attempt holds the row |
| A finish that throws | none, because the batch may have committed and the Item may already name the files, and the cleanup pass settles them |

A delete that fails is logged (`file-not-deleted`) and left to the cleanup.

## Image files and the file route

An attempt writes its images under `items/<id>/img-<job id>-<attempt>-<position>.<ext>` (see Media in the [Data model outline](data-model-outline.md) for the identity).

`GET /api/files/items/:id/:name` serves a key only when a `media` row of that Item has exactly that key, kind `image` and outcome `stored` (`servedImage`). Every other key answers 404 with the same body. The body carries a generated `Content-Disposition` filename, never the page's.

The route is declared `access("read", { cache: "file" })`. The `file` cache rule sets the security headers on every answer, the 401 and 404 included, and on a path under `/api/files/` that no route serves. The reasons are in the headers' own specifications:

- `nosniff` and the stored type keep a browser from reading an image as script ([Fetch, `nosniff`](https://fetch.spec.whatwg.org/#x-content-type-options-header)).
- `sandbox` and `default-src 'none'` make an image opened as a page inert ([CSP](https://www.w3.org/TR/CSP3/)).
- `Content-Disposition` follows [RFC 6266](https://www.rfc-editor.org/rfc/rfc6266).

## Digest of a long post text

`readDigestText` reads the whole file with `readPostText` and cuts the text to the AI input cap (`cutDigestInput`; [AI tasks and providers](ai-tasks-and-providers.md)), so no AI task input comes near 1,000,000 bytes.

A file that is missing, refused or unreadable gets the same input-currency rule as a Provider result:

- When the Item's generation, pending Digest or open fetch job changed since the attempt read them, the attempt ends in a guarded batch that fails, so the runner requeues the job on the current inputs (`stale`) without counting an attempt.
- When they still match, the attempt fails before any Provider call and the job retries after 30 seconds and 2 minutes. The third failed read ends in one guarded batch that checks the generation again and sets `failed`, so a refresh that publishes during the read is never failed by the old read.

## Cleanup

Every tick runs one page of `cleanFiles` (100 keys) at the end of the sweep. It touches only keys of a kind it owns (`isSweptKey`: post text files, image files, and the temporary file of either), so a release that stores a new kind of file under `items/` keeps its files while an older release runs.

It deletes every owned key that no Item names (`items.post_text_key`, `media.file_key`) and that no job `running` at the attempt in the key owns. That is the condition the finishing guard checks (`postText` and `imagePrefix` of `attemptFileKeys`). The key names its attempt, so no table of pending files exists, and the listing finds a file whose writer crashed before any database write. A write that lands after its attempt was overtaken and after the pass went by is found on the next pass.

- `deleteUnclaimed` re-reads the named keys after the listing and deletes nothing while a Restore holds the library (`restoreHoldsLibrary`), so it cannot delete a file that a `files` unit put back between its reads, nor a file a failed Restore keeps for Resume.
- A temporary file is judged by the key it will become (`finalKeyOf`), so the temporary file of an attempt that is still `running` stays.
- A page that deletes cleanly saves the store's next cursor, and `null` after the last page starts a new pass. A delete that fails throws before the save, so the cursor stays and the next sweep that runs the stage lists from the same cursor again. This retry has no limit.
