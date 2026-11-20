import { defineRule } from "@oxlint/plugins";
import { z } from "zod";

const OptionsSchema = z.object({
  patterns: z.array(z.object({ regex: z.string(), message: z.string() })).default([]),
});

interface Found {
  patterns: readonly { readonly regex: RegExp; readonly message: string }[];
}

export const noRestrictedImportTypesRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Refuse an import() type, such as type T = import('x') or typeof import('x'), whose source matches a pattern that eslint/no-restricted-imports refuses on the same path, because that rule does not visit it (docs/architecture/lint-and-format.md).",
    },
    messages: { restricted: "{{message}}" },
    schema: [z.toJSONSchema(OptionsSchema, { target: "draft-4", io: "input" })],
  },
  createOnce(context) {
    const found: Found = { patterns: [] };

    return {
      before() {
        const parsed = OptionsSchema.parse(context.options[0] ?? {});

        found.patterns = parsed.patterns.map(({ regex, message }) => ({
          regex: new RegExp(regex, "u"),
          message,
        }));
      },
      TSImportType(node) {
        const restricted = found.patterns.find(({ regex }) => regex.test(node.source.value));

        if (restricted !== undefined) {
          context.report({ node, messageId: "restricted", data: { message: restricted.message } });
        }
      },
    };
  },
});
