import { eslintCompatPlugin } from "@oxlint/plugins";

import { noCommentsRule } from "./rules/no-comments.ts";

export default eslintCompatPlugin({
  meta: { name: "threadsift" },
  rules: {
    "no-comments": noCommentsRule,
  },
});
