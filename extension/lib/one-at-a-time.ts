import { NOTHING } from "../../src/core/contract/nothing.ts";

export function oneAtATime(): <Result>(task: () => Promise<Result>) => Promise<Result> {
  let queue: Promise<unknown> = Promise.resolve();

  return (task) => {
    const run = queue.then(task);
    queue = run.catch(NOTHING);

    return run;
  };
}
