import { defineRule } from "@oxlint/plugins";

export const noItemInsertRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Refuse insert(items), so every insert into the items table goes through itemInsert, which pairs it with the Daily budget guard.",
    },
    messages: {
      door: "Insert an Item through itemInsert (src/features/item/core/item-rows.ts). It returns the Daily budget guard and the insert as a pair. Commit both through heldBatch, which puts the Restore guard first, so a spent agent token and a Restore that holds the library both refuse the Item (docs/architecture/access-owner-login-agent-tokens-mcp.md; docs/architecture/export-backup-and-restore.md, While it runs).",
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
