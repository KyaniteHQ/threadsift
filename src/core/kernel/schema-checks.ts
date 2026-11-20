import { type SQLWrapper, sql } from "drizzle-orm";

export function literal(text: string) {
  return sql.raw(`'${text}'`);
}

export function listed(values: readonly string[]) {
  return sql.raw(values.map((value) => `'${value}'`).join(", "));
}

export function caseOf(subject: Readonly<SQLWrapper>, results: Readonly<Record<string, string>>) {
  const branches = Object.entries(results).map(([value, result]) =>
    sql.raw(`when '${value}' then '${result}'`),
  );

  return sql`case ${subject} ${sql.join(branches, sql` `)} end`;
}

export function subjectsForKind(
  kind: Readonly<SQLWrapper>,
  columns: Readonly<Record<string, SQLWrapper>>,
  variants: Readonly<Record<string, readonly string[]>>,
) {
  const names = new Set(Object.values(variants).flat());
  const subjects = Object.entries(columns).filter(([name]) => names.has(name));

  const cases = Object.entries(variants).map(([value, present]) => {
    const matches = subjects.map(([name, column]) =>
      present.includes(name) ? sql`${column} is not null` : sql`${column} is null`,
    );

    return sql`when ${sql.raw(`'${value}'`)} then (${sql.join(matches, sql` and `)})`;
  });

  return sql`case ${kind} ${sql.join(cases, sql` `)} else 1 end`;
}

export class UninitializedDatabase extends Error {
  constructor(table: string) {
    super(`Database was not initialized by the migration: ${table} seed row is missing`);
    this.name = "UninitializedDatabase";
  }
}
