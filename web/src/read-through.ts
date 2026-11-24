export interface PagedPage {
  readonly next: string | null;
}

interface Paging<Shown extends PagedPage, Added extends PagedPage> {
  readonly read: (cursor: string) => Promise<Added | null>;
  readonly joined: (shown: Readonly<Shown>, added: Readonly<Added>) => Shown;
  readonly covers: (shown: Readonly<Shown>) => boolean;
}

export async function readThrough<Shown extends PagedPage, Added extends PagedPage>(
  shown: Shown,
  paging: Readonly<Paging<Shown, Added>>,
): Promise<Shown | null> {
  if (shown.next === null || paging.covers(shown)) return shown;

  const added = await paging.read(shown.next);

  return added === null ? null : readThrough(paging.joined(shown, added), paging);
}
