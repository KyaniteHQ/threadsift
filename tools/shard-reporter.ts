import type { TestEvent } from "node:test/reporters";
import { inspect } from "node:util";

export default async function* report(events: AsyncIterable<TestEvent>) {
  const failures: string[] = [];

  for await (const event of events) {
    if (event.type === "test:fail" && event.data.todo === undefined) {
      const { name, file, line, details } = event.data;
      failures.push(
        `${file ?? ""}:${String(line)} ${name}\n${inspect(details.error.cause ?? details.error)}`,
      );
    }
    if (event.type === "test:summary" && event.data.file === undefined) {
      yield JSON.stringify({ ...event.data, failures: failures.join("\n") });
    }
  }
}
