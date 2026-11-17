# Run Threadsift on your own server

Start a container Instance with the [README's container instructions](../../README.md#try-it-on-your-machine), or deploy a Worker with the steps below.

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

## Deploy on Cloudflare

Use a Cloudflare account on the Workers Paid plan, Node 26 or later, pnpm, and `openssl`.

1. Clone the repository and install its dependencies, including Wrangler.

   ```sh
   git clone https://github.com/KyaniteHQ/threadsift.git
   cd threadsift
   pnpm install --frozen-lockfile
   ```

2. Sign in to the Cloudflare account where you want to run Threadsift.

   ```sh
   pnpm exec wrangler login
   ```

3. Turn on R2 in that account. The deploy command creates the D1 database, R2 bucket, and Queue named in [wrangler.jsonc](../../wrangler.jsonc) if they do not exist. It also applies the D1 migrations.
4. Create the secrets file outside the checkout. This command stops if the file already exists.

   ```sh
   (set -Ceu; umask 077
     key=$(openssl rand -hex 32)
     code=$(openssl rand -hex 16)
     printf '{"THREADSIFT_SECRET_KEY":"%s","SETUP_CODE":"%s"}\n' "$key" "$code" > "$HOME/threadsift-secrets.json"
     chmod 600 "$HOME/threadsift-secrets.json"
   )
   ```

5. Deploy from the checkout.

   ```sh
   pnpm run deploy --secrets-file "$HOME/threadsift-secrets.json"
   ```

6. Open the Worker URL that Wrangler prints. Enter the `SETUP_CODE` from your secrets file and choose an owner password. Back up the file so the Instance can still read its saved keys after a redeploy.

The [Cloudflare architecture notes](../architecture/cloudflare-deploy-button.md) explain the bindings and how the command deploys the Worker.

## Update a Cloudflare copy

Enable Actions and Issues in your copy. Create a fine-grained GitHub personal access token scoped to that repository with read and write access to Contents, Pull requests and Workflows. Save it as a repository Actions secret named `UPDATE_TOKEN`.

The **Update from upstream** workflow runs weekly. To check sooner, select it in Actions and choose **Run workflow**. In a public repository, GitHub disables scheduled runs after 60 days without repository activity. To resume them, select the workflow in Actions and choose **Enable workflow**. Review any local edits the update would remove and provision the bindings listed for provisioning before merging. Workers Builds deploys the merge.
