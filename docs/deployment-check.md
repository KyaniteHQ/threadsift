# Check an Instance

Run `tools/check-deployment.ts` on the owner's machine against an already-set-up Instance. It refuses CI. It signs in with a new session, Pastes a unique SQLite documentation URL through the real job queue, waits for fetched text and a Digest, deletes only the Item whose creation answered 201, and signs out. It never saves Provider settings, refreshes a known Item, or runs setup.

Set `THREADSIFT_PASSWORD_FILE` to a mode 0600 file holding the owner's password, or supply `THREADSIFT_PASSWORD` through the environment. Do not put the password in a command argument. Use a fresh output directory beneath an existing parent for each run. The command refuses an existing path before sign-in, so an old result or symlink cannot overwrite another file. Run from the repository shell:

```sh
node tools/check-deployment.ts https://your-instance.example /tmp/threadsift-check
```

The default `provider` mode uses the Instance's existing Provider and waits for its Digest. Configure that Provider before the check. The Paste fetches a real page and requests a Digest; the Provider may charge for it. The check waits up to ten minutes for both fetching and the Digest; each HTTP request has its own thirty-second bound. A slow fetch leaves less time for the Provider.

To prove fetching and Digest publication without calling a Provider, append `supplied`:

```sh
node tools/check-deployment.ts https://your-instance.example /tmp/threadsift-check supplied
```

This sends a caller-written Digest with the Paste. It does not prove the configured Provider works. Loopback HTTP is accepted for local runtime verification; remote Instances require HTTPS. Redirects are refused, including during sign-in.

Read `result.json` in the named directory. A successful exit requires sign-in, fetched text, a published Digest and confirmed deletion. The file records stages and the new Item's id, without passwords, cookies, settings or response bodies. The directory and snapshots are private. If the report filesystem fails, the command exits nonzero and prints the stage and owned Item id to stderr with `artifactSaved: false`; Item cleanup and sign-out still run. The last snapshot may predate that failure, and a partial `result.tmp` may remain. If cleanup fails, use the recorded id to inspect that Item before deleting it. A lost Paste response can leave an Item without a recorded id; inspect the SQLite documentation URLs with a `threadsift-check` query parameter before removing anything. An Item id belongs to the Instance supplied to that run; if its database was replaced, match the unique check URL before deleting anything manually. A stopped process cannot run its cleanup. Normal failures attempt Item deletion and sign-out and exit nonzero.

The check reads the same HTTP schemas as the product. The procedure exercises HTTP sign-in, not browser layout, cookie policy in a browser, CPU limits or Queue recovery after a purge. Publication can create Topics and Tags; Item deletion leaves those catalog entries in place.
