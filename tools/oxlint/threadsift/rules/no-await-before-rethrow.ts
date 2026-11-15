import { defineRule } from "@oxlint/plugins";
import type { Context, ESTree } from "@oxlint/plugins";
import { z } from "zod";

import {
  type Trusted,
  caughtBy,
  isTrusted,
  repositoryPath,
  undeclaredNames,
} from "../shared/bindings.ts";
import { canThrowAfter, catchesAround, finalizerAround } from "../shared/catch-paths.ts";

const OptionsSchema = z.object({
  cannotThrow: z.record(z.string(), z.array(z.string())).default({}),
  finalizers: z.boolean().default(true),
});

interface Found {
  trusted: Trusted;
  finalizers: boolean;
  readonly awaits: Map<ESTree.CatchClause, ESTree.Node[]>;
  readonly throws: Map<ESTree.CatchClause, ESTree.ThrowStatement[]>;
  readonly reported: Set<ESTree.Node>;
}

type Message = "awaitBeforeRethrow" | "awaitInFinally";

function awaitedCallee(awaited: ESTree.Node): ESTree.IdentifierReference | null {
  if (awaited.type !== "AwaitExpression") return null;

  const { argument } = awaited;

  return argument.type === "CallExpression" && argument.callee.type === "Identifier"
    ? argument.callee
    : null;
}

function startOver(found: Found, options: readonly unknown[]): void {
  const parsed = OptionsSchema.parse(options[0] ?? {});

  found.awaits.clear();
  found.throws.clear();
  found.reported.clear();
  found.finalizers = parsed.finalizers;
  found.trusted = new Map(
    Object.entries(parsed.cannotThrow).map(([module, names]) => [module, new Set(names)]),
  );
}

function report(context: Context, found: Found, node: ESTree.Node, messageId: Message): void {
  if (found.reported.has(node)) return;

  found.reported.add(node);
  context.report({ node, messageId });
}

function noteAwait(context: Context, found: Found, awaited: ESTree.Node): void {
  const callee = awaitedCallee(awaited);

  if (callee !== null && isTrusted(context, found.trusted, callee)) return;

  if (found.finalizers && finalizerAround(awaited))
    report(context, found, awaited, "awaitInFinally");

  for (const { clause, guarded } of catchesAround(awaited)) {
    if (!guarded) found.awaits.set(clause, [...(found.awaits.get(clause) ?? []), awaited]);
  }
}

function checkClause(context: Context, found: Found, clause: ESTree.CatchClause): void {
  const thrown = found.throws.get(clause) ?? [];

  for (const awaited of found.awaits.get(clause) ?? []) {
    if (thrown.some((each) => canThrowAfter(awaited, each, clause)))
      report(context, found, awaited, "awaitBeforeRethrow");
  }
}

function checkStale(context: Context, found: Found, program: ESTree.Program): void {
  const names = found.trusted.get(repositoryPath(context.cwd, context.filename));

  for (const name of undeclaredNames(program, names)) {
    context.report({ node: program, messageId: "staleCannotThrow", data: { name } });
  }
}

export const noAwaitBeforeRethrowRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Refuse an await that runs before a catch block throws the caught error, and an await in a finally block: a failing await replaces the error the caller needs (docs/agents/changing-code.md, State, writes and failures).",
    },
    messages: {
      awaitBeforeRethrow:
        "This await can run before the catch block throws the caught error, so a failure here replaces that error. Run the cleanup through bestEffort or readOrAssume (src/core/failure-log.ts), or put it in its own try with a catch.",
      awaitInFinally:
        "This await runs in a finally block, so a failure here replaces the error that ended the try block. Run the body and the cleanup through withCleanup (src/core/failure-log.ts), or the cleanup through bestEffort.",
      staleCannotThrow:
        "oxlint.config.ts lists {{name}} as a function of this module that cannot throw, and the module declares no such function.",
    },
    schema: [z.toJSONSchema(OptionsSchema, { target: "draft-4", io: "input" })],
  },
  createOnce(context) {
    const found: Found = {
      trusted: new Map(),
      finalizers: true,
      awaits: new Map(),
      throws: new Map(),
      reported: new Set(),
    };

    return {
      before() {
        startOver(found, context.options);
      },
      Program(program) {
        checkStale(context, found, program);
      },
      AwaitExpression(awaited) {
        noteAwait(context, found, awaited);
      },
      ForOfStatement(loop) {
        if (loop.await) noteAwait(context, found, loop);
      },
      VariableDeclaration(declaration) {
        if (declaration.kind === "await using") noteAwait(context, found, declaration);
      },
      ThrowStatement(thrown) {
        const clause = caughtBy(context, thrown.argument);

        if (clause !== null)
          found.throws.set(clause, [...(found.throws.get(clause) ?? []), thrown]);
      },
      "CatchClause:exit"(clause) {
        checkClause(context, found, clause);
      },
    };
  },
});
