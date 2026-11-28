# Connect a Reddit account

Threadsift can read a Reddit post or comment link with a Reddit account you connect. Without an account, an Instance fills a Reddit link from the archive, and the Extension fills it from your browser's session.

Use a separate Reddit account, not your main one. Reddit's User Agreement forbids scraping without written consent, and every request uses the connected account's session.

The session is a cookie value that works like a password for that account. Threadsift keeps the value sealed on your Instance with `THREADSIFT_SECRET_KEY` ([Keep the secret key](self-hosting.md#keep-the-secret-key)). Threadsift sends the value only to `reddit.com` and never shows it again after you save it.

Choose one way to connect:

- [Connect with the Extension](#connect-with-the-extension) if you are willing to give it the `cookies` permission.
- [Paste the session value by hand](#paste-the-session-value-by-hand) if you do not have the Extension or do not want to give it that permission.

## Connect with the Extension

Before you start, create an agent token. When you create it, turn on the `reddit` scope. Enter the token in the Extension's settings.

1. In the browser that has the Extension, sign in to Reddit with the separate account.
2. Open the Extension's settings page and choose **Connect Reddit**. The browser asks for the `cookies` permission and access to reddit.com. The Extension reads the `reddit_session` cookie and sends it only to your Instance.

When the account expires, the Extension's popup and settings page show **Reconnect** so you can connect again in one step. **Disconnect** in the Extension gives the `cookies` permission back.

## Paste the session value by hand

1. Open a private window and go to `https://www.reddit.com`. Sign in with the separate account.
2. Open the browser's developer tools. In Chrome, choose the **Application** tab, then **Cookies**, then `https://www.reddit.com`. In Firefox, choose the **Storage** tab, then **Cookies**.
3. Select the cookie named `reddit_session` and copy its **Value**. The value is one long line of letters, digits and `. _ ~ + / = % -`.
4. Close the private window, and do not choose **Log out**. If you log out, the session may end.
5. In Threadsift, open Settings and find the Reddit account section.
6. Paste the value into the Session cookie field. The `reddit_session=` prefix is optional.
7. Choose **Connect**, then **Verify**. Verify shows whether Reddit accepted the session.

**Connect** needs a valid `THREADSIFT_SECRET_KEY`. Without one, Settings says so and keeps nothing.

## How the account is used

- Every Reddit link that arrives without Extension content uses the account: a Paste, a Share, an Import, a batch, and an agent token's `add`.
- Threadsift reads one Reddit thread at a time, oldest link first. Reddit allows about 100 requests every 10 minutes, so a long thread or an Import with many Reddit links waits up to 10 minutes. The wait is up to an hour when Reddit says the account made too many requests. While a link waits, the library shows it as waiting for Reddit, with the time of the next check.
- When Reddit answers 429, the Instance waits for the window to end and continues. After a third limited attempt on one link, the Instance fills that link from the archive.

## Replace, disconnect or let it expire

- **Replace.** Paste a new value and choose **Connect**. The waiting links use the new session, oldest first. If Threadsift is reading a link when you connect, the others start once that read ends.
- **Disconnect.** Choose **Disconnect**. The waiting links become due. Threadsift tries to fill them from the archive when Reddit archive fill is On, and keeps them Link-only when it is Off.
- **Expiry.** When Reddit says the session is logged out, Settings shows it as expired. Until you connect again, Threadsift tries to fill links from the archive when Reddit archive fill is On, and keeps them Link-only when it is Off. Three different threads that Reddit refuses with a 403, each followed by a refused session check, expire the account too. Other refusals from Reddit do not expire it.
- **Key changed.** When Settings says the Instance can no longer open the session, follow [Keep the secret key](self-hosting.md#keep-the-secret-key).
