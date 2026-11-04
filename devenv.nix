{ pkgs, lib, ... }:

let
  corepack = pkgs.corepack.override { nodejs-slim = pkgs.nodejs-slim_26; };
  withNode = pkgs.writeShellScript "with-node" ''PATH=${
    lib.makeBinPath [
      pkgs.nodejs_26
      corepack
    ]
  }:$PATH exec "$@"'';
  bin = cmd: "${withNode} ./node_modules/.bin/${cmd}";
in
{
  languages.javascript = {
    enable = true;
    package = pkgs.nodejs_26;
  };

  packages = [
    corepack
    pkgs.jq
  ];

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
  };

  enterTest = "devenv tasks run ci:check";
}
