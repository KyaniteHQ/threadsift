import { defineRule } from "@oxlint/plugins";

const lineDirectives = [
  /^(?:oxlint|eslint)-disable(?:-next-line|-line)?\s+\S.*?\s--\s+\S/u,
  /^(?:oxlint|eslint)-enable(?:\s+[^\s,]+(?:\s*,\s*[^\s,]+)*)?$/u,
  /^@ts-expect-error\s+\S/u,
  /^\/\s*<reference\s+[a-z-]+="[^"]*"\s*\/>$/u,
  /^oxfmt-ignore$/u,
];

const blockDirectives = [
  /^(?:oxlint|eslint)-(?:disable|enable)\s+\S.*?\s--\s+\S/u,
  /^[#@]__(?:PURE|NO_SIDE_EFFECTS)__$/u,
  /^@vite-ignore$/u,
  /^@jsxImportSource\s+\S+$/u,
  /^oxfmt-ignore$/u,
];

const licenceLine = /^SPDX-License-Identifier:\s+\S/mu;

const constraintWithUpstreamLink = /^\S.*\shttps:\/\/\S+$/u;

const onlyShebangBefore = /^(?:#![^\n]*\n)?\s*$/u;

function blockBody(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/^\s*\*?\s*/u, "").trim())
    .filter((line) => line !== "")
    .join("\n");
}

function isKept(kind: "Line" | "Block" | "Shebang", text: string, textBefore: string): boolean {
  if (kind === "Shebang") return true;

  if (kind === "Line") {
    const line = text.trim();

    return (
      lineDirectives.some((directive: Readonly<RegExp>) => directive.test(line)) ||
      constraintWithUpstreamLink.test(line) ||
      (licenceLine.test(line) && onlyShebangBefore.test(textBefore))
    );
  }

  const body = blockBody(text);

  return (
    (!body.includes("\n") &&
      blockDirectives.some((directive: Readonly<RegExp>) => directive.test(body))) ||
    (licenceLine.test(body) && onlyShebangBefore.test(textBefore))
  );
}

export const noCommentsRule = defineRule({
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow prose comments; names, types and structure carry the meaning (docs/agents/changing-code.md, No comments).",
    },
    messages: {
      comment:
        "Remove this comment. Say it with a name, a type or a smaller function, or move the fact to the commit message or the doc that owns it. A constraint an outside dependency forces keeps one line that names it and ends with its upstream https:// link.",
    },
  },
  createOnce(context) {
    return {
      Program() {
        const { text } = context.sourceCode;

        for (const comment of context.sourceCode.getAllComments()) {
          const textBefore = text.slice(0, comment.range[0]);

          if (!isKept(comment.type, comment.value, textBefore))
            context.report({ node: comment, messageId: "comment" });
        }
      },
    };
  },
});
