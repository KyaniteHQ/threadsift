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
  e2eCommand = target: ''
    jq --exit-status '(.args // []) | type == "array" and all(type == "string")' <<< "$DEVENV_TASK_INPUT" > /dev/null
    mapfile -d "" -t args < <(jq --join-output '(.args // [])[] | ., "\u0000"' <<< "$DEVENV_TASK_INPUT")
    exec tools/e2e/${target}.sh "''${args[@]}"
  '';
  port = name: toString config.processes.${name}.ports.http.value;
in
{
  languages.javascript = {
    enable = true;
    package = pkgs.nodejs_26;
  };

  env = {
    PLAYWRIGHT_BROWSERS_PATH = "${pkgs.playwright-driver.browsers}";
    PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
    THREADSIFT_PODMAN_POLICY = "${podmanPolicy}";
    THREADSIFT_E2E_IMAGE = "localhost/threadsift:e2e-${builtins.hashString "sha256" config.devenv.root}";
  };

  packages = [
    pkgs.corepack
    pkgs.jq
    pkgs.podman
    pkgs.playwright-driver.browsers
  ];

  processes = {
    server = {
      ports.http.allocate = 8080;
      exec = "PORT=${port "server"} DATA_DIR=.data node src/targets/node/index.ts";
    };
    web = {
      ports.http.allocate = 5173;
      exec = "THREADSIFT_API_URL=http://127.0.0.1:${port "server"} ./node_modules/.bin/vite --port ${port "web"} --strictPort";
    };
    worker = {
      ports.http.allocate = 8787;
      ports.inspector.allocate = 9229;
      exec = ''
        [ -d dist/web ] || ./node_modules/.bin/vite build
        ./node_modules/.bin/wrangler d1 migrations apply DB --local --persist-to .wrangler/state
        exec ./node_modules/.bin/wrangler dev --port ${port "worker"} --inspector-port ${toString config.processes.worker.ports.inspector.value} --persist-to .wrangler/state
      '';
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
    "ci:build" = {
      after = [ "ci:install" ];
      exec = "pnpm run build && pnpm run build:worker";
    };
    "ci:audit" = {
      after = [ "ci:install" ];
      exec = "pnpm audit --prod --audit-level high";
    };
    "image:build" = {
      exec = "exec tools/e2e/build-image.sh";
    };
    "e2e:container" = {
      after = [
        "ci:install"
        "image:build"
      ];
      exec = e2eCommand "container";
    };
    "e2e:worker" = {
      after = [
        "ci:install"
        "ci:build"
      ];
      exec = e2eCommand "worker";
    };
  };

  enterTest = "devenv tasks run ci:check";
}
