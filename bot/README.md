# The Threadsift bot

The Threadsift bot is a Grok Bot for one Threadsift Instance. It answers tasks Threadsift sends (reading an X link with replies, writing a Digest), saves links you drop in chat, searches your library when asked, and can sync new X bookmarks.

It has one skill, `threadsift`. This folder holds its text (`skills/threadsift/SKILL.md`), bot profile (`profile.md`), setup and update guides (`setup.md`, `update.md`), two routine prompts (`routines/`), and the script (`scripts/threadsift.sh`) that makes every call to the Instance.

1. Import the template in Grok Bot, then say "set up threadsift" in the new bot's chat.
2. Setup asks for your Instance address and an agent token (made under Agent tokens in Settings, with Read and Add scopes) through masked secret cards, so neither appears in chat.
3. It installs the script, checks the connection, and creates the two routines.
4. Paste the webhook address and key from the `threadsift-webhook` routine's panel into Threadsift Settings, in the Grok Bot section; they are never part of the template.

To update, say "update threadsift" in the bot's chat. The bot tells you what changed and asks first. Nothing is pushed to an installed bot. Each update installs a tagged release; the template itself does not change.

The bot's computer is shared by all your bots, so other bots can see the token and files in `~/threadsift/`.

The files the bot writes for a task or a link, in `~/threadsift/tmp/`, are deleted by the script when it uses them, and any file left there is deleted after one day. A task's folder in `~/threadsift/tasks/` holds the task's text and its credential. The credential is deleted when the task is answered or closed, or after one day when the task is never answered, and the rest of the folder is deleted 7 days after the task is done. `~/threadsift/state/` keeps the position of the last bookmark sync, and nothing else is kept.

The bot writes every text it passes to its script by typing it into one shell call, and one call carries at most 3,000 characters. A longer text is written in several calls that the script joins into one file. The limit is below the smallest size that failed in a test on the Grok Bot shell tool: a call of about 20,000 characters arrived with no command at all, twice, and a call of about 1,000 characters worked. It is a safe size, not a measured maximum. For an X post, the bot reads at most the first 100 replies, because it types each reply into the answer, though Threadsift itself accepts up to 500 replies.
