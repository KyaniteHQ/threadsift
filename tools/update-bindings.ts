import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";

import {
  applyEdits,
  findNodeAtLocation,
  getNodePath,
  getNodeValue,
  modify,
  parseTree,
  visit,
  type Edit,
  type ParseError,
} from "jsonc-parser";

const kinds = {
  d1_databases: ["database_id", "database_name", "preview_database_id", "jurisdiction"],
  r2_buckets: ["bucket_name", "preview_bucket_name", "jurisdiction"],
  kv_namespaces: ["id", "preview_id"],
  "queues.producers": ["queue"],
  "queues.consumers": ["queue", "dead_letter_queue"],
  vectorize: ["index_name"],
  secrets_store_secrets: ["store_id", "secret_name"],
  hyperdrive: ["id"],
  "durable_objects.bindings": ["script_name", "environment"],
  services: ["service"],
  analytics_engine_datasets: ["dataset"],
  workflows: ["name", "script_name", "jurisdiction"],
  pipelines: ["stream", "pipeline"],
  ai_search: ["instance_name"],
  ai_search_namespaces: ["namespace"],
  agent_memory: ["namespace"],
  mtls_certificates: ["certificate_id"],
  dispatch_namespaces: ["namespace"],
  flagship: ["app_id"],
  artifacts: ["namespace"],
  k2: ["stream"],
  ratelimits: ["namespace_id"],
  vpc_services: ["service_id"],
  vpc_networks: ["network_id", "tunnel_id"],
  "logfwdr.bindings": ["destination"],
  send_email: ["destination_address"],
  assets: [],
  ai: [],
  analytics: [],
  browser: [],
  images: [],
  media: [],
  stream: [],
  version_metadata: [],
  worker_loaders: [],
  unsafe_hello_world: [],
} as const;

const provisioned = new Set([
  "dispatch_namespaces",
  "flagship",
  "ai_search_namespaces",
  "agent_memory",
  "d1_databases",
  "r2_buckets",
  "kv_namespaces",
  "queues.producers",
  "queues.consumers",
]);
const named = new Set(["durable_objects.bindings", "logfwdr.bindings", "ratelimits", "send_email"]);
const fileBindings = ["data_blobs", "text_blobs", "wasm_modules"];
const configKeys = new Set([
  ...fileBindings,
  ...Object.keys(kinds).map((kind) => kind.split(".")[0]),
  "$schema",
  "access",
  "account_id",
  "addresses",
  "alias",
  "base_dir",
  "build",
  "cache",
  "cloudchamber",
  "compatibility_date",
  "compatibility_flags",
  "compliance_region",
  "connect",
  "containers",
  "define",
  "dependencies_instrumentation",
  "dev",
  "env",
  "exports",
  "find_additional_modules",
  "first_party_worker",
  "jsx_factory",
  "jsx_fragment",
  "keep_names",
  "keep_vars",
  "limits",
  "logpush",
  "main",
  "migrations",
  "minify",
  "name",
  "no_bundle",
  "observability",
  "pages_build_output_dir",
  "placement",
  "preserve_file_names",
  "preview_urls",
  "previews",
  "python_modules",
  "route",
  "routes",
  "rules",
  "secrets",
  "send_metrics",
  "site",
  "streaming_tail_consumers",
  "tail_consumers",
  "triggers",
  "tsconfig",
  "unsafe",
  "upload_source_maps",
  "vars",
  "workers_dev",
]);

function readConfig(filename: string) {
  const text = readFileSync(filename, "utf8");
  const errors: ParseError[] = [];
  const tree = parseTree(text, errors, { allowTrailingComma: true });
  if (errors.length > 0 || tree?.type !== "object")
    throw new Error(`Invalid Wrangler configuration in ${filename}`);
  const keys: Set<string>[] = [];
  visit(
    text,
    {
      onObjectBegin() {
        keys.push(new Set());
      },
      onObjectProperty(key) {
        const scope = keys.at(-1);
        if (scope?.has(key) === true) throw new Error(`Duplicate key ${key} in ${filename}`);
        scope?.add(key);
      },
      onObjectEnd() {
        keys.pop();
      },
    },
    { allowTrailingComma: true },
  );

  const root = tree;
  function at(path: readonly (string | number)[]) {
    return findNodeAtLocation(root, [...path]);
  }
  function stringAt(path: readonly (string | number)[]) {
    const node = at(path);
    if (node !== undefined && node.type !== "string")
      throw new Error(`Expected a string at ${path.join(".")}`);
    return node === undefined ? undefined : String(node.value);
  }
  function properties(path: readonly (string | number)[]) {
    return (at(path)?.children ?? []).map((prop) => String(prop.children?.[0]?.value));
  }
  return { text, at, stringAt, properties };
}

function* scopeBindings(config: Readonly<ReturnType<typeof readConfig>>, scope: readonly string[]) {
  const { at, stringAt, properties } = config;
  for (const key of properties(scope)) {
    if (!configKeys.has(key)) throw new Error(`Unsupported Wrangler configuration key: ${key}`);
  }
  if ((at([...scope, "unsafe", "bindings"])?.children?.length ?? 0) > 0)
    throw new Error("Unsupported Wrangler binding kind: unsafe.bindings");
  for (const group of ["queues", "durable_objects", "logfwdr"]) {
    for (const key of properties([...scope, group])) {
      if (!Object.hasOwn(kinds, `${group}.${key}`))
        throw new Error(`Unsupported Wrangler binding kind: ${group}.${key}`);
    }
  }
  const producers = new Map<string, string>();
  for (const [kind, fields] of Object.entries(kinds)) {
    const container = at([...scope, ...kind.split(".")]);
    if (container === undefined) continue;
    for (const node of container.type === "array" ? (container.children ?? []) : [container]) {
      const path = getNodePath(node);
      const consumer = kind === "queues.consumers";
      const nameKey = consumer ? "queue" : named.has(kind) ? "name" : "binding";
      const name = stringAt([...path, nameKey]);
      if (name === undefined) {
        if (kind === "assets") continue;
        throw new Error(`Missing ${nameKey} in ${kind}`);
      }
      if (kind === "queues.producers") {
        const queue = stringAt([...path, "queue"]);
        if (queue !== undefined) producers.set(queue, name);
      }
      const identity = consumer ? (producers.get(name) ?? name) : name;
      yield [
        JSON.stringify([...scope, kind, identity]),
        {
          path,
          fields,
          label: [...scope, identity].join("."),
          kind,
        },
      ] as const;
    }
  }
}
function* bindings(config: Readonly<ReturnType<typeof readConfig>>) {
  const scopes = [[], ...config.properties(["env"]).map((env) => ["env", env])];
  for (const scope of scopes) {
    yield* scopeBindings(config, scope);
    for (const kind of fileBindings) {
      for (const name of config.properties([...scope, kind])) {
        const path = [...scope, kind, name];
        yield [
          JSON.stringify(path),
          { path, fields: [], label: [...scope, name].join("."), kind },
        ] as const;
      }
    }
  }
}
const [copyPath, releasePath, bodyPath] = process.argv.slice(2);
if (
  copyPath === undefined ||
  releasePath === undefined ||
  bodyPath === undefined ||
  process.argv.length !== 5
)
  throw new Error("Expected copy config, release config and pull request body paths");
const copy = readConfig(copyPath);
const release = readConfig(releasePath);
const edits: Edit[] = [];
const added = new Set<string>();
const configure = new Set<string>();

const local = new Map(bindings(copy));
for (const [key, binding] of bindings(release)) {
  const match = local.get(key);
  if (match === undefined) {
    (provisioned.has(binding.kind) ? added : configure).add(binding.label);
    continue;
  }
  const original = copy.at(match.path);
  const target = release.at(binding.path);
  if (original === undefined || target === undefined)
    throw new Error(`Missing binding node: ${binding.label}`);
  const fragment = release.text.slice(target.offset, target.offset + target.length);
  let content = fragment;
  for (const field of binding.fields) {
    const value = copy.stringAt([...match.path, field]);
    if (value !== release.stringAt([...binding.path, field]))
      content = applyEdits(content, modify(content, [field], value, {}));
  }
  if (content === fragment) continue;
  const updated = parseTree(content, [], { allowTrailingComma: true });
  if (updated === undefined) throw new Error(`Invalid updated binding: ${binding.label}`);
  if (isDeepStrictEqual(getNodeValue(original), getNodeValue(updated)))
    content = copy.text.slice(original.offset, original.offset + original.length);
  edits.push({ offset: target.offset, length: target.length, content });
}
let text = applyEdits(release.text, edits);
const name = copy.stringAt(["name"]);
if (name !== undefined && name !== release.stringAt(["name"]))
  text = applyEdits(text, modify(text, ["name"], name, {}));
writeFileSync(releasePath, text);
for (const [heading, names] of [
  ["Provision these new bindings before merging", added],
  ["Review these new bindings before merging", configure],
] as const) {
  if (names.size > 0)
    appendFileSync(
      bodyPath,
      `\n${heading}:\n\n` + [...names].map((label) => `- \`${label}\`\n`).join(""),
    );
}
