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
import { toast } from "sonner";

import type { BoardEdge, BoardNode, EdgeKind } from "@chitra/core";
import { useCardMap, useCurrentBoard, useProjectStore } from "../state/projectStore.js";
import { useTheme } from "../state/theme.js";
import { useMode } from "../state/mode.js";
import { CardNode, type CardNodeData } from "./CardNode.js";
import { EDGE_KINDS, EDGE_STYLES, resolveEdgeStyle, shapeToRfType } from "./edgeStyles.js";
import { EdgeStylePanel } from "./EdgeStylePanel.js";
import { autoLayout, type LayoutDirection } from "./autoLayout.js";
import { StudioBackground } from "./StudioBackground.js";
import { SketchOverlay } from "./SketchOverlay.js";
import { CARD_DRAG_MIME, clearDraggedCardId, getDraggedCardId } from "../dragState.js";
import { quickExportDiagramPng } from "../exports/runExport.js";

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
  const project = useProjectStore((s) => s.project);
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
  const [edgeKind, setEdgeKind] = useState<EdgeKind>("straight");
  const [isDragOver, setIsDragOver] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  // Drop the edge selection if the underlying edge disappears (deleted,
  // board changed, etc.) so the editor panel doesn't linger.
  useEffect(() => {
    if (!selectedEdgeId) return;
    if (!board?.edges.some((e) => e.id === selectedEdgeId)) {
      setSelectedEdgeId(null);
    }
  }, [board, selectedEdgeId]);

  const handleExportDiagramPng = useCallback(async () => {
    if (!project) return;
    setExportBusy(true);
    const t = toast.loading("Exporting diagram\u2026");
    try {
      const path = await quickExportDiagramPng(project, board?.name);
      toast.success(path ? `Diagram saved \u2192 ${path}` : "Diagram exported", { id: t });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Export failed: ${msg}`, { id: t });
    } finally {
      setExportBusy(false);
    }
  }, [project, board?.name]);

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
    // Index nodes by id so we can look up positions cheaply when picking
    // optimal handles for legacy edges that didn't persist a handle id.
    const nodeById = new Map(board.nodes.map((n) => [n.id, n] as const));
    return board.edges.map<Edge>((e) => {
      const resolved = resolveEdgeStyle(e.kind, e.style);
      const isStraight = resolved.shape === "straight";
      const labelText = e.label ?? (isStraight ? undefined : EDGE_STYLES[e.kind].label);
      const isSelected = e.id === selectedEdgeId;
      // Pick the closest pair of opposing handles so a connector between two
      // adjacent nodes leaves the side that *faces* the other node — no more
      // top-to-top routing that detours around unrelated cards.
      const auto = autoHandlePair(nodeById.get(e.source), nodeById.get(e.target));
      const sourceHandle = e.sourceHandle ?? auto.source;
      const targetHandle = e.targetHandle ?? auto.target;
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle,
        targetHandle,
        type: shapeToRfType(resolved.shape),
        animated: resolved.animated,
        // Bigger hit area so 1-2px lines are easy to click. Without this
        // users could only click the visible stroke and miss most attempts,
        // making the customization panel feel "broken".
        interactionWidth: 28,
        selected: isSelected,
        ...(labelText
          ? {
              label: labelText,
              labelStyle: { fill: resolved.stroke, fontSize: 10, fontWeight: 600 },
              labelBgStyle: { fill: "#0b0b10", fillOpacity: 0.85 },
            }
          : {}),
        style: {
          stroke: resolved.stroke,
          strokeWidth: isSelected
            ? Math.max(resolved.strokeWidth + 1.25, 2.5)
            : resolved.strokeWidth,
          strokeDasharray: resolved.dasharray,
          filter: isSelected
            ? `drop-shadow(0 0 6px ${resolved.stroke})`
            : undefined,
        },
      };
    });
  }, [board, selectedEdgeId]);

  /* -------- React Flow → domain handlers -------- */

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // xyflow fires `NodeChange`s for many reasons — dimensions (after
      // ResizeObserver measures the node), selection, focus, removal, AND
      // position drags. We must only persist *position* changes to the
      // domain store; otherwise every measurement event would push a new
      // `project` snapshot, cause `rfNodes` to be re-derived as a brand
      // new array of fresh node objects, force xyflow to re-measure, fire
      // another "dimensions" change, and lock the node into a permanent
      // `visibility: hidden` measurement loop (cards never appear on the
      // board).
      const positionChanges = changes.filter(
        (c) => c.type === "position" && c.position,
      );
      if (positionChanges.length > 0) {
        const next = applyNodeChanges(positionChanges, rfNodes);
        updateNodes((domain) =>
          domain.map((d) => {
            const updated = next.find((n) => n.id === d.id);
            if (!updated) return d;
            return { ...d, position: updated.position } satisfies BoardNode;
          }),
        );
      }
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
      addEdge({
        source: conn.source,
        target: conn.target,
        kind: edgeKind,
        sourceHandle: conn.sourceHandle ?? null,
        targetHandle: conn.targetHandle ?? null,
      });
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
        onEdgeClick={(_e, edge) => setSelectedEdgeId(edge.id)}
        onPaneClick={() => setSelectedEdgeId(null)}
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
          position="bottom-right"
          ariaLabel="Mini map"
          maskColor="rgba(11,11,16,0.7)"
          style={{
            background: "#0d0d14",
            border: "1px solid rgba(255,255,255,0.06)",
            height: 96,
            width: 160,
            margin: 12,
          }}
          nodeColor={() => "#7c5cff"}
        />
        <Controls
          showInteractive={false}
          position="bottom-left"
          style={{
            border: "1px solid rgba(255,255,255,0.06)",
            background: "#0d0d14",
            margin: 12,
          }}
        />
      </ReactFlow>

      {/* Sketch overlay sits above React Flow; pointer-events gated by mode. */}
      <SketchOverlay />

      {/* Floating control strip — wraps on narrow viewports so the pills
          never overflow the canvas or overlap the title bar above. Hidden in
          sketch mode so it never collides with Excalidraw's own toolbars. */}
      {workspaceMode === "structure" && (
      <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-wrap items-center justify-center gap-2">
        <div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-1 rounded-full border border-white/10 bg-[#0d0d14]/90 px-1.5 py-1 text-xs backdrop-blur-md">
          {EDGE_KINDS.map((k) => {
            const s = EDGE_STYLES[k];
            const active = edgeKind === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setEdgeKind(k)}
                className={[
                  "flex items-center gap-1.5 rounded-full px-2 py-0.5 transition",
                  active
                    ? "bg-white/10 text-[var(--color-ink)]"
                    : "text-[var(--color-ink-dim)] hover:bg-white/5 hover:text-[var(--color-ink)]",
                ].join(" ")}
                title={`Connection: ${s.label}`}
              >
                <span
                  className="inline-block h-[2px] w-3.5"
                  style={{
                    background: s.stroke,
                    opacity: active ? 1 : 0.75,
                  }}
                />
                <span className="leading-none">{s.label}</span>
              </button>
            );
          })}
        </div>

        <div className="pointer-events-auto flex items-center gap-0.5 rounded-full border border-white/10 bg-[#0d0d14]/90 px-1.5 py-1 text-xs backdrop-blur-md">
          <LayoutBtn label="→" title="Layout: left to right" onClick={() => runAutoLayout("LR")} />
          <LayoutBtn label="↓" title="Layout: top to bottom" onClick={() => runAutoLayout("TB")} />
          <LayoutBtn label="←" title="Layout: right to left" onClick={() => runAutoLayout("RL")} />
          <LayoutBtn label="↑" title="Layout: bottom to top" onClick={() => runAutoLayout("BT")} />
        </div>

        <div className="pointer-events-auto flex items-center rounded-full border border-white/10 bg-[#0d0d14]/90 px-1 py-1 text-xs backdrop-blur-md">
          <button
            type="button"
            onClick={() => void handleExportDiagramPng()}
            disabled={exportBusy || !project}
            title="Export diagram as PNG"
            className="flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[var(--color-ink-dim)] transition hover:bg-white/10 hover:text-[var(--color-ink)] disabled:opacity-40"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M8 2v8" />
              <path d="M4.5 7l3.5 3.5L11.5 7" />
              <path d="M3 13h10" />
            </svg>
            <span className="leading-none">{exportBusy ? "Exporting…" : "Export PNG"}</span>
          </button>
        </div>
      </div>
      )}

      {board.nodes.length === 0 && workspaceMode === "structure" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center pt-16">
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

      {/* Connector style editor — appears at bottom-center when an edge is
          selected. Hidden in sketch mode where edges aren't interactive. */}
      {workspaceMode === "structure" && selectedEdgeId && (
        <EdgeStylePanel
          edgeId={selectedEdgeId}
          onClose={() => setSelectedEdgeId(null)}
        />
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
      className="rounded-full px-2 py-0.5 font-mono leading-none text-[var(--color-ink-dim)] transition hover:bg-white/10 hover:text-[var(--color-ink)]"
    >
      {label}
    </button>
  );
}

/**
 * Pick the pair of opposing handles that gives the most direct line
 * between two card nodes.
 *
 *  - When the two nodes are stacked (mostly vertical offset), use top/bottom
 *    handles so the connector is a clean vertical drop.
 *  - When they sit side by side (mostly horizontal offset), use left/right
 *    handles so the connector is a clean horizontal run.
 *
 * Compares the centre-to-centre delta against the card width/height so the
 * threshold scales with the actual card size. CardNode renders at 220 px
 * wide; we approximate height at 120 px when not measured yet.
 */
function autoHandlePair(
  source: BoardNode | undefined,
  target: BoardNode | undefined,
): { source: string; target: string } {
  if (!source || !target) return { source: "r-src", target: "l-tgt" };
  const sw = source.width ?? 220;
  const sh = source.height ?? 120;
  const tw = target.width ?? 220;
  const th = target.height ?? 120;
  const sx = source.position.x + sw / 2;
  const sy = source.position.y + sh / 2;
  const tx = target.position.x + tw / 2;
  const ty = target.position.y + th / 2;
  const dx = tx - sx;
  const dy = ty - sy;
  // Bias so a small vertical offset doesn't flip from horizontal to vertical
  // routing — keeps stable picks while the user nudges nodes around.
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { source: "r-src", target: "l-tgt" }
      : { source: "l-src", target: "r-tgt" };
  }
  return dy >= 0
    ? { source: "b-src", target: "t-tgt" }
    : { source: "t-src", target: "b-tgt" };
}
