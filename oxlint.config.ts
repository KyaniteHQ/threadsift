import { defineConfig } from "oxlint";

const NODE_GLOBALS = ["process", "Buffer", "global", "__dirname", "__filename", "require"].map(
  (name) => ({
    name,
    message:
      "Node globals do not exist on the Worker or in the browser; src/core/, src/http/ and web/ run there (docs/architecture/one-codebase-two-install-targets.md).",
  }),
);

const CANNOT_THROW = {
  "src/core/kernel/failure-log.ts": ["bestEffort", "readOrAssume"],
  "src/core/kernel/guards.ts": ["guardHeldOrUnread"],
};

const SERVER_MODULES = ["^(drizzle-orm|hono)(/|$)", "^@hono/", "^node:", "^cloudflare:"];

const PORT_PATTERNS = [
  {
    regex: "^(node|cloudflare):",
    message:
      "src/core/ and src/http/ run on both targets; a runtime module belongs in an adapter under src/targets/ (docs/architecture/one-codebase-two-install-targets.md).",
  },
  {
    regex: "(^|[/#@])targets(/|$)",
    message:
      "src/core/ and src/http/ never import an adapter; the target entry passes ports in through createApp(ports).",
  },
];

const VAULT_QUEUE_PATTERN = {
  regex: "(^|/)vault-queue\\.ts$",
  message:
    "A writer declares which Vault notes its change makes stale in STALE (src/core/kernel/vault-stale.ts); only the vault modules import vault-queue.ts (docs/architecture/vault-mirror.md, Queue).",
};

const WEB_FETCH = {
  name: "fetch",
  message:
    "The web app calls the server through web/src/calls.ts, which gives every read its deadline and makes every write name one (docs/architecture/web-app.md).",
};

export default defineConfig({
  plugins: [
    "eslint",
    "typescript",
    "unicorn",
    "oxc",
    "import",
    "promise",
    "node",
    "react",
    "react-perf",
    "jsx-a11y",
  ],
  categories: {
    correctness: "error",
    suspicious: "error",
    perf: "error",
    pedantic: "error",
  },
  jsPlugins: [
    { name: "anti-slop", specifier: "./tools/oxlint/anti-slop/index.ts" },
    { name: "threadsift", specifier: "./tools/oxlint/threadsift/index.ts" },
  ],
  rules: {
    "threadsift/no-comments": "error",
    "threadsift/layer-imports": "error",
    "threadsift/no-await-before-rethrow": [
      "error",
      { cannotThrow: CANNOT_THROW, finalizers: false },
    ],
    "react/react-in-jsx-scope": "off",
    "typescript/ban-ts-comment": [
      "error",
      {
        "ts-expect-error": "allow-with-description",
        "ts-ignore": true,
        "ts-nocheck": true,
        "ts-check": false,
        minimumDescriptionLength: 10,
      },
    ],
    "unicorn/no-abusive-eslint-disable": "error",
    "jsx-a11y/no-redundant-roles": ["error", { ol: ["list"], ul: ["list"] }],
    "unicorn/prefer-node-protocol": "error",
    "eslint/no-inline-comments": [
      "error",
      { ignorePattern: "^\\s*(?:@vite-ignore|[#@]__(?:PURE|NO_SIDE_EFFECTS)__)\\s*$" },
    ],

    "typescript/consistent-type-assertions": ["error", { assertionStyle: "never" }],
    "typescript/no-non-null-assertion": "error",
    "typescript/no-explicit-any": "error",
    "typescript/prefer-readonly-parameter-types": [
      "error",
      {
        ignoreInferredTypes: true,
        allow: [
          { from: "package", name: "Context", package: "hono" },
          { from: "package", name: "McpServer", package: "@modelcontextprotocol/server" },
          { from: "package", name: "OpenAPIHono", package: "@hono/zod-openapi" },
          { from: "lib", name: "Document" },
          {
            from: "file",
            name: ["Database", "Look", "InputKind", "Slots", "GrokCli"],
          },
          { from: "package", name: ["ZodError", "ZodObject", "ZodType"], package: "zod" },
          {
            from: "package",
            name: ["DatabaseSync", "IncomingMessage", "ErrnoException"],
            package: "@types/node",
          },
          {
            from: "lib",
            name: [
              "Request",
              "HTMLElement",
              "Element",
              "Node",
              "Text",
              "Range",
              "Selection",
              "DOMRect",
              "KeyboardEvent",
              "EventTarget",
              "AbortSignal",
              "URL",
              "ReadableStream",
              "Uint8Array",
              "DataView",
              "Response",
              "RequestInit",
              "AsyncIterable",
            ],
          },
          {
            from: "package",
            name: [
              "RefObject",
              "ChangeEvent",
              "SubmitEvent",
              "MouseEvent",
              "KeyboardEvent",
              "ReactNode",
              "SyntheticEvent",
            ],
            package: "@types/react",
          },
          {
            from: "package",
            name: ["SQL", "SQLWrapper", "SQLiteColumn", "SQLiteTable", "Subquery"],
            package: "drizzle-orm",
          },
        ],
      },
    ],
    "import/max-dependencies": ["error", { max: 10, ignoreTypeImports: true }],
    "typescript/no-import-type-side-effects": "error",
    "import/extensions": ["error", "always", { ignorePackages: true }],
    "import/no-unassigned-import": ["error", { allow: ["**/*.css", "**/zod-jitless.ts"] }],

    "anti-slop/no-array-filter-map": "error",
    "anti-slop/no-reduce-accumulator-copy": "error",
    "anti-slop/no-conditional-empty-object-spread": "error",
    "anti-slop/no-known-value-widening": "error",
    "anti-slop/no-module-mocking": "error",
    "anti-slop/no-object-parameters": "error",
    "anti-slop/no-reflect-apply": "error",
    "anti-slop/no-reflect-get": "error",
    "anti-slop/no-runtime-typeof": "error",
    "anti-slop/no-shape-in-symbol-names": "error",
    "anti-slop/no-unknown-parameters": "error",
    "anti-slop/no-unknown-returns": "error",
    "anti-slop/no-unknown-type-aliases": "error",
    "anti-slop/no-unsafe-dictionary-type": "error",
  },
  overrides: [
    { files: ["*.config.ts", "tools/**"], env: { node: true } },
    {
      files: ["test/**", "smoke/**"],
      rules: {
        "eslint/max-lines-per-function": "off",
        "typescript/no-floating-promises": "off",
        "typescript/prefer-readonly-parameter-types": "off",
      },
    },
    {
      files: ["src/**"],
      rules: {
        "threadsift/no-await-before-rethrow": [
          "error",
          { cannotThrow: CANNOT_THROW, finalizers: true },
        ],
      },
    },
    {
      files: ["web/src/**", "extension/entrypoints/**", "extension/lib/**"],
      rules: { "threadsift/no-server-value-import": ["error", { forbidden: SERVER_MODULES }] },
    },
    {
      files: ["tools/oxlint/threadsift/**"],
      rules: { "typescript/prefer-readonly-parameter-types": "off" },
    },
    {
      files: ["src/http/**"],
      rules: { "import/max-dependencies": ["error", { max: 14, ignoreTypeImports: true }] },
    },
    {
      files: ["src/http/routes.ts"],
      rules: { "import/max-dependencies": "off" },
    },
    {
      files: ["src/core/**", "src/http/**"],
      rules: {
        "threadsift/static-import-source": "error",
        "eslint/no-restricted-imports": [
          "error",
          { patterns: [...PORT_PATTERNS, VAULT_QUEUE_PATTERN] },
        ],
      },
    },
    {
      files: ["src/core/*/vault-*.ts"],
      rules: { "eslint/no-restricted-imports": ["error", { patterns: PORT_PATTERNS }] },
    },
    {
      files: ["src/core/**", "src/http/**", "web/**"],
      rules: { "eslint/no-restricted-globals": ["error", ...NODE_GLOBALS] },
    },
    {
      files: ["web/**"],
      excludeFiles: ["web/src/calls.ts"],
      rules: {
        "eslint/no-restricted-globals": ["error", ...NODE_GLOBALS, WEB_FETCH],
        "eslint/no-restricted-properties": [
          "error",
          ...["globalThis", "window", "self"].map((object) => ({
            object,
            property: WEB_FETCH.name,
            message: WEB_FETCH.message,
          })),
        ],
      },
    },
    {
      files: ["web/**"],
      rules: {
        "eslint/no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                regex: "^(node|cloudflare):",
                message: "web/ runs in the browser, so it imports no runtime module.",
              },
            ],
          },
        ],
      },
    },
  ],
  ignorePatterns: [
    "design/prototype/**",
    "tools/oxlint/anti-slop/**",
    ".claude/**",
    ".agents/skills/impeccable/**",
  ],
  options: {
    typeAware: true,
    typeCheck: true,
    denyWarnings: true,
    reportUnusedDisableDirectives: "error",
  },
});
