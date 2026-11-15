import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";
import { z } from "zod";

const OptionsSchema = z.object({ cannotThrow: z.array(z.string()).default([]) });

interface Enclosing {
  readonly clause: ESTree.CatchClause | undefined;
  readonly guarded: boolean;
}

// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- ESTree nodes are mutable by construction, so no parameter of node type is readonly
function enclosingCatch(start: Readonly<ESTree.Node>): Enclosing {
  let guarded = false;
  let child = start;

  for (let parent = start.parent; parent !== null; parent = parent.parent) {
    if (parent.type === "CatchClause") return { clause: parent, guarded };

    if (
      parent.type === "FunctionDeclaration" ||
      parent.type === "FunctionExpression" ||
      parent.type === "ArrowFunctionExpression"
    )
      break;

    if (parent.type === "TryStatement" && parent.block === child) guarded = true;

    child = parent;
  }

  return { clause: undefined, guarded };
}

export const noAwaitBeforeRethrowRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Refuse a catch block that awaits and then throws the caught error: a failing await replaces the error the caller needs (docs/agents/changing-code.md, State, writes and failures).",
    },
    messages: {
      awaitBeforeRethrow:
        "This await runs before the catch block throws the caught error, so a failure here replaces that error. Move the cleanup into a function that cannot throw and logs its own failure with logFailure, wrap it in its own try, or list the function under cannotThrow in oxlint.config.ts.",
    },
    schema: [
      {
        type: "object",
        properties: { cannotThrow: { type: "array", items: { type: "string" } } },
        additionalProperties: false,
      },
    ],
  },
  createOnce(context) {
    const firstAwaits = new Map<ESTree.CatchClause, ESTree.AwaitExpression>();
    let cannotThrow = new Set<string>();

    return {
      before() {
        firstAwaits.clear();
        cannotThrow = new Set(OptionsSchema.parse(context.options[0] ?? {}).cannotThrow);
      },
      AwaitExpression(awaited) {
        const { clause, guarded } = enclosingCatch(awaited);

        if (clause === undefined || guarded || firstAwaits.has(clause)) return;

        const { argument } = awaited;

        const harmless =
          argument.type === "CallExpression" &&
          argument.callee.type === "Identifier" &&
          cannotThrow.has(argument.callee.name);

        if (!harmless) firstAwaits.set(clause, awaited);
      },
      ThrowStatement(thrown) {
        const { argument } = thrown;
        const { clause } = enclosingCatch(thrown);
        const firstAwait = clause === undefined ? undefined : firstAwaits.get(clause);

        if (clause === undefined || firstAwait === undefined) return;

        if (argument.type !== "Identifier" || clause.param?.type !== "Identifier") return;

        if (argument.name !== clause.param.name) return;

        firstAwaits.delete(clause);
        context.report({ node: firstAwait, messageId: "awaitBeforeRethrow" });
      },
    };
  },
});
