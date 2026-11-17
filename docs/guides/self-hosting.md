# Run Threadsift on your own server

The README's "Try it on your machine" section starts an Instance. This guide covers what comes after.

## Pick an image tag

The image is published at `ghcr.io/kyanitehq/threadsift` for `amd64`.

- `main` is the latest build that started and answered.
- `sha-<commit sha>` is one build and never moves.

The [package page](https://github.com/KyaniteHQ/threadsift/pkgs/container/threadsift) lists the tags. A commit with no tag there has no image.

## Keep the secret key

`THREADSIFT_SECRET_KEY` in `~/threadsift.env` is 32 random bytes written as 64 hex characters. The app encrypts the keys you save in Settings with it: a Provider's API key, the GitHub token and the Grok Bot key. Without it, Settings cannot save an API key.

Back up the file, and pass it with `--env-file` on every run.

When `THREADSIFT_SECRET_KEY` changes or is lost, the app cannot read the keys it saved before. You can recover in two ways:

- Put the original key back. The keys saved under it become readable again.
- With a valid key set, save each key again in Settings. Each new save replaces the unreadable key.

A key saved under a replacement `THREADSIFT_SECRET_KEY` opens only with that replacement. If you later put the original key back, enter that key again in Settings.

## Reach it from other devices

The app listens on plain HTTP, and the README's `podman run` command publishes port 8080 on `127.0.0.1` only. To reach it from other devices, put your own reverse proxy or tunnel in front of it, and let that give it HTTPS. The data stays in the `threadsift-data` volume.

Add the external address to `~/threadsift.env` as one more line, `THREADSIFT_PUBLIC_ORIGIN=https://<your host>`, with no path and no trailing slash, then recreate the container. Without it, the app refuses MCP requests that come through the public host, and OpenRouter's Connect button does not work. The key file keeps the line, so every later run that passes `--env-file` keeps it too.

## Update a Cloudflare copy

Enable Actions and Issues in your copy. Create a fine-grained GitHub personal access token scoped to that repository with read and write access to Contents, Pull requests and Workflows. Save it as a repository Actions secret named `UPDATE_TOKEN`.

The **Update from upstream** workflow runs weekly. To check sooner, select it in Actions and choose **Run workflow**. In a public repository, GitHub disables scheduled runs after 60 days without repository activity. To resume them, select the workflow in Actions and choose **Enable workflow**. Review any local edits the update would remove and provision the bindings listed for provisioning before merging. Workers Builds deploys the merge.
