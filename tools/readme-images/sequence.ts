export function sequence<Item>(
  items: readonly Item[],
  run: (item: Item, index: number) => Promise<void>,
): Promise<void> {
  return items.reduce((done, item, index) => done.then(() => run(item, index)), Promise.resolve());
}
