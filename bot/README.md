# The Threadsift bot

The Threadsift bot is a Grok Bot for one Threadsift Instance. It answers tasks Threadsift sends (reading an X link with replies, writing a Digest), saves links you drop in chat, searches your library when asked, and can sync new X bookmarks.

The bot has one skill, `threadsift`. The folder holds the skill text (`skills/threadsift/SKILL.md`), the short bot profile (`profile.md`, one description, because a template has one profile field), the setup and update guides (`setup.md`, `update.md`), two routine prompts (`routines/`), and the script (`scripts/threadsift.sh`) that makes every call to the Instance. The rules of the bot (what it never does, its voice, what its memory holds) are in the skill, not the profile.

1. Open the template address below, import the template in Grok Bot, then say "set up threadsift" in the new bot's chat.
2. Setup asks for your Instance address and an agent token (made under Agent tokens in Settings, with Read and Add scopes) through masked secret cards, so neither appears in chat.
3. It installs the script, checks the connection, and creates the two routines.
4. Paste the webhook address and key from the `threadsift-webhook` routine's panel into Threadsift Settings, in the Grok Bot section; they are never part of the template.

The template address:

```text
https://x.ai/bot/oQiF1E7zmx2VTHQTOlyei
```

To update, say "update threadsift" in the bot's chat. The bot tells you what changed and asks first. Nothing is pushed to an installed bot. Each update installs a tagged release; the template itself does not change.

The bot's computer is shared by all your bots, so other bots can see the token and files in `~/threadsift/`.

The files the bot writes for a task or a link, in `~/threadsift/tmp/`, are deleted by the script when it uses them, and any file left there is deleted after one day. A task's folder in `~/threadsift/tasks/` holds the task's text and its credential. The credential is deleted when the task is answered or closed, or after one day when the task is never answered, and the rest of the folder is deleted 7 days after the task is done. The position of the bookmark sync lives on the Threadsift Instance, and `~/threadsift/state/` holds the marker files of the one-time alerts (a bot updated from bot-v2 may also keep an old `bookmarks.json` there, which nothing reads).

The bot writes every text it passes to its script by typing it into one shell call, and one call carries at most 3,000 characters. A longer text is written in several calls that the script joins into one file. The limit is below the smallest size that failed in a test on the Grok Bot shell tool: a call of about 20,000 characters arrived with no command at all, twice, and a call of about 1,000 characters worked. It is a safe size, not a measured maximum. For an X post, the bot reads at most the first 100 replies, because it types each reply into the answer, though Threadsift itself accepts up to 500 replies.

The bot sends only the post ids of the owner's X bookmarks to the Threadsift Instance, which asks the bot for each thread. The sync routine runs every 3 hours, reads the newest bookmarks first, and stops at the bookmark where the previous run ended; the Instance keeps that position, and it moves only after a run that sent every page it read and stopped at that bookmark, at the end of the list or at the 20-page limit. A sync reads at most 2,000 bookmarks (20 pages of 100) and moves the position to the top bookmark even when it stops at that limit, so the next sync starts there instead of sending the same 2,000 again; when the list is longer, saying "import all my bookmarks" reads all of it once. Thousands of bookmarks finish over days because of X's limits and the agent token's daily budget of new Items, which is set in the Instance's Settings; when the budget is spent, a run stops and the next one goes on. Setup creates the routine paused and turns it on only on the owner's yes; bookmark folders are not imported.

## Publish the template

1. Push the release tag `bot-v<VERSION>` (the number in `bot/VERSION`) and check that `git ls-remote --tags origin bot-v<VERSION>` lists it. The skill's setup line fetches `bot/` at that tag, so a template published before the tag sends every importer to a 404.
2. In a chat with the maintainer's bot, say "update threadsift", so the skill file saved on that bot is the one in the repository.
3. In the same chat, say "export this bot as a public template".
4. Give it: the profile name `Threadsift` and the description from `profile.md`; the skill name `threadsift`, the description from the frontmatter of `SKILL.md`, and the body without the frontmatter, as the getting-started skill; the X plugin; no routines, no memories, no files, no secrets.
5. Ask it to run a shell diff of the text it will pass against the saved skill body before it stages the template. A staged template cannot be read back, and the host writes the frontmatter again, so the packed file is not byte for byte the saved one.
6. Check the review card the bot shows.
7. Publish, then copy the template's link. When it differs from the template address in this file, replace the address.
