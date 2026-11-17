# Threadsift: architecture

| State | Part |
|---|---|
| Not built | The Cloudflare deploy button (`docs/architecture/cloudflare-deploy-button.md`), the Provider comparison that picks the default model, the contributor licence agreement workflow, and the README's recording, screenshots and deploy buttons |
| Partly built | The Vault mirror copies Paste notes to GitHub and has Obsidian settings; live GitHub writes are unverified. Other Item changes, wiki notes and folder mode are Not built (`docs/architecture/vault-mirror.md`) |
| Partly built | The Restore of every library record, the stored images and post text files, the search parts and the Highlight anchors is built (`docs/architecture/export-backup-and-restore.md`). Cancel, resume, the cleanup of abandoned parts and the setup page step are built |
| Partly built | Grok Bot: no AI task other than the X link send has run against a real bot (`docs/architecture/open-items-and-unverified-claims.md`) |
| Partly built | X readers: the grok CLI reader ran on the container Instance on 2026-11-15 and 2026-11-16. The Grok Bot reader has not read a link from a real bot answer, and 10 of the 15 cause notes have not shown on a real Item there (`docs/architecture/open-items-and-unverified-claims.md`) |

The table lists the parts of the app that are not fully built. A section that names a file or binding that does not exist yet says "Not built", as the deploy button does. `docs/spec.md` says what v1 does, each bullet matching the code; the files under `docs/architecture/` say what it is built with and where each part runs. Unless a section dates its own check, versions named in those files were checked on 2026-11-04.

## Sections

| Section | File |
|---|---|
| The stack at a glance | [`docs/architecture/the-stack-at-a-glance.md`](architecture/the-stack-at-a-glance.md) |
| One codebase, two install targets | [`docs/architecture/one-codebase-two-install-targets.md`](architecture/one-codebase-two-install-targets.md) |
| Repository layout | [`docs/architecture/repository-layout.md`](architecture/repository-layout.md) |
| Database and search | [`docs/architecture/database-and-search.md`](architecture/database-and-search.md) |
| Data model outline | [`docs/architecture/data-model-outline.md`](architecture/data-model-outline.md) |
| Files | [`docs/architecture/files.md`](architecture/files.md) |
| Jobs, leases and the schedule | [`docs/architecture/jobs-leases-and-the-schedule.md`](architecture/jobs-leases-and-the-schedule.md) |
| Fetchers | [`docs/architecture/fetchers.md`](architecture/fetchers.md) |
| AI tasks and Providers | [`docs/architecture/ai-tasks-and-providers.md`](architecture/ai-tasks-and-providers.md) |
| Access: owner login, agent tokens, MCP | [`docs/architecture/access-owner-login-agent-tokens-mcp.md`](architecture/access-owner-login-agent-tokens-mcp.md) |
| Web app | [`docs/architecture/web-app.md`](architecture/web-app.md) |
| Extension and Threadsift bot | [`docs/architecture/extension-and-threadsift-bot.md`](architecture/extension-and-threadsift-bot.md) |
| Vault mirror | [`docs/architecture/vault-mirror.md`](architecture/vault-mirror.md) |
| Export, backup and restore | [`docs/architecture/export-backup-and-restore.md`](architecture/export-backup-and-restore.md) |
| Container image | [`docs/architecture/container-image.md`](architecture/container-image.md) |
| Cloudflare deploy button | [`docs/architecture/cloudflare-deploy-button.md`](architecture/cloudflare-deploy-button.md) |
| Development environment | [`docs/architecture/development-environment.md`](architecture/development-environment.md) |
| Lint and format | [`docs/architecture/lint-and-format.md`](architecture/lint-and-format.md) |
| Dependency updates | [`docs/architecture/dependency-updates.md`](architecture/dependency-updates.md) |
| CI, releases and rollback | [`docs/architecture/ci-releases-and-rollback.md`](architecture/ci-releases-and-rollback.md) |
| Testing | [`docs/architecture/testing.md`](architecture/testing.md) |
| Decisions and evidence | [`docs/architecture/decisions-and-evidence.md`](architecture/decisions-and-evidence.md) |
| HTTP interfaces | [`docs/architecture/http-interfaces.md`](architecture/http-interfaces.md) |
| Open items and unverified claims | [`docs/architecture/open-items-and-unverified-claims.md`](architecture/open-items-and-unverified-claims.md) |
