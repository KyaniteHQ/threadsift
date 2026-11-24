# Threadsift: architecture

These pages say what Threadsift is built with, where each part runs and why. [The spec](spec.md) says what v1 does, one bullet per behaviour.

## Status

A live run proved part of each behaviour below, and other checks remain open. [Open items and unverified claims](architecture/open-items-and-unverified-claims.md) lists every open check and every case the gate does not run.

| Part | Status |
|---|---|
| [Cloudflare deploy button](architecture/cloudflare-deploy-button.md) | Deployed `release` on 2026-11-19; the update workflow and the preview build are open |
| [Vault mirror](architecture/vault-mirror.md) | Works; a real GitHub `Retry-After` wait is unverified |
| [Export, backup and Restore](architecture/export-backup-and-restore.md) | Built; large zips on a deployed Worker and Restore behind a reverse proxy are unverified |
| Grok Bot as a Provider ([AI tasks and Providers](architecture/ai-tasks-and-providers.md)) | All six task kinds ran on a container Instance; the Worker Queue wake is unverified |
| X reader ([Fetchers](architecture/fetchers.md)) | Ran on a container Instance; the Worker's reader choice is unverified |

## Sections

| Section | Covers |
|---|---|
| [The stack at a glance](architecture/the-stack-at-a-glance.md) | The tool for each concern, on both targets |
| [One codebase, two install targets](architecture/one-codebase-two-install-targets.md) | The core, its ports and the two adapter sets |
| [Repository layout](architecture/repository-layout.md) | Where files go and why |
| [Database and search](architecture/database-and-search.md) | SQLite, guarded batches, migrations, search |
| [Data model outline](architecture/data-model-outline.md) | Tables, Highlights, media, Proposals, Item identity |
| [Files](architecture/files.md) | The file store port and its adapters |
| [Jobs, leases and the schedule](architecture/jobs-leases-and-the-schedule.md) | Background steps, leases, retries, the sweep |
| [Fetchers](architecture/fetchers.md) | How a link becomes an Item's content |
| [AI tasks and Providers](architecture/ai-tasks-and-providers.md) | Every model call and its Providers |
| [Access: owner login, agent tokens, MCP](architecture/access-owner-login-agent-tokens-mcp.md) | Who may call the Instance |
| [Web app](architecture/web-app.md) | The single-page app and its build |
| [Extension and Threadsift bot](architecture/extension-and-threadsift-bot.md) | The two clients of the HTTP API |
| [Vault mirror](architecture/vault-mirror.md) | The one-way Markdown copy into Obsidian |
| [Export, backup and restore](architecture/export-backup-and-restore.md) | The library zip and its Restore |
| [Container image](architecture/container-image.md) | The image and its start-up |
| [Cloudflare deploy button](architecture/cloudflare-deploy-button.md) | The deploy path and the update workflow |
| [Development environment](architecture/development-environment.md) | devenv, tasks, hooks |
| [Lint and format](architecture/lint-and-format.md) | The tools and their rules |
| [Dependency updates](architecture/dependency-updates.md) | The update bot and its schedule |
| [CI, releases and rollback](architecture/ci-releases-and-rollback.md) | The gate, the release, the live deploy |
| [Testing](architecture/testing.md) | How the suites are built |
| [Decisions and evidence](architecture/decisions-and-evidence.md) | Reasons and measurements behind product decisions |
| [HTTP interfaces](architecture/http-interfaces.md) | The rules around the routes |
| [Open items and unverified claims](architecture/open-items-and-unverified-claims.md) | What is not built, not proven, or not run by the gate |
