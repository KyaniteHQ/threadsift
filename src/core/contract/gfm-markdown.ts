import remarkGfm from "remark-gfm";
import type { Data, Plugin } from "unified";

type TextConstructs = NonNullable<NonNullable<Data["micromarkExtensions"]>[number]["text"]>;
type Construct = Exclude<NonNullable<TextConstructs[string]>, readonly unknown[]>;
type Code = Parameters<Parameters<Construct["tokenize"]>[1]>[0];

const DATA_RUN: Construct = {
  name: "dataRun",
  add: "after",
  tokenize(effects, ok) {
    const startsConstruct = (code: number): boolean => {
      const found = this.parser.constructs.text[code];

      if (found === undefined) return false;

      return (Array.isArray(found) ? found : [found]).some(
        (item) => item.previous === undefined || item.previous.call(this, this.previous),
      );
    };

    const rest = (code: Code) => {
      if (code === null || startsConstruct(code)) {
        effects.exit("data");

        return ok(code);
      }

      effects.consume(code);

      return rest;
    };

    return (code) => {
      effects.enter("data");
      effects.consume(code);

      return rest;
    };
  },
  resolveTo(events) {
    const previous = events.at(-3);
    const added = events.at(-1);

    if (previous?.[0] === "exit" && previous[1].type === "data" && added !== undefined) {
      previous[1].end = added[1].end;
      events.splice(-2);
    }

    return events;
  },
};

const remarkDataRun: Plugin = function remarkDataRun() {
  const data = this.data();

  data.micromarkExtensions ??= [];
  data.micromarkExtensions.push({ text: { null: DATA_RUN } });
};

export const GFM_PLUGINS = [remarkGfm, remarkDataRun];
