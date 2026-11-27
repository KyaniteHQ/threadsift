# The Threadsift bot

The Threadsift bot is a Grok Bot for one Threadsift Instance. It answers tasks Threadsift sends (reading an X link with its replies, the posts it quotes and its photos, writing a Digest), saves links you drop in chat, searches your library when asked, and can sync new X bookmarks.

The folder holds the skill (`skills/threadsift/SKILL.md`, which carries the rules of the bot: what it never does, its voice, what its memory holds), the profile (`profile.md`, one description, because a template has one profile field), the setup and update guides the bot follows, two routine prompts and the script (`scripts/threadsift.sh`) that makes every call to the Instance.

To install, open the template address below, import the template in Grok Bot and say "set up threadsift" in the new bot's chat. `setup.md` is the procedure the bot follows. It asks for the Instance address in chat, because the bot keeps that public address as a memory to link your saved Items, and for an agent token (made under Agent tokens in Settings, with Read and Add scopes) through masked secret cards, so the token never appears in chat. Paste the webhook address and key from the `threadsift-webhook` routine's panel into Threadsift Settings, in the Grok Bot section; they are never part of the template.

The template address:

```text
https://x.ai/bot/oQiF1E7zmx2VTHQTOlyei
```

The bot updates itself to the release your Threadsift Instance expects, at its next webhook task or bookmark sync, and saves its new skill at your next message to it. Threadsift Settings shows the bot's version beside the expected one, and its Threadsift bot section turns automatic install off; then say "update threadsift" in the bot's chat to install that release. Each update installs a tagged release after its hashes match the ones the Instance names; the template itself does not change, and an update never changes a routine.

The bot's computer is shared by all your bots, so other bots can see the token and files in `~/threadsift/`.

The bot writes every text it passes to its script by typing it into one shell call, and one call carries at most 20,000 characters. A longer text is written in several calls that the script joins into one file. On 2026-11-25, in a test bot, single shell calls carried numbered lines of plain English text of 1,000, 3,000, 10,000, 20,000 and 40,000 characters, one call per size and a second call of 20,000. Each stored the whole text: `wc -c` gave one more than the characters sent (the final newline of the heredoc) for every size, and the MD5 sums of the 20,000 and 40,000 character files matched the text sent. An earlier test saw a call of about 20,000 characters arrive with no command at all, twice, so the limit is half of the largest size that worked, and the skill starts the file again when a call prints nothing. No size above 40,000 was sent. For an X post, the bot reads at most the first 100 replies, because it types each reply into the answer, though Threadsift itself accepts up to 500 replies.

The bot sends only the post ids of the owner's X bookmarks to the Threadsift Instance, which asks the bot for each thread. The sync routine runs every 3 hours and reads at most 2,000 bookmarks per run; the skill's Bookmark sync section holds the stop rules, and "import all my bookmarks" reads the whole list once. Bookmark folders are not imported.

## Publish the template

1. Push the release tag `bot-v<VERSION>` (the number in `bot/VERSION`) and check that `git ls-remote --tags origin bot-v<VERSION>` lists it. The skill's setup line fetches `bot/` at that tag, so a template published before the tag sends every importer to a 404.
2. In a chat with the maintainer's bot, say "update threadsift", so the skill file saved on that bot is the one in the repository.
3. In the same chat, say "export this bot as a public template".
4. Give it: the profile name `Threadsift` and the description from `profile.md`; the skill name `threadsift`, the description from the frontmatter of `SKILL.md`, and the body without the frontmatter, as the getting-started skill; the X plugin; no routines, no memories, no files, no secrets.
5. Ask it to run a shell diff of the text it will pass against the saved skill body before it stages the template. A staged template cannot be read back, and the host writes the frontmatter again, so the packed file is not byte for byte the saved one.
6. Check the review card the bot shows.
7. Publish, then copy the template's link. When it differs from the template address in this file, replace the address.
