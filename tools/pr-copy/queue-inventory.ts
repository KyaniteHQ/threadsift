import { z } from "zod";

const QueueName = z.looseObject({ queue_name: z.string() });

const WorkerQueue = QueueName.extend({
  consumers: z.array(z.object({ script: z.string().min(1) })),
});

export function queueInventoryRow(matches: (name: string) => boolean) {
  return QueueName.transform((row) => {
    if (!matches(row.queue_name)) return null;
    const queue = WorkerQueue.parse(row);

    return {
      name: queue.queue_name,
      consumers: queue.consumers.map((consumer) => consumer.script),
    };
  });
}
