# Add a GitHub token

A GitHub token is optional. Without one, Threadsift reads GitHub repositories anonymously, and GitHub allows 60 requests an hour for all programs that share your Instance's internet address. A repository Paste takes two requests. With a token, GitHub allows 5,000 requests an hour for the token's owner ([rate limits for the REST API](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)).

The token only reads public repositories. Threadsift keeps it sealed on your Instance with `THREADSIFT_SECRET_KEY` and sends it only to `https://api.github.com`.

## Create and save the token

1. Open [GitHub's new fine-grained token page](https://github.com/settings/personal-access-tokens/new?name=Threadsift&description=Threadsift+reads+public+repositories+for+pasted+links+at+a+higher+request+limit&expires_in=366). The link fills in the name, a description and an expiry of 366 days, GitHub's longest ([pre-filling token details](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)).
2. Leave every permission as it is and generate the token. Every token can read public repositories, so none is needed.
3. In Threadsift, open Settings, paste the token into the GitHub token section, and choose **Save token**.
4. Choose **Verify token**. Threadsift asks GitHub for your hourly limit and shows how many requests are left.

A classic token with no scopes also works.

## Replace, remove or let it expire

- **Replace.** Paste a new token and choose **Save token**. The new token replaces the old one, and Threadsift does not need to read the old one.
- **Remove.** Choose **Remove token**. The Instance goes back to anonymous reads. Removing works even when the saved token can no longer be read.
- **Expiry.** When GitHub rejects the saved token, a repository Paste keeps the Item's earlier content and the Item's row and Reader link to Settings. Save a new token or remove the token, then paste the link again. Threadsift does not fall back to an anonymous read.

## When the token cannot be read

Settings says the Instance can no longer open the saved token when `THREADSIFT_SECRET_KEY` is missing, malformed or different from the key that sealed it. Restore the original key, or set a valid key and save a new token. **Save token** needs a valid key. Verify works again once the saved token can be read, or after you replace it.
