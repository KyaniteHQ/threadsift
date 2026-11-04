import { defineRule } from "@oxlint/plugins";

export const staticImportSourceRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Require a plain string source in import(), so the import bans in the same files can see what it loads.",
    },
    messages: {
      computed:
        "Give import() a plain string. A computed source hides the module from the import bans that keep runtime modules out of shared code.",
    },
  },
  createOnce(context) {
    return {
      ImportExpression(node) {
        if (node.source.type !== "Literal")
          context.report({ node: node.source, messageId: "computed" });
      },
    };
  },
});
