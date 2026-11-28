# Run Threadsift on your own server

Start a container Instance with the [README's container instructions](../../README.md#try-it-on-your-machine), or deploy a Worker with the [Cloudflare button](#deploy-with-the-cloudflare-button) or [the CLI](#deploy-on-cloudflare-with-the-cli).

## Contents

- [Pick an image tag](#pick-an-image-tag)
- [Keep the secret key](#keep-the-secret-key)
- [Reach it from other devices](#reach-it-from-other-devices)
- [Mount an Obsidian vault](#mount-an-obsidian-vault)
- [Deploy with the Cloudflare button](#deploy-with-the-cloudflare-button)
- [Deploy on Cloudflare with the CLI](#deploy-on-cloudflare-with-the-cli)
- [Update a Cloudflare copy](#update-a-cloudflare-copy)

## Pick an image tag

The image is published at `ghcr.io/kyanitehq/threadsift`. The `main` and `sha-<commit sha>` tags are `amd64` only. A release's tags are `amd64` and `arm64`.

- `latest` is the newest stable release.
- `1` follows the newest stable release of major version 1, and `1.4` the newest patch release of 1.4, which holds fixes only.
- `1.4.2` is one release and never moves. A release candidate, such as `1.5.0-rc.1`, gets only a tag like this and moves no other tag.
- `main` is the latest build that started and answered.
- `sha-<commit sha>` is one build and never moves.

The [package page](https://github.com/KyaniteHQ/threadsift/pkgs/container/threadsift) lists the tags. A commit with no tag there has no image.

## Keep the secret key

`THREADSIFT_SECRET_KEY` in `~/threadsift.env` is 32 random bytes written as 64 hex characters. The app encrypts the secrets you save in Settings with it: a Provider's API key, the GitHub token, the Grok Bot key, the Vault mirror's token and the Reddit session. Without it, Settings cannot save an API key.

Back up the file, and pass it with `--env-file` on every run.

When `THREADSIFT_SECRET_KEY` changes or is lost, the app cannot read the keys it saved before. You can recover in two ways:

- Put the original key back. The keys saved under it become readable again.
- With a valid key set, save each key again in Settings. Each new save replaces the unreadable key. A key saved under a replacement opens only with that replacement, so after you put the original key back, enter those keys again.

## Reach it from other devices

The app listens on plain HTTP, and the README's `podman run` command publishes port 8080 on `127.0.0.1` only. To reach it from other devices, put your own reverse proxy or tunnel in front of it, and let that give it HTTPS. Set the proxy's upstream idle timeout below 65 seconds, because the app closes an idle connection after 66. The data stays in the `threadsift-data` volume.

Add the external address to `~/threadsift.env` as one more line, `THREADSIFT_PUBLIC_ORIGIN=https://<your host>`, with no path and no trailing slash, then recreate the container. Without it, the app refuses MCP requests that come through the public host, and OpenRouter's Connect button does not work. Every later run that passes `--env-file` keeps the line.

## Mount an Obsidian vault

Add a second mount to the [container command](../../README.md#try-it-on-your-machine). Keep the existing `threadsift-data` volume for `/data`. Replace `/absolute/path/to/your/vault` with the existing vault on the host.

```sh
--userns=keep-id:uid=1000,gid=1000 --volume threadsift-data:/data:U --volume /absolute/path/to/your/vault:/vault
```

Use these options with rootless Podman. The user namespace maps your host user to the image's `node` user (UID and GID 1000), so the container can write files you own. The flag replaces the old `/data` mount flag, and its `:U` suffix lets Podman adjust ownership in the data volume for the new mapping. Keep `:U` off the vault mount. On SELinux, append `:z` to the vault mount to relabel it with a shared label, or `:Z` if this container alone should have access. With Docker, keep the original data mount, omit the Podman user namespace option, and grant write access to the host UID and GID that map to the container's `node` user.

Open **Settings**, then **Obsidian**. Choose **Folder** and enter `/vault`. Use **Verify** to check write access, then **Save**. Keep the vault on a filesystem that supports hard links. If the vault is a checkout of the GitHub mirror, move the existing `Threadsift/` files out of the way before switching. Settings names a file that blocks a note, and moving it lets the next retry write the note. If a sync tool moves files between machines, exclude the `.written` directory under `Threadsift/` from sync, so the container keeps its local ownership records.

## Deploy with the Cloudflare button

Use a GitHub account, `openssl`, and a Cloudflare account on the Workers Paid plan with R2 turned on.

1. Open [Deploy to Cloudflare](https://deploy.workers.cloudflare.com/?url=https://github.com/kyanitehq/threadsift/tree/release) and choose your GitHub account.
2. Choose a project name and names for the D1 database, R2 bucket and Queue. Use names that are new to your account.
3. Select **Create private Git repository**.
4. Run `openssl rand -hex 32` and paste the result into `THREADSIFT_SECRET_KEY`. Keep a private backup of the key for the lifetime of the Instance.
5. Run `openssl rand -hex 16` and paste the result into `SETUP_CODE`.
6. Keep the build command `pnpm run build` and the deploy command `pnpm run deploy`. Choose **Deploy**. When the build finishes, open the Worker URL. Enter the code on the setup page and choose an owner password.
7. [Set up updates](#update-a-cloudflare-copy).

### Fix an expired GitHub authorization

If the form says "Your GitHub authorization has expired", uninstall **Cloudflare Workers and Pages** in GitHub's **Installed GitHub Apps** settings. Return to the deploy form and choose **New GitHub connection**. Under **Repository access**, choose **All repositories**, then **Install & Authorize**. If other Workers use the same installation, restore the app's access to their repositories and check their Build settings afterwards ([GitHub's installed app settings](https://docs.github.com/en/apps/using-github-apps/reviewing-and-modifying-installed-github-apps)).

Revoking and granting authorization again does not fix it, and neither does giving the existing installation access to all repositories (checked on 2026-11-19, [live run](../architecture/cloudflare-deploy-button.md#live-run-on-2026-11-19)).

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

3. Turn on R2 in that account. The deploy command creates the D1 database, R2 bucket and Queue that the Worker configuration names, and applies the D1 migrations.
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

6. Open the Worker URL that Wrangler prints. Enter the `SETUP_CODE` from your secrets file and choose an owner password. Back up the file, so the Instance can still read its saved keys after a redeploy.

The [Cloudflare deploy button notes](../architecture/cloudflare-deploy-button.md) explain the secrets and how the command deploys the Worker.

## Update a Cloudflare copy

1. Turn off preview builds in Cloudflare. With them on, each update pull request runs `npx wrangler preview`, which fails because the copy has no `previews` block. A working preview also needs D1, R2 and Queue bindings with staging resources ([Preview configuration](https://developers.cloudflare.com/workers/previews/configuration/)).

   Open your Worker's **Settings**, then **Build**, then **Branch control**. Turn off **Builds for non-production branches** (also labeled **Enable Preview Builds**). Confirm that the production branch matches your copy's default branch, which can be `master` ([Cloudflare branch build settings](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/)).
2. Enable Actions and Issues in your GitHub copy. Create a fine-grained personal access token scoped to that repository. Give it read and write access to **Contents**, **Pull requests**, and **Workflows**, and read access to **Metadata**. Save it as a repository Actions secret named `UPDATE_TOKEN`. See how to [create a fine-grained token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#creating-a-fine-grained-personal-access-token) and [add a repository Actions secret](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets#creating-secrets-for-a-repository).
3. If the copy has no update workflow, copy [the update workflow from the `release` branch](https://github.com/kyanitehq/threadsift/blob/release/.github/workflows/update-from-upstream.yml). Commit the file at the same path, `.github/workflows/update-from-upstream.yml`, on your copy's default branch. The button's copy can have no workflow files.

The **Update from upstream** workflow runs weekly. To check sooner, select it in Actions and choose **Run workflow**. In a public repository, GitHub disables scheduled runs after 60 days without repository activity, and **Enable workflow** resumes them. Before you merge an update, review any local edits it would remove and provision any new bindings the pull request lists. Workers Builds deploys the merge.
