import { create } from "zustand";
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
}

function nowIso(): string {
  return new Date().toISOString();
}

function patchBoard(project: Project, boardId: string, patch: (b: Board) => Board): Project {
  const boards = project.boards.map((b) => (b.id === boardId ? patch(b) : b));
  return { ...project, boards, updatedAt: nowIso() };
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  project: null,
  path: null,
  dirty: false,
  lastSavedAt: null,
  currentBoardId: null,

  setProject: (project, path) =>
    set({
      project,
      path,
      dirty: false,
      lastSavedAt: path ? project.updatedAt : null,
      currentBoardId: project.boards[0]?.id ?? null,
    }),

  closeProject: () =>
    set({
      project: null,
      path: null,
      dirty: false,
      lastSavedAt: null,
      currentBoardId: null,
    }),

  markSaved: (path, savedAt) => set({ path, dirty: false, lastSavedAt: savedAt }),

  setCurrentBoard: (id) => set({ currentBoardId: id }),

  addCard: ({ title, body, type }) => {
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

  updateCard: (id, patch) =>
    set((s) => {
      if (!s.project) return s;
      const cards = s.project.cards.map((c) =>
        c.id === id ? { ...c, ...patch, updatedAt: nowIso() } : c,
      );
      return { project: { ...s.project, cards, updatedAt: nowIso() }, dirty: true };
    }),

  removeCard: (id) =>
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
    }),

  addNodeFromCard: (cardId, position) => {
    const { project, currentBoardId } = get();
    if (!project || !currentBoardId) return null;
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

  updateNodes: (updater) =>
    set((s) => {
      if (!s.project || !s.currentBoardId) return s;
      return {
        project: patchBoard(s.project, s.currentBoardId, (b) => ({ ...b, nodes: updater(b.nodes) })),
        dirty: true,
      };
    }),

  removeNode: (nodeId) =>
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
    }),

  addEdge: ({ source, target, kind = "flows-to" }) => {
    const { project, currentBoardId } = get();
    if (!project || !currentBoardId || source === target) return null;
    const board = project.boards.find((b) => b.id === currentBoardId);
    // Avoid duplicate edges (same source/target/kind).
    if (board?.edges.some((e) => e.source === source && e.target === target && e.kind === kind)) {
      return null;
    }
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

  removeEdge: (edgeId) =>
    set((s) => {
      if (!s.project || !s.currentBoardId) return s;
      return {
        project: patchBoard(s.project, s.currentBoardId, (b) => ({
          ...b,
          edges: b.edges.filter((e) => e.id !== edgeId),
        })),
        dirty: true,
      };
    }),
}));

/* ------------------------------------------------------------------ *
 *  Selectors                                                          *
 * ------------------------------------------------------------------ */

export function useCurrentBoard(): Board | null {
  return useProjectStore((s) => {
    if (!s.project || !s.currentBoardId) return null;
    return s.project.boards.find((b) => b.id === s.currentBoardId) ?? null;
  });
}

export function useCardMap(): Map<string, Card> {
  return useProjectStore((s) => new Map((s.project?.cards ?? []).map((c) => [c.id, c])));
}
