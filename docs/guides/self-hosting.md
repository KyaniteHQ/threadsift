# Run Threadsift on your own server

The README's "Try it on your machine" section starts an Instance with the container image. This guide covers what comes after that: the image tags, the secret key, HTTPS, and going back to an older build.

## Pick an image tag

The image is published at `ghcr.io/kyanitehq/threadsift` for `amd64` and `arm64`.

- `main` is the latest build that started and answered.
- `sha-<commit sha>` is one build and never moves.

The [package page](https://github.com/KyaniteHQ/threadsift/pkgs/container/threadsift) lists the tags. A commit with no tag there has no image.

## Keep the secret key

`THREADSIFT_SECRET_KEY` in `~/threadsift.env` is 32 random bytes written as 64 hex characters. The app encrypts the keys you save in Settings with it: a Provider's API key, the GitHub token and the Grok Bot key. Without it, Settings cannot save an API key.

Back up the file, and pass it with `--env-file` on every run, a rollback included.

When `THREADSIFT_SECRET_KEY` changes or is lost, the app cannot read the keys it saved before. You can recover in two ways:

- Put the original key back. The keys saved under it become readable again.
- With a valid key set, save each key again in Settings. Each new save replaces the unreadable key.

A key saved under a replacement `THREADSIFT_SECRET_KEY` opens only with that replacement. If you later put the original key back, enter that key again in Settings.

## Reach it from other devices

The app listens on plain HTTP, and the README's `podman run` command publishes port 8080 on `127.0.0.1` only. To reach it from other devices, put your own reverse proxy or tunnel in front of it, and let that give it HTTPS. The data stays in the `threadsift-data` volume.

## Go back to an older build

Find the commit of the tag you want on the package page, put it in place of `<commit sha>`, and run both lines. They remove the container and run that build on the same volume and key file:

```sh
podman rm --force threadsift
podman run --detach --name threadsift --publish 127.0.0.1:8080:8080 --volume threadsift-data:/data --env-file "$HOME/threadsift.env" "ghcr.io/kyanitehq/threadsift:sha-<commit sha>"
```

If you started the container with an extra `--env` flag, such as `--env CLAUDE_CODE_OAUTH_TOKEN` from [Set up a Provider](providers.md), add the same flag to the second line.
