import type { BoardEdge, BoardNode, Card, CardType, EdgeKind } from "@chitra/core";

/**
 * A template is a recipe for stamping a fresh board into a project. The
 * `build()` function emits skeletal cards (no ids/timestamps) plus their
 * intended on-board positions and any pre-wired edges between them.
 *
 * The renderer's `applyTemplate` action assigns ids + timestamps and stitches
 * everything into the active project as a new board.
 */
export type SeedCard = Pick<Card, "type" | "title" | "tags"> & {
  bodyText?: string;
  /** Sticky color override (overrides type-based default). */
  color?: string;
  /** Logical key used by SeedNode/SeedEdge to reference this card. */
  key: string;
};

export type SeedNode = {
  /** Refers to SeedCard.key. */
  cardKey: string;
  position: { x: number; y: number };
  width?: number;
  height?: number;
  locked?: boolean;
};

export type SeedEdge = {
  /** Source SeedNode.cardKey. */
  fromKey: string;
  /** Target SeedNode.cardKey. */
  toKey: string;
  kind?: EdgeKind;
  label?: string;
};

export type TemplateScene = {
  /** Display name for the new board. */
  boardName: string;
  cards: SeedCard[];
  nodes: SeedNode[];
  edges: SeedEdge[];
};

export type TemplateCategory =
  | "strategy"
  | "architecture"
  | "research"
  | "planning"
  | "discovery";

export type Template = {
  id: string;
  name: string;
  category: TemplateCategory;
  description: string;
  /** Single-glyph icon used in the picker. */
  icon: string;
  build(): TemplateScene;
};

export type AppliedScene = {
  cards: Omit<Card, "id" | "createdAt" | "updatedAt">[];
  nodes: Omit<BoardNode, "id">[];
  edges: Omit<BoardEdge, "id">[];
  boardName: string;
};

/** Default empty rich-doc body for a card. */
export function emptyBody(text?: string): Card["body"] {
  if (!text) return { type: "doc", content: [{ type: "paragraph" }] };
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

/** Convert a `SeedCard` into the unsaved Card shape. */
export function seedToCard(seed: SeedCard): Omit<Card, "id" | "createdAt" | "updatedAt"> {
  return {
    type: seed.type as CardType,
    title: seed.title,
    body: emptyBody(seed.bodyText),
    tags: seed.tags ?? [],
    color: seed.color,
    metadata: { templateKey: seed.key },
    source: "imported",
  };
}
