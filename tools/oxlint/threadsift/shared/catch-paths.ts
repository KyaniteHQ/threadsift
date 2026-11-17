import type { ESTree } from "@oxlint/plugins";

type Node = ESTree.Node;

const FUNCTIONS = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"]);

const LOOPS = new Set([
  "ForStatement",
  "ForInStatement",
  "ForOfStatement",
  "WhileStatement",
  "DoWhileStatement",
]);

const EXITS = new Set(["ReturnStatement", "BreakStatement", "ContinueStatement", "ThrowStatement"]);

export interface AroundCatch {
  readonly clause: ESTree.CatchClause;
  readonly guarded: boolean;
}

export function catchesAround(start: Node): AroundCatch[] {
  const found: AroundCatch[] = [];
  let guarded = false;
  let child = start;

  for (let parent = start.parent; parent !== null; parent = parent.parent) {
    if (FUNCTIONS.has(parent.type)) break;

    if (parent.type === "CatchClause") found.push({ clause: parent, guarded });

    if (parent.type === "TryStatement" && parent.handler !== null && parent.block === child)
      guarded = true;

    child = parent;
  }

  return found;
}

export function finalizerAround(start: Node): boolean {
  let guarded = false;
  let child = start;

  for (let parent = start.parent; parent !== null; parent = parent.parent) {
    if (FUNCTIONS.has(parent.type)) return false;

    if (parent.type === "TryStatement") {
      if (parent.finalizer === child && !guarded) return true;

      if (parent.handler !== null && parent.block === child) guarded = true;
    }

    child = parent;
  }

  return false;
}

function chainUp(start: Node, top: Node): Node[] {
  const chain: Node[] = [];

  for (let node: Node | null = start; node !== null; node = node.parent) {
    chain.push(node);

    if (node === top) break;
  }

  return chain;
}

function statementsOf(owner: Node): readonly Node[] | undefined {
  if (owner.type === "BlockStatement") return owner.body;

  return owner.type === "SwitchCase" ? owner.consequent : undefined;
}

function exitsAmong(list: readonly Node[], from: number, to: number): boolean {
  return list.slice(from, to).some((statement) => EXITS.has(statement.type));
}

function runsToEnd(start: Node, below: Node): boolean {
  let child = start;

  for (let parent = start.parent; parent !== null && child !== below; parent = parent.parent) {
    const list = statementsOf(parent);

    if (list !== undefined && exitsAmong(list, list.indexOf(child) + 1, list.length)) return false;

    child = parent;
  }

  return true;
}

function insideLoop(start: Node, clause: Node): boolean {
  return chainUp(start, clause).some((node) => LOOPS.has(node.type));
}

function rankInTry(owner: ESTree.TryStatement, part: Node): number {
  if (part === owner.block) return 0;

  return part === owner.handler ? 1 : 2;
}

function followsInList(
  list: readonly Node[],
  awaited: Node,
  clause: Node,
  owner: Node,
  parts: readonly [Node, Node],
): boolean {
  const [fromPart, toPart] = parts;
  const from = list.indexOf(fromPart);
  const to = list.indexOf(toPart);

  if (!runsToEnd(awaited, fromPart)) return false;

  if (from < to) return !exitsAmong(list, from + 1, to);

  return insideLoop(owner, clause) && !exitsAmong(list, from + 1, list.length);
}

export function canThrowAfter(awaited: Node, thrown: Node, clause: ESTree.CatchClause): boolean {
  const above = new Set(chainUp(awaited, clause));
  const thrownChain = chainUp(thrown, clause);
  const common = thrownChain.find((node) => above.has(node));

  if (common === undefined) return false;

  if (common === awaited) return true;

  const fromPart = chainUp(awaited, common).at(-2);
  const toPart = thrownChain.at(thrownChain.indexOf(common) - 1);

  if (fromPart === undefined || toPart === undefined) return false;

  const list = statementsOf(common);

  if (list !== undefined) return followsInList(list, awaited, clause, common, [fromPart, toPart]);

  if (common.type === "IfStatement") return fromPart === common.test;

  if (common.type === "TryStatement")
    return rankInTry(common, fromPart) < rankInTry(common, toPart);

  if (LOOPS.has(common.type)) return true;

  return awaited.range[0] < thrown.range[0] && runsToEnd(awaited, common);
}
