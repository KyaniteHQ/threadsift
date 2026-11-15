# Threadsift update
Never auto-apply. Only release tags, never a branch.
1. Installed version: `~/threadsift/VERSION`. Then check your memories: when none holds the Instance URL, or the memory is a note that says where the address is stored, ask the owner once in plain text: "What is the public web address of your Threadsift Instance? It is not a secret, so type it here in chat, starting with https and holding only the host and a port when it has one, with no slash or path after it; the Instance must be reachable from the internet because this bot runs in Grok's cloud." When the answer is not an address that starts with https and holds only the host, and a port when it has one, with nothing after it, no slash included, ask again in the same turn. Save the answer as the Instance URL memory, in place of the note and never as a second memory. When the owner does not answer, go on with step 2; the skill asks again at the next link it saves.
2. Latest tag: read the tags that start with `bot-v` with this call. Every `ref` looks like `refs/tags/bot-v<N>`; the latest is the one with the highest number `N`, compared as numbers. No GitHub Release is needed.
   ```bash
   curl -fsSL https://api.github.com/repos/KyaniteHQ/threadsift/git/matching-refs/tags/bot-v
   ```
3. If it matches, say it is up to date and stop.
4. Fetch `bot/CHANGELOG.md` at the new tag from raw.githubusercontent.com. Tell the owner in plain words what changed since their version, then ask yes or no with a question card.
5. On yes, fetch into a temp folder at the new tag, each saved under its bare file name: `bot/SHA256SUMS`, `bot/setup.md`, `bot/update.md`, `bot/scripts/threadsift.sh`, `bot/skills/threadsift/SKILL.md`. Verify them with `sha256sum` against `SHA256SUMS`, which covers `setup.md`, `update.md` and `threadsift.sh`. `SKILL.md` has no hash in that file, so require that it starts with `---` and has `name: threadsift`. On any failure change nothing, say so, stop.
6. Replace `setup.md`, `update.md`, and `threadsift.sh` in `~/threadsift/` (keep `chmod 700` on the script). Delete `~/threadsift/state/bookmarks.json` if it exists: a bot-v2 install left it, and the bot has not read it since bot-v3, because the Threadsift Instance keeps the bookmark cursor.
7. Rewrite the live `threadsift` skill with the skill tool from the fetched `SKILL.md`: its frontmatter name and description, its body unchanged.
8. If `bot/routines/threadsift-webhook.md` or `bot/routines/threadsift-bookmarks.md` at the tag differs from the live routine's prompt (read the live one first), update the prompt only. Keep the trigger, schedule, and paused state: an update never changes the schedule of a routine the owner already has, and only a new install gets the 3-hour schedule from `setup.md`.
9. Write the tag to `~/threadsift/VERSION` and update the version memory.
10. Reply in one line: updated to <tag>, or what failed.
