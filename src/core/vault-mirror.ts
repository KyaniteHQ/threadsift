import { and, asc, eq, gt, lte, sql } from "drizzle-orm";

import { bestEffort, logFailure } from "./failure-log.ts";
import type { JobPorts } from "./job-outcome.ts";
import { hasOpenJob } from "./job-rows.ts";
import { VAULT_DEADLINE_MS, VAULT_NOTE_LIMIT } from "./vault-contract.ts";
import { vaultFiles } from "./vault-files.ts";
import { type VaultFile, vaultGithub } from "./vault-github.ts";
import { VaultFailure } from "./vault-request.ts";
import { mirrorFiles, mirrorPaths, vaultSettings } from "./vault-tables.ts";

type Pending = typeof mirrorPaths.$inferSelect;
type Lease = typeof vaultSettings.$inferSelect;

const CLOCK = sql`cast(unixepoch('subsec') * 1000 as integer)`;
const AVAILABLE = sql`not exists (select 1 from restores where state = 'running' or (state = 'failed' and failure = 'gave-up'))`;

function holding(lease: Readonly<Lease>) {
  return and(
    eq(vaultSettings.generation, lease.generation),
    eq(vaultSettings.sealedToken, lease.sealedToken),
    gt(vaultSettings.leaseUntil, CLOCK),
  );
}

async function current(
  ports: JobPorts,
  lease: Readonly<Lease>,
  pending: readonly Pending[],
): Promise<boolean> {
  const [held] = await ports.db
    .select({ id: vaultSettings.id })
    .from(vaultSettings)
    .where(and(holding(lease), AVAILABLE));
  if (held === undefined) return false;
  const [changed] = await ports.db
    .select({ one: sql<number>`1` })
    .from(mirrorPaths)
    .where(
      sql.join(
        pending.map(
          ({ itemId, sequence }) =>
            sql`(${mirrorPaths.itemId} = ${itemId} and ${mirrorPaths.sequence} <> ${sequence})`,
        ),
        sql` or `,
      ),
    )
    .limit(1);
  return changed === undefined;
}

async function written(
  ports: JobPorts,
  lease: Readonly<Lease>,
  pending: readonly Pending[],
  files: readonly VaultFile[],
): Promise<void> {
  const { db } = ports;
  const held = sql`exists (select 1 from ${vaultSettings} where ${holding(lease)})`;
  const sameSettings = sql`exists (select 1 from ${vaultSettings} where ${vaultSettings.sealedToken} = ${lease.sealedToken})`;
  await db.batch([
    db.update(vaultSettings).set({ nextAttemptAt: 0 }).where(holding(lease)),
    ...pending.map(({ itemId }) =>
      db
        .insert(mirrorPaths)
        .select(
          db
            .select({ itemId: sql<number>`${itemId}`.as("item_id") })
            .from(sql`(select 1)`)
            .where(sql`not (${held}) and ${sameSettings}`),
        )
        .onConflictDoUpdate({
          target: mirrorPaths.itemId,
          set: { sequence: sql`excluded.sequence` },
        }),
    ),
    ...files.map((file) => {
      const itemId = file.itemId;
      return file.content === null
        ? db.delete(mirrorFiles).where(and(eq(mirrorFiles.path, file.path), sameSettings))
        : db
            .insert(mirrorFiles)
            .select(
              db
                .select({
                  path: sql<string>`${file.path}`.as("path"),
                  itemId: sql<number>`${itemId}`.as("item_id"),
                })
                .from(sql`(select 1)`)
                .where(sameSettings),
            )
            .onConflictDoNothing();
    }),
    ...pending.map(({ itemId, sequence }) =>
      db
        .delete(mirrorPaths)
        .where(and(eq(mirrorPaths.itemId, itemId), lte(mirrorPaths.sequence, sequence), held)),
    ),
  ]);
}

async function drain(ports: JobPorts, lease: Readonly<Lease>): Promise<void> {
  const pending = await ports.db
    .select()
    .from(mirrorPaths)
    .where(sql`not exists ${hasOpenJob(undefined, sql`${mirrorPaths.itemId}`)}`)
    .orderBy(asc(mirrorPaths.sequence))
    .limit(VAULT_NOTE_LIMIT);
  if (pending.length === 0) return;
  const token = await ports.secrets?.open(lease.sealedToken);
  if (token === null || token === undefined) throw new VaultFailure("secret-missing");
  const batch = await vaultFiles(ports, pending);
  const { files } = batch;
  const github = vaultGithub(
    ports.network,
    { ...lease, token },
    AbortSignal.timeout(VAULT_DEADLINE_MS),
  );
  await github.write(files, () => current(ports, lease, batch.pending));
  await written(ports, lease, batch.pending, files);
}

export async function mirrorVault(ports: JobPorts): Promise<void> {
  const [lease] = await ports.db
    .update(vaultSettings)
    .set({
      generation: sql`${vaultSettings.generation} + 1`,
      leaseUntil: sql`${CLOCK} + ${VAULT_DEADLINE_MS}`,
    })
    .where(
      and(lte(vaultSettings.leaseUntil, CLOCK), lte(vaultSettings.nextAttemptAt, CLOCK), AVAILABLE),
    )
    .returning();
  if (lease === undefined) return;
  let nextAttemptAt = 0;
  try {
    await drain(ports, lease);
  } catch (error) {
    nextAttemptAt =
      error instanceof VaultFailure && error.until > 0 ? error.until : Date.now() + 60_000;
    logFailure("vault-mirror-failed", { generation: lease.generation }, error);
  } finally {
    await bestEffort(
      { event: "vault-lease-not-released", fields: { generation: lease.generation } },
      async () => {
        await ports.db
          .update(vaultSettings)
          .set({ leaseUntil: 0, nextAttemptAt })
          .where(holding(lease));
      },
    );
  }
}
