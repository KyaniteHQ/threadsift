import { defineRule } from "@oxlint/plugins";

export const noItemInsertRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Refuse insert(items), so every insert into the items table goes through itemInsert, which carries the Restore guard.",
    },
    messages: {
      door: "Insert an Item through itemInsert (src/features/item/core/item-rows.ts). It puts the Restore guard in front of the insert, so a Restore that holds the library refuses the Item (docs/architecture/export-backup-and-restore.md, While it runs).",
    },
  },
  createOnce(context) {
    return {
      CallExpression(node) {
        const { callee, arguments: args } = node;
        const [table] = args;

        if (
          callee.type === "MemberExpression" &&
          !callee.computed &&
          callee.property.type === "Identifier" &&
          callee.property.name === "insert" &&
          table?.type === "Identifier" &&
          table.name === "items"
        ) {
          context.report({ node, messageId: "door" });
        }
      },
    };
  },
});
