import { useCallback, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeTypes,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type { BoardEdge, BoardNode, EdgeKind } from "@chitra/core";
import { useCardMap, useCurrentBoard, useProjectStore } from "../state/projectStore.js";
import { useTheme } from "../state/theme.js";
import { CardNode, type CardNodeData } from "./CardNode.js";
import { EDGE_KINDS, EDGE_STYLES } from "./edgeStyles.js";
import { autoLayout, type LayoutDirection } from "./autoLayout.js";
import { StudioBackground } from "./StudioBackground.js";

const nodeTypes: NodeTypes = { card: CardNode };

const DRAG_MIME = "application/x-chitra-card";

export function Canvas(): JSX.Element {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}

function CanvasInner(): JSX.Element {
  const board = useCurrentBoard();
  const cardMap = useCardMap();
  const themeMode = useTheme((s) => s.mode);
  const updateNodes = useProjectStore((s) => s.updateNodes);
  const updateEdges = useProjectStore((s) => s.updateEdges);
  const addEdge = useProjectStore((s) => s.addEdge);
  const addNodeFromCard = useProjectStore((s) => s.addNodeFromCard);
  const removeNode = useProjectStore((s) => s.removeNode);
  const removeEdge = useProjectStore((s) => s.removeEdge);

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);
  const [edgeKind, setEdgeKind] = useState<EdgeKind>("flows-to");

  /* -------- map domain → React Flow shapes -------- */
  const rfNodes: Node[] = useMemo(() => {
    if (!board) return [];
    return board.nodes.flatMap<Node>((n) => {
      const card = cardMap.get(n.cardId);
      if (!card) return [];
      return [{
        id: n.id,
        type: "card",
        position: n.position,
        data: { card } satisfies CardNodeData,
      }];
    });
  }, [board, cardMap]);

  const rfEdges: Edge[] = useMemo(() => {
    if (!board) return [];
    return board.edges.map<Edge>((e) => {
      const style = EDGE_STYLES[e.kind];
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        animated: style.animated,
        label: style.label,
        labelStyle: { fill: style.stroke, fontSize: 10, fontWeight: 600 },
        labelBgStyle: { fill: "#0b0b10", fillOpacity: 0.8 },
        style: {
          stroke: style.stroke,
          strokeWidth: 1.5,
          strokeDasharray: style.dasharray,
        },
      };
    });
  }, [board]);

  /* -------- React Flow → domain handlers -------- */

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // Apply to RF shape, then write back the *positions* into our domain.
      const next = applyNodeChanges(changes, rfNodes);
      updateNodes((domain) =>
        domain.map((d) => {
          const updated = next.find((n) => n.id === d.id);
          if (!updated) return d;
          return { ...d, position: updated.position } satisfies BoardNode;
        }),
      );
      // Handle deletions (RF emits "remove" change).
      for (const change of changes) {
        if (change.type === "remove") removeNode(change.id);
      }
    },
    [rfNodes, updateNodes, removeNode],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const next = applyEdgeChanges(changes, rfEdges);
      updateEdges((domain) =>
        domain.filter((e) => next.find((rfe) => rfe.id === e.id)) satisfies BoardEdge[],
      );
      for (const change of changes) {
        if (change.type === "remove") removeEdge(change.id);
      }
    },
    [rfEdges, updateEdges, removeEdge],
  );

  const onConnect = useCallback(
    (conn: Connection) => {
      if (!conn.source || !conn.target) return;
      addEdge({ source: conn.source, target: conn.target, kind: edgeKind });
    },
    [addEdge, edgeKind],
  );

  /* -------- Drag from inbox -------- */

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (Array.from(e.dataTransfer.types).includes(DRAG_MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      const cardId = e.dataTransfer.getData(DRAG_MIME);
      if (!cardId || !rfInstance) return;
      e.preventDefault();
      const position = rfInstance.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      addNodeFromCard(cardId, position);
    },
    [rfInstance, addNodeFromCard],
  );

  /* -------- Auto-layout -------- */

  const runAutoLayout = useCallback(
    (dir: LayoutDirection) => {
      if (!board) return;
      const laid = autoLayout(board.nodes, board.edges, dir);
      updateNodes(() => laid);
      window.requestAnimationFrame(() => {
        rfInstance?.fitView({ duration: 400, padding: 0.2 });
      });
    },
    [board, rfInstance, updateNodes],
  );

  if (!board) return <div />;

  return (
    <div
      ref={wrapperRef}
      className="relative h-full w-full overflow-hidden bg-[#0b0b10]"
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <StudioBackground enabled={themeMode === "studio"} />
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onInit={setRfInstance}
        proOptions={{ hideAttribution: true }}
        snapToGrid
        snapGrid={[16, 16]}
        defaultEdgeOptions={{ type: "smoothstep" }}
        minZoom={0.2}
        maxZoom={2}
        fitView
        fitViewOptions={{ padding: 0.25 }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={22}
          size={1.2}
          color="rgba(255,255,255,0.07)"
        />
        <MiniMap
          pannable
          zoomable
          ariaLabel="Mini map"
          maskColor="rgba(11,11,16,0.7)"
          style={{ background: "#0d0d14", border: "1px solid rgba(255,255,255,0.06)" }}
          nodeColor={() => "#7c5cff"}
        />
        <Controls
          showInteractive={false}
          style={{ border: "1px solid rgba(255,255,255,0.06)", background: "#0d0d14" }}
        />
      </ReactFlow>

      {/* Floating control strip */}
      <div className="pointer-events-none absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-2">
        <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-white/10 bg-[#0d0d14]/90 px-2 py-1 text-xs backdrop-blur-md">
          <span className="px-1 text-[10px] uppercase tracking-widest text-[var(--color-ink-dim)]">
            Edge
          </span>
          {EDGE_KINDS.map((k) => {
            const s = EDGE_STYLES[k];
            const active = edgeKind === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setEdgeKind(k)}
                className={[
                  "rounded-full px-2 py-1 transition",
                  active
                    ? "bg-white/10 text-[var(--color-ink)]"
                    : "text-[var(--color-ink-dim)] hover:text-[var(--color-ink)]",
                ].join(" ")}
                title={s.label}
              >
                <span
                  className="mr-1 inline-block h-1.5 w-3.5 align-middle"
                  style={{
                    background: s.stroke,
                    borderRadius: 1,
                    opacity: active ? 1 : 0.7,
                  }}
                />
                {s.label}
              </button>
            );
          })}
        </div>

        <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-white/10 bg-[#0d0d14]/90 px-2 py-1 text-xs backdrop-blur-md">
          <span className="px-1 text-[10px] uppercase tracking-widest text-[var(--color-ink-dim)]">
            Layout
          </span>
          <LayoutBtn label="→" title="Left to right" onClick={() => runAutoLayout("LR")} />
          <LayoutBtn label="↓" title="Top to bottom" onClick={() => runAutoLayout("TB")} />
          <LayoutBtn label="←" title="Right to left" onClick={() => runAutoLayout("RL")} />
          <LayoutBtn label="↑" title="Bottom to top" onClick={() => runAutoLayout("BT")} />
        </div>
      </div>

      {board.nodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="mb-3 text-5xl opacity-30">◇ ◆ ◇</div>
            <p className="max-w-sm text-sm text-[var(--color-ink-dim)]">
              Drag a card from the inbox onto the canvas, then drag between the dots on
              the edges of cards to connect them.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function LayoutBtn({
  label,
  title,
  onClick,
}: {
  label: string;
  title: string;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="rounded-full px-2 py-1 font-mono text-[var(--color-ink-dim)] transition hover:bg-white/10 hover:text-[var(--color-ink)]"
    >
      {label}
    </button>
  );
}

export const CARD_DRAG_MIME = DRAG_MIME;
