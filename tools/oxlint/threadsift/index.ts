import { eslintCompatPlugin } from "@oxlint/plugins";

import { layerImportsRule } from "./rules/layer-imports.ts";
import { noAwaitBeforeRethrowRule } from "./rules/no-await-before-rethrow.ts";
import { noCommentsRule } from "./rules/no-comments.ts";
import { noRestrictedImportTypesRule } from "./rules/no-restricted-import-types.ts";
import { noServerValueImportRule } from "./rules/no-server-value-import.ts";
import { staticImportSourceRule } from "./rules/static-import-source.ts";

export default eslintCompatPlugin({
  meta: { name: "threadsift" },
  rules: {
    "layer-imports": layerImportsRule,
    "no-await-before-rethrow": noAwaitBeforeRethrowRule,
    "no-comments": noCommentsRule,
    "no-restricted-import-types": noRestrictedImportTypesRule,
    "no-server-value-import": noServerValueImportRule,
    "static-import-source": staticImportSourceRule,
  },
});
