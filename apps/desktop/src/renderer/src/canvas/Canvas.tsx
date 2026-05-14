import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useMode } from "../state/mode.js";
import { CardNode, type CardNodeData } from "./CardNode.js";
import { EDGE_KINDS, EDGE_STYLES } from "./edgeStyles.js";
import { autoLayout, type LayoutDirection } from "./autoLayout.js";
import { StudioBackground } from "./StudioBackground.js";
import { SketchOverlay } from "./SketchOverlay.js";
import { CARD_DRAG_MIME, clearDraggedCardId, getDraggedCardId } from "../dragState.js";

const nodeTypes: NodeTypes = { card: CardNode };

export function Canvas({
  onOpenCard,
  registerAddAtCenter,
}: {
  onOpenCard?: (cardId: string) => void;
  registerAddAtCenter?: (fn: ((cardId: string) => void) | null) => void;
} = {}): JSX.Element {
  return (
    <ReactFlowProvider>
      <CanvasInner onOpenCard={onOpenCard} registerAddAtCenter={registerAddAtCenter} />
    </ReactFlowProvider>
  );
}

function CanvasInner({
  onOpenCard,
  registerAddAtCenter,
}: {
  onOpenCard?: (cardId: string) => void;
  registerAddAtCenter?: (fn: ((cardId: string) => void) | null) => void;
}): JSX.Element {
  const board = useCurrentBoard();
  const cardMap = useCardMap();
  const cards = useProjectStore((s) => s.project?.cards ?? []);
  const themeMode = useTheme((s) => s.mode);
  const workspaceMode = useMode((s) => s.mode);
  const updateNodes = useProjectStore((s) => s.updateNodes);
  const updateEdges = useProjectStore((s) => s.updateEdges);
  const addEdge = useProjectStore((s) => s.addEdge);
  const addNodeFromCard = useProjectStore((s) => s.addNodeFromCard);
  const addCard = useProjectStore((s) => s.addCard);
  const removeNode = useProjectStore((s) => s.removeNode);
  const removeEdge = useProjectStore((s) => s.removeEdge);
  const pushHistory = useProjectStore((s) => s.pushHistory);

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);
  const [edgeKind, setEdgeKind] = useState<EdgeKind>("flows-to");
  const [isDragOver, setIsDragOver] = useState(false);

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
    // Always allow drop while a drag is in progress; we validate on drop.
    // Some Electron/Chrome combos hide custom-MIME entries in `types` during
    // dragover, which would prevent preventDefault from firing and break drop.
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (!isDragOver) setIsDragOver(true);
  }, [isDragOver]);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    // dragleave fires for every child crossing; check we've actually left
    // the wrapper using relatedTarget instead of currentTarget===target.
    const wrapper = wrapperRef.current;
    const next = e.relatedTarget as globalThis.Node | null;
    if (wrapper && next && wrapper.contains(next)) return;
    setIsDragOver(false);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      // Try our custom MIME first, then text/plain as fallback.
      const cardId =
        e.dataTransfer.getData(CARD_DRAG_MIME) ||
        e.dataTransfer.getData("text/x-chitra-card") ||
        getDraggedCardId();
      if (!cardId) return;
      const position = rfInstance
        ? rfInstance.screenToFlowPosition({ x: e.clientX, y: e.clientY })
        : { x: 0, y: 0 };
      addNodeFromCard(cardId, position);
      clearDraggedCardId(cardId);
      window.requestAnimationFrame(() => rfInstance?.fitView({ duration: 260, padding: 0.25 }));
    },
    [rfInstance, addNodeFromCard],
  );

  /* -------- "Add to canvas" fallback (button on inbox cards) -------- */

  const addAtCenter = useCallback(
    (cardId: string) => {
      let position = { x: 0, y: 0 };
      if (rfInstance && wrapperRef.current) {
        const rect = wrapperRef.current.getBoundingClientRect();
        const center = rfInstance.screenToFlowPosition({
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        });
        position = {
          x: center.x + (Math.random() - 0.5) * 80,
          y: center.y + (Math.random() - 0.5) * 80,
        };
      }
      addNodeFromCard(cardId, position);
      window.requestAnimationFrame(() => rfInstance?.fitView({ duration: 260, padding: 0.25 }));
    },
    [rfInstance, addNodeFromCard],
  );

  /* -------- Quick-create card on the canvas (double-click empty pane) -------- */

  const onPaneDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (workspaceMode !== "structure") return;
      const position = rfInstance
        ? rfInstance.screenToFlowPosition({ x: e.clientX, y: e.clientY })
        : { x: 0, y: 0 };
      const card = addCard({
        title: "Untitled",
        type: "note",
        body: {
          type: "doc",
          content: [{ type: "paragraph", content: [] }],
        },
      });
      addNodeFromCard(card.id, position);
      onOpenCard?.(card.id);
    },
    [workspaceMode, rfInstance, addCard, addNodeFromCard, onOpenCard],
  );

  const loadMissingCardsToBoard = useCallback(() => {
    if (!board || cards.length === 0) return;
    const existingCardIds = new Set(board.nodes.map((node) => node.cardId));
    const missing = cards.filter((card) => !existingCardIds.has(card.id));
    if (missing.length === 0) return;

    const base = rfInstance && wrapperRef.current
      ? (() => {
          const rect = wrapperRef.current.getBoundingClientRect();
          return rfInstance.screenToFlowPosition({
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
          });
        })()
      : { x: 0, y: 0 };

    missing.forEach((card, index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      addNodeFromCard(card.id, {
        x: base.x + (col - 1) * 300,
        y: base.y + row * 170,
      });
    });
    window.requestAnimationFrame(() => rfInstance?.fitView({ duration: 360, padding: 0.22 }));
  }, [board, cards, rfInstance, addNodeFromCard]);

  // Publish addAtCenter to the parent so the inbox "+ Canvas" button works.
  useEffect(() => {
    registerAddAtCenter?.(addAtCenter);
    return () => registerAddAtCenter?.(null);
  }, [addAtCenter, registerAddAtCenter]);

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
      onDragOverCapture={onDragOver}
      onDropCapture={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDoubleClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest(".react-flow__node, .react-flow__edge, .react-flow__controls, .react-flow__minimap")) return;
        if (target.closest(".react-flow")) onPaneDoubleClick(e);
      }}
    >
      <StudioBackground enabled={themeMode === "studio"} />
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onInit={setRfInstance}
        onNodeDragStart={() => pushHistory()}
        onNodeDoubleClick={(_e, node) => {
          const cardId = (node.data as CardNodeData | undefined)?.card.id;
          if (cardId && onOpenCard) onOpenCard(cardId);
        }}
        proOptions={{ hideAttribution: true }}
        snapToGrid
        snapGrid={[16, 16]}
        zoomOnDoubleClick={false}
        defaultEdgeOptions={{ type: "smoothstep" }}
        minZoom={0.2}
        maxZoom={2}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        nodesDraggable={workspaceMode === "structure"}
        nodesConnectable={workspaceMode === "structure"}
        elementsSelectable={workspaceMode === "structure"}
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

      {/* Sketch overlay sits above React Flow; pointer-events gated by mode. */}
      <SketchOverlay />

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
            <div className="mb-4 flex items-center justify-center gap-3 text-3xl opacity-30">
              <span>◇</span>
              <span className="animate-pulse">←</span>
              <span className="rounded-md border border-dashed border-white/20 px-2 py-1 text-sm uppercase tracking-widest">
                Inbox
              </span>
            </div>
            <p className="max-w-sm text-sm text-[var(--color-ink-dim)]">
              Drag a card from the inbox onto this canvas, or
              <span className="mx-1 rounded bg-white/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wider">
                double&#8209;click
              </span>
              the empty area to spawn a new card here. Hover a card and click
              <span className="mx-1 rounded bg-white/5 px-1 py-0.5 text-[10px]">+ Canvas</span>
              for a one-click add. Then drag between the dots on a card&rsquo;s edges to connect them.
            </p>
            {cards.length > 0 && (
              <button
                type="button"
                onClick={loadMissingCardsToBoard}
                className="pointer-events-auto mt-4 rounded-full border border-[var(--color-accent-2)]/50 bg-[var(--color-accent-2)]/10 px-4 py-1.5 text-xs font-semibold text-[var(--color-accent-2)] transition hover:bg-[var(--color-accent-2)]/15"
              >
                Load {cards.length} card{cards.length === 1 ? "" : "s"} to studio
              </button>
            )}
          </div>
        </div>
      )}

      {/* Drop indicator while dragging from the inbox */}
      {isDragOver && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <div
            className="absolute inset-3 rounded-2xl border-2 border-dashed"
            style={{ borderColor: "var(--color-accent-2)" }}
          />
          <div
            className="rounded-full border px-4 py-1.5 text-xs font-semibold uppercase tracking-widest backdrop-blur"
            style={{
              borderColor: "var(--color-accent-2)",
              background: "rgba(33, 212, 253, 0.08)",
              color: "var(--color-accent-2)",
            }}
          >
            Drop to add to board
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
