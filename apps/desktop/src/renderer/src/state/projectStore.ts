import { create } from "zustand";
import { nanoid } from "nanoid";
import type { Card, CardType, Project, RichDoc } from "@chitra/core";

export interface ProjectState {
  /** Loaded project, if any. */
  project: Project | null;
  /** On-disk path (null = new, never saved). */
  path: string | null;
  /** Has the in-memory project diverged from disk? */
  dirty: boolean;
  /** Last save timestamp (ISO). */
  lastSavedAt: string | null;

  // Lifecycle
  setProject: (project: Project, path: string | null) => void;
  closeProject: () => void;
  markSaved: (path: string, savedAt: string) => void;

  // Cards
  addCard: (input: { title: string; body: RichDoc; type: CardType }) => Card;
  updateCard: (id: string, patch: Partial<Card>) => void;
  removeCard: (id: string) => void;
}

function nowIso(): string {
  return new Date().toISOString();
}

export const useProjectStore = create<ProjectState>((set) => ({
  project: null,
  path: null,
  dirty: false,
  lastSavedAt: null,

  setProject: (project, path) =>
    set({ project, path, dirty: false, lastSavedAt: path ? project.updatedAt : null }),

  closeProject: () => set({ project: null, path: null, dirty: false, lastSavedAt: null }),

  markSaved: (path, savedAt) => set({ path, dirty: false, lastSavedAt: savedAt }),

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
      const cards = s.project.cards.filter((c) => c.id !== id);
      return { project: { ...s.project, cards, updatedAt: nowIso() }, dirty: true };
    }),
}));
