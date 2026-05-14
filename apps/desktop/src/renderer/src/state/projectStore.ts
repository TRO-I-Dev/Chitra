import { create } from "zustand";
import { useMemo } from "react";
import { nanoid } from "nanoid";
import type {
  Board,
  BoardEdge,
  BoardNode,
  Card,
  CardType,
  EdgeKind,
  Project,
  RichDoc,
} from "@chitra/core";
import { type Template, seedToCard } from "@chitra/templates";

export interface ProjectState {
  /** Loaded project, if any. */
  project: Project | null;
  /** On-disk path (null = new, never saved). */
  path: string | null;
  /** Has the in-memory project diverged from disk? */
  dirty: boolean;
  /** Last save timestamp (ISO). */
  lastSavedAt: string | null;
  /** Currently active board id. */
  currentBoardId: string | null;

  // Lifecycle
  setProject: (project: Project, path: string | null) => void;
  closeProject: () => void;
  markSaved: (path: string, savedAt: string) => void;
  setCurrentBoard: (id: string) => void;

  // Cards
  addCard: (input: { title: string; body: RichDoc; type: CardType }) => Card;
  updateCard: (id: string, patch: Partial<Card>) => void;
  removeCard: (id: string) => void;

  // Board nodes / edges (operate on currentBoardId)
  addNodeFromCard: (cardId: string, position: { x: number; y: number }) => BoardNode | null;
  updateNodes: (updater: (nodes: BoardNode[]) => BoardNode[]) => void;
  removeNode: (nodeId: string) => void;
  addEdge: (input: { source: string; target: string; kind?: EdgeKind }) => BoardEdge | null;
  updateEdges: (updater: (edges: BoardEdge[]) => BoardEdge[]) => void;
  removeEdge: (edgeId: string) => void;

  // Sketch overlay (per current board)
  setBoardSketch: (sketch: Record<string, unknown>) => void;

  // Templates
  applyTemplate: (template: Template) => string | null;

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
  dirty: false,
  lastSavedAt: null,
  currentBoardId: null,
  _past: [],
  _future: [],

  setProject: (project, path) =>
    set({
      project,
      path,
      dirty: false,
      lastSavedAt: path ? project.updatedAt : null,
      currentBoardId: project.boards[0]?.id ?? null,
      _past: [],
      _future: [],
    }),

  closeProject: () =>
    set({
      project: null,
      path: null,
      dirty: false,
      lastSavedAt: null,
      currentBoardId: null,
      _past: [],
      _future: [],
    }),

  markSaved: (path, savedAt) => set({ path, dirty: false, lastSavedAt: savedAt }),

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
      const cards = s.project.cards.map((c) =>
        c.id === id ? { ...c, ...patch, updatedAt: nowIso() } : c,
      );
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

  addEdge: ({ source, target, kind = "flows-to" }) => {
    const { project, currentBoardId } = get();
    if (!project || !currentBoardId || source === target) return null;
    const board = project.boards.find((b) => b.id === currentBoardId);
    // Avoid duplicate edges (same source/target/kind).
    if (board?.edges.some((e) => e.source === source && e.target === target && e.kind === kind)) {
      return null;
    }
    snapshot();
    const edge: BoardEdge = { id: nanoid(), source, target, kind };
    set({
      project: patchBoard(project, currentBoardId, (b) => ({ ...b, edges: [...b.edges, edge] })),
      dirty: true,
    });
    return edge;
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
