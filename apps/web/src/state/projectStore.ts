import { create } from "zustand";
import { useMemo } from "react";
import { nanoid } from "nanoid";
import type {
  Board,
  BoardBackground,
  BoardEdge,
  BoardNode,
  Card,
  CardType,
  EdgeKind,
  Project,
  RichDoc,
} from "@chitra/core";
import { type Template, seedToCard } from "@chitra/templates";

type CardPatch = Omit<Partial<Card>, "color" | "icon" | "style"> & {
  color?: string | null;
  icon?: string | null;
  style?: Card["style"] | null;
};

export interface ProjectState {
  /** Loaded project, if any. */
  project: Project | null;
  /** Displayable file name (null = new, never saved). */
  path: string | null;
  /** Opaque save target id (file handle id in FS Access browsers). */
  handleId: string | null;
  /** Has the in-memory project diverged from disk? */
  dirty: boolean;
  /** Last save timestamp (ISO). */
  lastSavedAt: string | null;
  /** Currently active board id. */
  currentBoardId: string | null;

  // Lifecycle
  setProject: (project: Project, path: string | null, handleId?: string | null) => void;
  closeProject: () => void;
  markSaved: (path: string, savedAt: string, handleId?: string | null) => void;
  setCurrentBoard: (id: string) => void;

  // Cards
  addCard: (input: { title: string; body: RichDoc; type: CardType }) => Card;
  /**
   * Patch a card. Pass `null` for an optional field (`color`, `icon`) to
   * clear it without violating exactOptionalPropertyTypes.
   */
  updateCard: (id: string, patch: CardPatch) => void;
  updateCardLive: (id: string, patch: CardPatch) => void;
  removeCard: (id: string) => void;

  // Board nodes / edges (operate on currentBoardId)
  addNodeFromCard: (cardId: string, position: { x: number; y: number }) => BoardNode | null;
  updateNodes: (updater: (nodes: BoardNode[]) => BoardNode[]) => void;
  /** Persist a node's user-resized dimensions. Snapshots history once
   *  per resize (call from NodeResizer's `onResizeEnd`). Pass `null` on
   *  either field to clear the override and revert to auto-size. */
  updateNodeSize: (
    nodeId: string,
    size: { width?: number | null; height?: number | null },
  ) => void;
  removeNode: (nodeId: string) => void;
  addEdge: (input: {
    source: string;
    target: string;
    kind?: EdgeKind;
    sourceHandle?: string | null;
    targetHandle?: string | null;
  }) => BoardEdge | null;
  /**
   * Patch a single edge's mutable fields. Pass `style: null` to clear all
   * per-edge overrides and revert to the kind-default appearance.
   */
  updateEdge: (
    id: string,
    patch: Partial<Pick<BoardEdge, "kind" | "label">> & {
      style?: BoardEdge["style"] | null;
      /** Partial merge with the existing description; `null` clears it. */
      description?: Partial<NonNullable<BoardEdge["description"]>> | null;
      /** Partial merge with the existing secondary label; `null` clears it. */
      secondaryLabel?: Partial<NonNullable<BoardEdge["secondaryLabel"]>> | null;
    },
  ) => void;
  updateEdges: (updater: (edges: BoardEdge[]) => BoardEdge[]) => void;
  removeEdge: (edgeId: string) => void;

  // Sketch overlay (per current board)
  setBoardSketch: (sketch: Record<string, unknown>) => void;

  /** Replace the current board's background config. Pass `null` to clear
   *  it (reverts to the app default). Partial patches are merged. */
  updateBoardBackground: (
    patch: Partial<BoardBackground> | null,
  ) => void;

  // Templates
  applyTemplate: (template: Template) => string | null;

  // Boards
  addBoard: (name?: string) => string | null;
  renameBoard: (id: string, name: string) => void;
  removeBoard: (id: string) => void;

  // History
  /** @internal */
  _past: Project[];
  /** @internal */
  _future: Project[];
  /** Components owning continuous interactions (drags) call this once on
      interaction start so undo rolls the whole interaction back. */
  pushHistory: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  undo: () => void;
  redo: () => void;
}

const HISTORY_LIMIT = 80;

function nowIso(): string {
  return new Date().toISOString();
}

function patchBoard(project: Project, boardId: string, patch: (b: Board) => Board): Project {
  const boards = project.boards.map((b) => (b.id === boardId ? patch(b) : b));
  return { ...project, boards, updatedAt: nowIso() };
}

function mergeCardPatch(card: Card, patch: CardPatch): Card {
  const merged = { ...card, ...patch, updatedAt: nowIso() } as Card & Record<string, unknown>;
  for (const key of Object.keys(patch) as Array<keyof CardPatch>) {
    if ((patch as Record<string, unknown>)[key as string] === null) {
      delete merged[key as string];
    }
  }
  return merged as Card;
}

function normalizeProjectForWorkspace(project: Project): Project {
  const liveCardIds = new Set(project.cards.map((card) => card.id));
  let changed = false;
  const boards = project.boards.map((board) => {
    const nodes = board.nodes.filter((node) => liveCardIds.has(node.cardId));
    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges = board.edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
    if (nodes.length === board.nodes.length && edges.length === board.edges.length) return board;
    changed = true;
    return { ...board, nodes, edges };
  });

  if (boards.length > 0) {
    return changed ? { ...project, boards, updatedAt: nowIso() } : project;
  }

  return {
    ...project,
    boards: [{ id: nanoid(), name: "Main board", nodes: [], edges: [] }],
    updatedAt: nowIso(),
  };
}

export const useProjectStore = create<ProjectState>((set, get) => {
  function snapshot(): void {
    const cur = get().project;
    if (!cur) return;
    const past = get()._past;
    const next = [...past, cur];
    if (next.length > HISTORY_LIMIT) next.shift();
    set({ _past: next, _future: [] });
  }

  return {
  project: null,
  path: null,
  handleId: null,
  dirty: false,
  lastSavedAt: null,
  currentBoardId: null,
  _past: [],
  _future: [],

  setProject: (project, path, handleId = null) => {
    const normalized = normalizeProjectForWorkspace(project);
    const migrated = normalized !== project;
    set({
      project: normalized,
      path,
      handleId,
      dirty: migrated,
      lastSavedAt: !migrated && path ? normalized.updatedAt : null,
      currentBoardId: normalized.boards[0]?.id ?? null,
      _past: [],
      _future: [],
    });
  },

  closeProject: () =>
    set({
      project: null,
      path: null,
      handleId: null,
      dirty: false,
      lastSavedAt: null,
      currentBoardId: null,
      _past: [],
      _future: [],
    }),

  markSaved: (path, savedAt, handleId) =>
    set((s) => ({ path, handleId: handleId ?? s.handleId, dirty: false, lastSavedAt: savedAt })),

  setCurrentBoard: (id) => set({ currentBoardId: id }),

  addCard: ({ title, body, type }) => {
    snapshot();
    const card: Card = {
      id: nanoid(),
      type,
      title: title.trim() || "Untitled",
      body,
      tags: [],
      metadata: {},
      source: "typed",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    set((s) => {
      if (!s.project) return s;
      return {
        project: { ...s.project, cards: [card, ...s.project.cards], updatedAt: nowIso() },
        dirty: true,
      };
    });
    return card;
  },

  updateCard: (id, patch) => {
    snapshot();
    set((s) => {
      if (!s.project) return s;
      const cards = s.project.cards.map((c) => {
        if (c.id !== id) return c;
        return mergeCardPatch(c, patch);
      });
      return { project: { ...s.project, cards, updatedAt: nowIso() }, dirty: true };
    });
  },

  updateCardLive: (id, patch) => {
    set((s) => {
      if (!s.project) return s;
      const cards = s.project.cards.map((c) => (c.id === id ? mergeCardPatch(c, patch) : c));
      return { project: { ...s.project, cards, updatedAt: nowIso() }, dirty: true };
    });
  },

  removeCard: (id) => {
    snapshot();
    set((s) => {
      if (!s.project) return s;
      // Remove the card AND any nodes/edges referencing it on every board.
      const boards = s.project.boards.map((b) => {
        const nodes = b.nodes.filter((n) => n.cardId !== id);
        const liveIds = new Set(nodes.map((n) => n.id));
        const edges = b.edges.filter((e) => liveIds.has(e.source) && liveIds.has(e.target));
        return { ...b, nodes, edges };
      });
      const cards = s.project.cards.filter((c) => c.id !== id);
      return { project: { ...s.project, cards, boards, updatedAt: nowIso() }, dirty: true };
    });
  },

  addNodeFromCard: (cardId, position) => {
    const { project, currentBoardId } = get();
    if (!project || !currentBoardId) return null;
    snapshot();
    const node: BoardNode = {
      id: nanoid(),
      cardId,
      position,
      locked: false,
    };
    set({
      project: patchBoard(project, currentBoardId, (b) => ({ ...b, nodes: [...b.nodes, node] })),
      dirty: true,
    });
    return node;
  },

  // Note: updateNodes / updateEdges fire on EVERY drag tick — we don't
  // snapshot here. Components should call `pushHistory()` on dragStop /
  // before discrete mutations they own.
  updateNodes: (updater) =>
    set((s) => {
      if (!s.project || !s.currentBoardId) return s;
      return {
        project: patchBoard(s.project, s.currentBoardId, (b) => ({ ...b, nodes: updater(b.nodes) })),
        dirty: true,
      };
    }),

  removeNode: (nodeId) => {
    snapshot();
    set((s) => {
      if (!s.project || !s.currentBoardId) return s;
      return {
        project: patchBoard(s.project, s.currentBoardId, (b) => ({
          ...b,
          nodes: b.nodes.filter((n) => n.id !== nodeId),
          edges: b.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
        })),
        dirty: true,
      };
    });
  },

  updateNodeSize: (nodeId, size) => {
    // Snapshot once per resize so undo rolls back the whole drag, not
    // every pixel-level dimension change.
    snapshot();
    set((s) => {
      if (!s.project || !s.currentBoardId) return s;
      return {
        project: patchBoard(s.project, s.currentBoardId, (b) => ({
          ...b,
          nodes: b.nodes.map((n) => {
            if (n.id !== nodeId) return n;
            const next: BoardNode = { ...n };
            if (size.width !== undefined) {
              if (size.width === null) delete (next as Partial<BoardNode>).width;
              else next.width = Math.max(120, Math.round(size.width));
            }
            if (size.height !== undefined) {
              if (size.height === null) delete (next as Partial<BoardNode>).height;
              else next.height = Math.max(60, Math.round(size.height));
            }
            return next;
          }),
        })),
        dirty: true,
      };
    });
  },

  addEdge: ({ source, target, kind = "straight", sourceHandle, targetHandle }) => {
    const { project, currentBoardId } = get();
    if (!project || !currentBoardId || source === target) return null;
    const board = project.boards.find((b) => b.id === currentBoardId);
    // Avoid duplicate edges (same source/target/kind on the same handle pair).
    if (
      board?.edges.some(
        (e) =>
          e.source === source &&
          e.target === target &&
          e.kind === kind &&
          (e.sourceHandle ?? null) === (sourceHandle ?? null) &&
          (e.targetHandle ?? null) === (targetHandle ?? null),
      )
    ) {
      return null;
    }
    snapshot();
    const edge: BoardEdge = { id: nanoid(), source, target, kind };
    if (sourceHandle) edge.sourceHandle = sourceHandle;
    if (targetHandle) edge.targetHandle = targetHandle;
    set({
      project: patchBoard(project, currentBoardId, (b) => ({ ...b, edges: [...b.edges, edge] })),
      dirty: true,
    });
    return edge;
  },

  updateEdge: (id, patch) => {
    snapshot();
    set((s) => {
      if (!s.project || !s.currentBoardId) return s;
      return {
        project: patchBoard(s.project, s.currentBoardId, (b) => ({
          ...b,
          edges: b.edges.map((e) => {
            if (e.id !== id) return e;
            const next: BoardEdge = { ...e };
            if (patch.kind !== undefined) next.kind = patch.kind;
            if (patch.label !== undefined) {
              if (patch.label === "") delete (next as Partial<BoardEdge>).label;
              else next.label = patch.label;
            }
            if (patch.style !== undefined) {
              if (patch.style === null) delete (next as Partial<BoardEdge>).style;
              else next.style = { ...(e.style ?? {}), ...patch.style };
            }
            if (patch.description !== undefined) {
              if (patch.description === null) {
                delete (next as Partial<BoardEdge>).description;
              } else {
                const merged = {
                  ...(e.description ?? { text: "", placement: "above" as const, background: "solid" as const }),
                  ...patch.description,
                } satisfies NonNullable<BoardEdge["description"]>;
                // Clearing description text wipes the whole pill so an
                // empty input doesn't render an invisible artifact.
                if (!merged.text || merged.text.trim() === "") {
                  delete (next as Partial<BoardEdge>).description;
                } else {
                  next.description = merged;
                }
              }
            }
            if (patch.secondaryLabel !== undefined) {
              if (patch.secondaryLabel === null) {
                delete (next as Partial<BoardEdge>).secondaryLabel;
              } else {
                const merged = {
                  ...(e.secondaryLabel ?? { text: "", placement: "below" as const, background: "outline" as const }),
                  ...patch.secondaryLabel,
                } satisfies NonNullable<BoardEdge["secondaryLabel"]>;
                if (!merged.text || merged.text.trim() === "") {
                  delete (next as Partial<BoardEdge>).secondaryLabel;
                } else {
                  next.secondaryLabel = merged;
                }
              }
            }
            return next;
          }),
        })),
        dirty: true,
      };
    });
  },

  updateEdges: (updater) =>
    set((s) => {
      if (!s.project || !s.currentBoardId) return s;
      return {
        project: patchBoard(s.project, s.currentBoardId, (b) => ({ ...b, edges: updater(b.edges) })),
        dirty: true,
      };
    }),

  removeEdge: (edgeId) => {
    snapshot();
    set((s) => {
      if (!s.project || !s.currentBoardId) return s;
      return {
        project: patchBoard(s.project, s.currentBoardId, (b) => ({
          ...b,
          edges: b.edges.filter((e) => e.id !== edgeId),
        })),
        dirty: true,
      };
    });
  },

  setBoardSketch: (sketch) =>
    set((s) => {
      if (!s.project || !s.currentBoardId) return s;
      return {
        project: patchBoard(s.project, s.currentBoardId, (b) => ({ ...b, sketch })),
        dirty: true,
      };
    }),

  updateBoardBackground: (patch) => {
    snapshot();
    set((s) => {
      if (!s.project || !s.currentBoardId) return s;
      return {
        project: patchBoard(s.project, s.currentBoardId, (b) => {
          if (patch === null) {
            const next = { ...b } as Partial<Board>;
            delete next.background;
            return next as Board;
          }
          const base: BoardBackground = b.background ?? { kind: "studio" };
          const merged: BoardBackground = { ...base, ...patch };
          return { ...b, background: merged };
        }),
        dirty: true,
      };
    });
  },

  applyTemplate: (template) => {
    snapshot();
    const scene = template.build();
    const ts = nowIso();

    // Stamp fresh ids for each seed card and remember the key→id map.
    const cardIdByKey = new Map<string, string>();
    const newCards: Card[] = scene.cards.map((seed) => {
      const id = nanoid();
      cardIdByKey.set(seed.key, id);
      return { id, createdAt: ts, updatedAt: ts, ...seedToCard(seed) };
    });

    // Stamp fresh ids for each seed node and remember key→nodeId so edges
    // can refer to actual node ids.
    const nodeIdByKey = new Map<string, string>();
    const newNodes: BoardNode[] = scene.nodes
      .map((seed) => {
        const cardId = cardIdByKey.get(seed.cardKey);
        if (!cardId) return null;
        const id = nanoid();
        nodeIdByKey.set(seed.cardKey, id);
        const node: BoardNode = {
          id,
          cardId,
          position: seed.position,
          locked: seed.locked ?? false,
        };
        if (seed.width !== undefined) node.width = seed.width;
        if (seed.height !== undefined) node.height = seed.height;
        return node;
      })
      .filter((n): n is BoardNode => n !== null);

    const newEdges: BoardEdge[] = scene.edges
      .map((seed) => {
        const source = nodeIdByKey.get(seed.fromKey);
        const target = nodeIdByKey.get(seed.toKey);
        if (!source || !target) return null;
        const edge: BoardEdge = {
          id: nanoid(),
          source,
          target,
          kind: seed.kind ?? "flows-to",
        };
        if (seed.label !== undefined) edge.label = seed.label;
        return edge;
      })
      .filter((e): e is BoardEdge => e !== null);

    const newBoard: Board = {
      id: nanoid(),
      name: scene.boardName,
      templateId: template.id,
      nodes: newNodes,
      edges: newEdges,
    };

    let createdBoardId: string | null = null;
    set((s) => {
      if (!s.project) return s;
      createdBoardId = newBoard.id;
      return {
        project: {
          ...s.project,
          cards: [...newCards, ...s.project.cards],
          boards: [...s.project.boards, newBoard],
          updatedAt: ts,
        },
        currentBoardId: newBoard.id,
        dirty: true,
      };
    });
    return createdBoardId;
  },

  /* -------- Boards -------- */
  addBoard: (name) => {
    snapshot();
    let createdId: string | null = null;
    set((s) => {
      if (!s.project) return s;
      const board: Board = {
        id: nanoid(),
        name: name?.trim() || `Board ${s.project.boards.length + 1}`,
        nodes: [],
        edges: [],
      };
      createdId = board.id;
      return {
        project: { ...s.project, boards: [...s.project.boards, board], updatedAt: nowIso() },
        currentBoardId: board.id,
        dirty: true,
      };
    });
    return createdId;
  },

  renameBoard: (id, name) => {
    snapshot();
    set((s) => {
      if (!s.project) return s;
      const boards = s.project.boards.map((b) =>
        b.id === id ? { ...b, name: name.trim() || b.name } : b,
      );
      return { project: { ...s.project, boards, updatedAt: nowIso() }, dirty: true };
    });
  },

  removeBoard: (id) => {
    const s = get();
    if (!s.project) return;
    if (s.project.boards.length <= 1) return;
    snapshot();
    set((st) => {
      if (!st.project) return st;
      const boards = st.project.boards.filter((b) => b.id !== id);
      const currentBoardId =
        st.currentBoardId === id ? boards[0]?.id ?? null : st.currentBoardId;
      return {
        project: { ...st.project, boards, updatedAt: nowIso() },
        currentBoardId,
        dirty: true,
      };
    });
  },

  /* -------- History -------- */
  pushHistory: snapshot,
  canUndo: () => get()._past.length > 0,
  canRedo: () => get()._future.length > 0,
  undo: () => {
    const { _past, _future, project } = get();
    if (_past.length === 0 || !project) return;
    const prev = _past[_past.length - 1];
    if (!prev) return;
    set({
      project: prev,
      _past: _past.slice(0, -1),
      _future: [..._future, project],
      dirty: true,
      // Keep currentBoardId valid.
      currentBoardId: prev.boards.some((b) => b.id === get().currentBoardId)
        ? get().currentBoardId
        : prev.boards[0]?.id ?? null,
    });
  },
  redo: () => {
    const { _past, _future, project } = get();
    if (_future.length === 0 || !project) return;
    const next = _future[_future.length - 1];
    if (!next) return;
    set({
      project: next,
      _past: [..._past, project],
      _future: _future.slice(0, -1),
      dirty: true,
      currentBoardId: next.boards.some((b) => b.id === get().currentBoardId)
        ? get().currentBoardId
        : next.boards[0]?.id ?? null,
    });
  },
  };
});

/* ------------------------------------------------------------------ *
 *  Selectors                                                          *
 * ------------------------------------------------------------------ */

export function useCurrentBoard(): Board | null {
  return useProjectStore((s) => {
    if (!s.project || !s.currentBoardId) return null;
    return s.project.boards.find((b) => b.id === s.currentBoardId) ?? null;
  });
}

/**
 * Stable Card lookup map. Returns the same Map reference between renders
 * unless `project.cards` actually changes — avoiding re-render thrash in
 * components that subscribe to it (the canvas in particular).
 */
export function useCardMap(): Map<string, Card> {
  const cards = useProjectStore((s) => s.project?.cards);
  return useMemo(() => new Map((cards ?? []).map((c) => [c.id, c])), [cards]);
}
