{
  pkgs,
  lib,
  config,
  ...
}:

let
  withNode = pkgs.writeShellScript "with-node" ''PATH=${
    lib.makeBinPath [
      pkgs.nodejs_26
      pkgs.corepack
    ]
  }:$PATH exec "$@"'';
  bin = cmd: "${withNode} ./node_modules/.bin/${cmd}";
  podmanPolicy = pkgs.writeText "policy.json" (
    builtins.toJSON { default = [ { type = "insecureAcceptAnything"; } ]; }
  );
  image = "localhost/threadsift:smoke";
  layerCache = {
    address = "127.0.0.1:5000";
    config = (pkgs.formats.yaml { }).generate "registry.yml" {
      version = "0.1";
      log.accesslog.disabled = true;
      http.addr = layerCache.address;
      storage.filesystem = { };
    };
    repository = "${layerCache.address}/threadsift-layers";
    registries = (pkgs.formats.toml { }).generate "registries.conf" {
      registry = [
        {
          location = layerCache.address;
          insecure = true;
        }
      ];
    };
  };
  port = name: toString config.processes.${name}.ports.http.value;
  browsers = pkgs.playwright-driver.browsers.override {
    withFirefox = false;
    withWebkit = false;
  };
in
{
  languages.javascript = {
    enable = true;
    package = pkgs.nodejs_26;
  };

  env = {
    PLAYWRIGHT_BROWSERS_PATH = "${browsers}";
    PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
    THREADSIFT_IMAGE = image;
  };

  packages = [
    pkgs.corepack
    pkgs.jq
    pkgs.podman
    browsers
  ];

  scripts.worker-local = {
    description = "Apply the D1 migrations and start wrangler dev --local: worker-local <state dir> <port> [wrangler dev flags]";
    exec = ''
      set -e
      state=''${1:?usage: worker-local <state dir> <port> [wrangler dev flags]}
      port=''${2:?usage: worker-local <state dir> <port> [wrangler dev flags]}
      shift 2
      pnpm exec wrangler d1 migrations apply DB --local --persist-to "$state"
      exec pnpm exec wrangler dev --local --port "$port" --persist-to "$state" "$@"
    '';
  };

  processes = {
    server = {
      ports.http.allocate = 8080;
      exec = "PORT=${port "server"} DATA_DIR=.data node src/targets/node/index.ts";
    };
    web = {
      ports.http.allocate = 5173;
      exec = "THREADSIFT_API_URL=http://127.0.0.1:${port "server"} vite --port ${port "web"} --strictPort";
    };
    worker = {
      ports.http.allocate = 8787;
      ports.inspector.allocate = 9229;
      after = [ "web:build" ];
      exec = "worker-local .wrangler/state ${port "worker"} --inspector-port ${toString config.processes.worker.ports.inspector.value}";
    };
  };

  git-hooks.hooks = {
    oxlint-pre-commit = {
      enable = true;
      entry = bin "oxlint --fix --format=agent --no-error-on-unmatched-pattern";
      files = "\\.[cm]?[jt]sx?$";
      require_serial = true;
    };
    oxfmt-pre-commit = {
      enable = true;
      entry = bin "oxfmt --no-error-on-unmatched-pattern";
      types = [ "text" ];
    };
    check-pre-push = {
      enable = true;
      entry = "${withNode} pnpm run check";
      pass_filenames = false;
      always_run = true;
      stages = [ "pre-push" ];
    };
    test-pre-push = {
      enable = true;
      entry = "${withNode} pnpm test";
      pass_filenames = false;
      always_run = true;
      stages = [ "pre-push" ];
    };
  };

  tasks = {
    "ci:install" = {
      exec = "pnpm install --frozen-lockfile";
      before = [ "devenv:git-hooks:run" ];
    };
    "ci:check" = {
      after = [ "ci:install" ];
      exec = "pnpm run check";
    };
    "ci:test" = {
      after = [ "ci:install" ];
      exec = "pnpm test";
    };
    "extension:build" = {
      after = [ "ci:install" ];
      exec = "pnpm run build:extension";
    };
    "web:build" = {
      after = [ "ci:install" ];
      exec = "pnpm run build";
    };
    "ci:build" = {
      after = [
        "ci:install"
        "extension:build"
        "web:build"
      ];
      exec = "pnpm run build:worker && pnpm run lint:extension";
    };
    "ci:audit" = {
      after = [ "ci:install" ];
      exec = "pnpm audit --prod --audit-level high";
    };
    "design:check" = {
      showOutput = true;
      exec = ".claude/skills/impeccable/scripts/impeccable detect \${GITHUB_ACTIONS:+--github} web";
    };
    "ci:gate" = {
      after = [
        "ci:check"
        "ci:test"
        "ci:build"
        "ci:audit"
        "design:check"
      ];
    };
    "container:build" = {
      exec = ''
        set -euo pipefail
        cache=()
        if [ -n "''${THREADSIFT_LAYER_CACHE:-}" ]; then
          storage=''${THREADSIFT_LAYER_CACHE%/}
          mkdir -p "$storage"
          REGISTRY_STORAGE_FILESYSTEM_ROOTDIRECTORY="$storage" OTEL_TRACES_EXPORTER=none \
            ${lib.getExe pkgs.distribution} serve ${layerCache.config} > "$storage.log" 2>&1 &
          registry=$!
          trap 'kill "$registry" 2>/dev/null || true; wait "$registry" 2>/dev/null || true' EXIT
          ${lib.getExe pkgs.curl} --silent --fail --max-time 2 --retry 10 --retry-delay 1 --retry-all-errors \
            --output /dev/null http://${layerCache.address}/v2/ && kill -0 "$registry" \
            || { cat "$storage.log"; exit 1; }
          export CONTAINERS_REGISTRIES_CONF=${layerCache.registries}
          cache=(--cache-from ${layerCache.repository} --cache-to ${layerCache.repository})
        fi
        podman build --jobs 0 --signature-policy ${podmanPolicy} "''${cache[@]}" --tag ${image} --file Containerfile .
      '';
    };
    "smoke:worker" = {
      after = [ "web:build" ];
      exec = "THREADSIFT_TARGET=worker pnpm exec playwright test --project=smoke";
    };
    "smoke:container" = {
      after = [
        "ci:install"
        "container:build"
      ];
      exec = "THREADSIFT_TARGET=container pnpm exec playwright test --project=smoke";
    };
    "live:worker" = {
      after = [ "web:build" ];
      exec = "THREADSIFT_TARGET=worker pnpm exec playwright test --project=live";
    };
    "live:container" = {
      after = [
        "ci:install"
        "container:build"
      ];
      exec = "THREADSIFT_TARGET=container pnpm exec playwright test --project=live";
    };
  };
}
