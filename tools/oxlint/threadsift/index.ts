import { eslintCompatPlugin } from "@oxlint/plugins";

import { noCommentsRule } from "./rules/no-comments.ts";
import { staticImportSourceRule } from "./rules/static-import-source.ts";

export default eslintCompatPlugin({
  meta: { name: "threadsift" },
  rules: {
    "no-comments": noCommentsRule,
    "static-import-source": staticImportSourceRule,
  },
});
