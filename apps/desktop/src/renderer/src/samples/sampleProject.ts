import { nanoid } from "nanoid";
import type { Project } from "@chitra/core";
import { TEMPLATES, seedToCard } from "@chitra/templates";
import { PROJECT_SCHEMA_VERSION } from "@chitra/core";

/**
 * Build a self-contained sample project from the Lean Canvas template
 * with a few extra cards so the user has something to play with on first
 * launch. No network, no IPC — purely synthesized in the renderer.
 */
export function buildSampleProject(): Project {
  const ts = new Date().toISOString();
  const lean = TEMPLATES.find((t) => t.id === "lean-canvas");
  if (!lean) throw new Error("lean-canvas template not found");
  const scene = lean.build();

  const cardIdByKey = new Map<string, string>();
  const cards = scene.cards.map((seed) => {
    const id = nanoid();
    cardIdByKey.set(seed.key, id);
    return { id, createdAt: ts, updatedAt: ts, ...seedToCard(seed) };
  });
  const nodeIdByKey = new Map<string, string>();
  const nodes = scene.nodes
    .map((seed) => {
      const cardId = cardIdByKey.get(seed.cardKey);
      if (!cardId) return null;
      const id = nanoid();
      nodeIdByKey.set(seed.cardKey, id);
      const n: { id: string; cardId: string; position: { x: number; y: number }; locked: boolean; width?: number; height?: number } = {
        id,
        cardId,
        position: seed.position,
        locked: false,
      };
      if (seed.width !== undefined) n.width = seed.width;
      if (seed.height !== undefined) n.height = seed.height;
      return n;
    })
    .filter((n): n is NonNullable<typeof n> => n !== null);

  // A few example cards in the inbox so the user sees what classifier output looks like.
  const extras = [
    { type: "goal", title: "Ship MVP in 6 weeks" },
    { type: "metric", title: "Reach 100 weekly active users" },
    { type: "risk", title: "Onboarding friction kills retention" },
    { type: "step", title: "Run 5 user interviews this week" },
  ] as const;
  for (const c of extras) {
    cards.push({
      id: nanoid(),
      createdAt: ts,
      updatedAt: ts,
      type: c.type,
      title: c.title,
      body: { type: "doc", content: [{ type: "paragraph" }] },
      tags: ["sample"],
      metadata: {},
      source: "imported",
    });
  }

  return {
    id: nanoid(),
    name: "Sample — Lean Canvas walkthrough",
    schemaVersion: PROJECT_SCHEMA_VERSION,
    createdAt: ts,
    updatedAt: ts,
    cards,
    boards: [
      {
        id: nanoid(),
        name: "Lean Canvas",
        templateId: lean.id,
        nodes,
        edges: [],
      },
    ],
  };
}
