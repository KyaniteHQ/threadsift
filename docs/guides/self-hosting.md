# Run Threadsift on your own server

Start a container Instance with the [README's container instructions](../../README.md#try-it-on-your-machine), or deploy a Worker with the [Cloudflare button](#deploy-with-the-cloudflare-button) or [the CLI](#deploy-on-cloudflare-with-the-cli).

## Pick an image tag

The image is published at `ghcr.io/kyanitehq/threadsift`. The `main` and `sha-<commit sha>` tags are `amd64` only (the `image` job in `.github/workflows/gate.yml`). A release tag builds `amd64` and `arm64` (`.github/workflows/release.yml`).

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

## Mount an Obsidian vault

Add a second mount to the [container command](../../README.md#try-it-on-your-machine). Keep the existing `threadsift-data` volume for `/data`. Replace `/absolute/path/to/your/vault` with the existing vault on the host.

```sh
--userns=keep-id:uid=1000,gid=1000 --volume threadsift-data:/data:U --volume /absolute/path/to/your/vault:/vault
```

Use these options with rootless Podman. The user namespace maps your host user to the image's `node` user, UID and GID 1000, so the container can write files you own. Replace the old `/data` mount flag with the one above. Its `:U` suffix lets Podman adjust ownership in the dedicated data volume for the new mapping. Keep `:U` off the vault mount. On SELinux, append `:z` to relabel the vault recursively with a shared label. Use `:Z` only if this container alone should have access under that label. With Docker, keep the original data mount and omit the Podman user namespace option. Grant write access to the host UID and GID that map to the container's `node` user.

Open **Settings**, then **Obsidian**. Choose **Folder** and enter `/vault`. Use **Verify** to check write access, then **Save**. Keep the vault on a filesystem that supports hard links. If the vault is a checkout of the GitHub mirror, move the existing `Threadsift/` files out of the way before switching. Settings names the file that blocks a note. Move that file so the next retry can write the note. If a sync tool moves files between machines, exclude the `.written` directory under `Threadsift/` from sync so the container keeps its local ownership records.

## Deploy with the Cloudflare button

Use a GitHub account, `openssl`, and a Cloudflare account on the Workers Paid plan with R2 turned on.

1. Open [Deploy to Cloudflare](https://deploy.workers.cloudflare.com/?url=https://github.com/kyanitehq/threadsift/tree/release) and choose your GitHub account.
2. Choose a project name and names for the D1 database, R2 bucket, and Queue. Use names that are new to your account for a fresh Instance.
3. Select **Create private Git repository**.
4. Run `openssl rand -hex 32` and paste the result into `THREADSIFT_SECRET_KEY`. Keep a private backup of the key for the lifetime of the Instance.
5. Run `openssl rand -hex 16` and paste the result into `SETUP_CODE`.
6. Keep the build command `pnpm run build` and the deploy command `pnpm run deploy`. Choose **Deploy**. When the build finishes, open the Worker URL. Enter the code on the setup page and choose an owner password.
7. [Set up updates](#update-a-cloudflare-copy).

### Fix an expired GitHub authorization

If the form says "Your GitHub authorization has expired", uninstall **Cloudflare Workers and Pages** in GitHub's **Installed GitHub Apps** settings. Return to the deploy form and choose **New GitHub connection**. Under **Repository access**, choose **All repositories**, then **Install & Authorize**. If other Workers use the same installation, restore the app's access to their repositories and check their Build settings after reinstalling. [GitHub's installed app settings](https://docs.github.com/en/apps/using-github-apps/reviewing-and-modifying-installed-github-apps)

On 2026-11-19, revoking and granting authorization again failed. Giving the existing installation access to all repositories also failed. [Live run](../architecture/cloudflare-deploy-button.md#live-run-on-2026-11-19)

## Deploy on Cloudflare with the CLI

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

1. With preview builds on, update pull requests run `npx wrangler preview`. The command fails because the copy lacks a `previews` block. An empty block satisfies that requirement. A working Threadsift Preview also needs D1, R2, and Queue bindings. Cloudflare recommends staging resources for those bindings. [Preview configuration](https://developers.cloudflare.com/workers/previews/configuration/)

   In Cloudflare, open your Worker's **Settings**, then **Build**, then **Branch control**. Turn off **Builds for non-production branches** (also labeled **Enable Preview Builds**). Confirm the production branch matches your copy's default branch, which can be `master`. [Cloudflare branch build settings](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/)
2. Enable Actions and Issues in your GitHub copy. Create a fine-grained personal access token scoped to that repository. Give it read and write access to **Contents**, **Pull requests**, and **Workflows**, and read access to **Metadata**. Save it as a repository Actions secret named `UPDATE_TOKEN`. See how to [create a fine-grained token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#creating-a-fine-grained-personal-access-token) and [add a repository Actions secret](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets#creating-secrets-for-a-repository).
3. If the copy has no update workflow, copy [`.github/workflows/update-from-upstream.yml` from the `release` branch](https://github.com/kyanitehq/threadsift/blob/release/.github/workflows/update-from-upstream.yml). Commit the file at the same path on your copy's default branch. On 2026-11-19, the button made a copy with no workflow files. [Live run](../architecture/cloudflare-deploy-button.md#live-run-on-2026-11-19)

The **Update from upstream** workflow runs weekly. To check sooner, select it in Actions and choose **Run workflow**. In a public repository, GitHub disables scheduled runs after 60 days without repository activity. To resume them, select the workflow in Actions and choose **Enable workflow**. Before merging an update, review any local edits it would remove and provision any new bindings listed in the pull request. Workers Builds deploys the merge.
