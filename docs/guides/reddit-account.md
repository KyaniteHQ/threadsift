# Connect a Reddit account

Threadsift can read a Reddit post or comment link with a Reddit account that you connect. Without an account, an Instance fills a Reddit link from the archive, and the Extension fills it from your browser's own session.

Use a separate Reddit account for this, not your main one. Reddit's User Agreement forbids scraping without written consent, and every request uses the account's own session.

The session is a cookie value that works like a password for that account. Threadsift keeps it sealed on your Instance with `THREADSIFT_SECRET_KEY`, sends it only to `reddit.com`, and never shows it again after you save it.

## Connect with the Extension

1. Sign in to Reddit in the browser that has the Extension, with the separate account.
2. Open the Extension's settings page and choose **Connect Reddit**. The browser asks for the `cookies` permission and for reddit.com. The Extension reads the `reddit_session` cookie and sends it only to your Instance.
3. Your agent token needs the `reddit` scope. Turn it on when you create the token.

When the account expires, the Extension's popup and Settings offer **Reconnect** with one click. **Disconnect** in the Extension gives the `cookies` permission back.

If you prefer not to give the Extension that permission, paste the value by hand as follows.

## Find the session value

1. Open a private window, go to `https://www.reddit.com` and sign in with the separate account.
2. Open the browser's developer tools. In Chrome choose the **Application** tab, then **Cookies**, then `https://www.reddit.com`. In Firefox choose the **Storage** tab, then **Cookies**.
3. Select the cookie named `reddit_session` and copy its **Value**. It is one long line of letters, digits and `. _ ~ + / = % -`.
4. Close the private window without choosing **Log out**, because logging out may end the session.

## Save it

1. In Threadsift, open Settings and find the Reddit account section.
2. Paste the value into the Session cookie field. The `reddit_session=` prefix is optional.
3. Choose **Connect**, then **Verify**. Verify asks Reddit who the session belongs to and shows whether Reddit accepted it.

**Connect** needs a valid `THREADSIFT_SECRET_KEY`. Without one, Settings says so and keeps nothing.

## How the account is used

- Every Reddit link that arrives without Extension content uses the account: a Paste, a Share, an Import, a batch, and an agent token's `add`.
- Threadsift reads one Reddit thread at a time, oldest link first. Reddit allows about 100 requests every 10 minutes, so a long thread, or an Import with many Reddit links, can wait up to 10 minutes. The library shows a waiting link as waiting for Reddit, with the time of the next check.
- When Reddit answers 429, the Instance waits for the window to end and then continues. A link that Reddit has already limited twice falls back to the archive when the third answer is a 429 as well.

## Replace, disconnect or let it expire

- **Replace.** Paste a new value and choose **Connect**.
- **Disconnect.** Choose **Disconnect**. The waiting links become due and are filled from the archive.
- **Expiry.** When Reddit says the session is logged out, Settings shows it as expired and links are filled from the archive until you connect again. A refusal from Reddit that is not a logged-out answer does not expire the account.
- **Key changed.** When `THREADSIFT_SECRET_KEY` is missing or different from the key that sealed the session, Settings says the Instance can no longer open it. Restore the key, or connect again with a valid one.
