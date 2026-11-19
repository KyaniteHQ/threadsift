# Threadsift: architecture

| State | Part |
|---|---|
| Partly verified | The Cloudflare deploy button deployed `release` on Workers Paid on 2026-11-19. The copy took a later release and kept its Item after the owner added the update workflow. The cause of the missing workflow files and a working preview build remain open (`docs/architecture/cloudflare-deploy-button.md`). |
| Built | The Vault mirror keeps Item notes and the library wiki current on GitHub or in a mounted folder on the container (`docs/architecture/vault-mirror.md`) |
| Partly built | The Restore of every library record, the stored images and post text files, the search parts and the Highlight anchors is built (`docs/architecture/export-backup-and-restore.md`). Cancel, resume, the cleanup of abandoned parts and the setup page step are built |
| Partly verified | Grok Bot completed all six Provider task kinds on the owner's container Instance. The Worker Queue wake after a bot result remains unverified (`docs/architecture/open-items-and-unverified-claims.md`, Grok Bot task runs). |
| Partly verified | The Grok CLI read X links on the owner's container Instance on 2026-11-15 and 2026-11-16. Grok Bot answered X link sends on both targets. Which reader the deployed Worker's rule chose, and why, remains unverified. The container checks did not observe 10 of the 15 cause notes on a real Item (`docs/architecture/open-items-and-unverified-claims.md`, Grok Bot task runs). |

The table lists implementation and verification status. "Partly verified" means a live run proved part of the behaviour and other checks remain open. A section that names a file or binding that does not exist yet says "Not built". Each bullet in `docs/spec.md` describes what v1 does and matches the code. The files under `docs/architecture/` say what it is built with and where each part runs. Unless a section dates its own check, versions named in those files were checked on 2026-11-04.

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
