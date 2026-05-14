import dagre from "@dagrejs/dagre";
import type { BoardEdge, BoardNode } from "@chitra/core";

const NODE_W = 220;
const NODE_H = 120;

export type LayoutDirection = "LR" | "TB" | "RL" | "BT";

/**
 * Compute new positions for the given nodes using dagre. Pure: returns a new
 * array, doesn't mutate input.
 */
export function autoLayout(
  nodes: BoardNode[],
  edges: BoardEdge[],
  direction: LayoutDirection = "LR",
): BoardNode[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, nodesep: 60, ranksep: 100, marginx: 40, marginy: 40 });

  for (const n of nodes) {
    g.setNode(n.id, { width: n.width ?? NODE_W, height: n.height ?? NODE_H });
  }
  for (const e of edges) {
    g.setEdge(e.source, e.target);
  }

  dagre.layout(g);

  return nodes.map((n) => {
    const laid = g.node(n.id);
    if (!laid) return n;
    return {
      ...n,
      // Dagre returns node centers; React Flow expects top-left.
      position: {
        x: laid.x - (n.width ?? NODE_W) / 2,
        y: laid.y - (n.height ?? NODE_H) / 2,
      },
    };
  });
}
