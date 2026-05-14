import type { Template } from "./types.js";

/* ------------------------------------------------------------------ *
 *  Layout helpers                                                     *
 * ------------------------------------------------------------------ */

const W = 280;
const H = 180;
const GAP_X = 40;
const GAP_Y = 40;

/** Convert a `(col, row)` grid coord into top-left pixel position. */
function grid(col: number, row: number, opts?: { w?: number; h?: number }): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const w = opts?.w ?? W;
  const h = opts?.h ?? H;
  return {
    x: col * (W + GAP_X),
    y: row * (H + GAP_Y),
    width: w,
    height: h,
  };
}

/* ------------------------------------------------------------------ *
 *  1. Lean Canvas                                                     *
 * ------------------------------------------------------------------ */

const leanCanvas: Template = {
  id: "lean-canvas",
  name: "Lean Canvas",
  category: "strategy",
  icon: "▣",
  description: "Ash Maurya's 1-page business model. Nine quadrants for problem, solution, market, channels, costs and revenue.",
  build() {
    const cells: Array<[string, string, "goal" | "persona" | "metric" | "component" | "note", number, number]> = [
      ["problem", "Problem", "risk" as never, 0, 0],
      ["customer-segments", "Customer Segments", "persona", 4, 0],
      ["unique-value", "Unique Value Proposition", "goal", 2, 0],
      ["solution", "Solution", "component", 1, 1],
      ["channels", "Channels", "component", 3, 1],
      ["key-metrics", "Key Metrics", "metric", 1, 2],
      ["unfair-advantage", "Unfair Advantage", "goal", 3, 2],
      ["cost-structure", "Cost Structure", "metric", 0, 3],
      ["revenue-streams", "Revenue Streams", "metric", 3, 3],
    ];
    return {
      boardName: "Lean Canvas",
      cards: cells.map(([key, title, type]) => ({
        key,
        title,
        type: type as never,
        tags: ["lean-canvas", key],
      })),
      nodes: cells.map(([key, , , c, r]) => ({
        cardKey: key,
        position: grid(c, r),
        width: W,
        height: H,
      })),
      edges: [],
    };
  },
};

/* ------------------------------------------------------------------ *
 *  2. Business Model Canvas                                           *
 * ------------------------------------------------------------------ */

const bmc: Template = {
  id: "business-model-canvas",
  name: "Business Model Canvas",
  category: "strategy",
  icon: "◫",
  description: "Osterwalder's 9-block canvas: partners, activities, resources, value, relationships, channels, segments, costs, revenue.",
  build() {
    const cells: Array<[string, string, "component" | "persona" | "goal" | "metric", number, number]> = [
      ["key-partners", "Key Partners", "component", 0, 0],
      ["key-activities", "Key Activities", "component", 1, 0],
      ["value-prop", "Value Propositions", "goal", 2, 0],
      ["customer-relationships", "Customer Relationships", "persona", 3, 0],
      ["customer-segments", "Customer Segments", "persona", 4, 0],
      ["key-resources", "Key Resources", "component", 1, 1],
      ["channels", "Channels", "component", 3, 1],
      ["cost-structure", "Cost Structure", "metric", 0, 2],
      ["revenue-streams", "Revenue Streams", "metric", 3, 2],
    ];
    return {
      boardName: "Business Model Canvas",
      cards: cells.map(([key, title, type]) => ({
        key,
        title,
        type: type as never,
        tags: ["bmc", key],
      })),
      nodes: cells.map(([key, , , c, r]) => ({
        cardKey: key,
        position: grid(c, r),
        width: W,
        height: H,
      })),
      edges: [],
    };
  },
};

/* ------------------------------------------------------------------ *
 *  3. SWOT                                                            *
 * ------------------------------------------------------------------ */

const swot: Template = {
  id: "swot",
  name: "SWOT Analysis",
  category: "strategy",
  icon: "◰",
  description: "Strengths, Weaknesses, Opportunities, Threats. Classic 2×2 quadrants.",
  build() {
    const cells: Array<[string, string, "goal" | "risk", number, number]> = [
      ["strengths", "Strengths", "goal", 0, 0],
      ["weaknesses", "Weaknesses", "risk", 1, 0],
      ["opportunities", "Opportunities", "goal", 0, 1],
      ["threats", "Threats", "risk", 1, 1],
    ];
    return {
      boardName: "SWOT",
      cards: cells.map(([key, title, type]) => ({
        key,
        title,
        type: type as never,
        tags: ["swot", key],
      })),
      nodes: cells.map(([key, , , c, r]) => ({
        cardKey: key,
        position: grid(c, r, { w: 360, h: 240 }),
        width: 360,
        height: 240,
      })),
      edges: [],
    };
  },
};

/* ------------------------------------------------------------------ *
 *  4. C4 Context                                                      *
 * ------------------------------------------------------------------ */

const c4Context: Template = {
  id: "c4-context",
  name: "C4 — System Context",
  category: "architecture",
  icon: "◇",
  description: "Top-level C4 diagram: your system, its users, and the external systems it interacts with.",
  build() {
    return {
      boardName: "C4 — System Context",
      cards: [
        { key: "system", title: "Your System", type: "component", tags: ["c4", "system"], bodyText: "The software system you are designing." },
        { key: "user", title: "End User", type: "persona", tags: ["c4", "actor"] },
        { key: "admin", title: "Administrator", type: "persona", tags: ["c4", "actor"] },
        { key: "auth", title: "Identity Provider", type: "component", tags: ["c4", "external"] },
        { key: "email", title: "Email Service", type: "component", tags: ["c4", "external"] },
        { key: "payments", title: "Payments Gateway", type: "component", tags: ["c4", "external"] },
      ],
      nodes: [
        { cardKey: "user", position: grid(0, 1) },
        { cardKey: "admin", position: grid(0, 2) },
        { cardKey: "system", position: grid(2, 1) },
        { cardKey: "auth", position: grid(4, 0) },
        { cardKey: "email", position: grid(4, 1) },
        { cardKey: "payments", position: grid(4, 2) },
      ],
      edges: [
        { fromKey: "user", toKey: "system", kind: "flows-to", label: "uses" },
        { fromKey: "admin", toKey: "system", kind: "flows-to", label: "manages" },
        { fromKey: "system", toKey: "auth", kind: "depends-on", label: "authenticates" },
        { fromKey: "system", toKey: "email", kind: "depends-on", label: "sends via" },
        { fromKey: "system", toKey: "payments", kind: "depends-on", label: "charges via" },
      ],
    };
  },
};

/* ------------------------------------------------------------------ *
 *  5. User Journey                                                    *
 * ------------------------------------------------------------------ */

const userJourney: Template = {
  id: "user-journey",
  name: "User Journey",
  category: "research",
  icon: "→",
  description: "Awareness → Consideration → Onboarding → Activation → Retention. A horizontal stage map for a user's experience.",
  build() {
    const stages = ["Awareness", "Consideration", "Onboarding", "Activation", "Retention"] as const;
    return {
      boardName: "User Journey",
      cards: stages.map((s, i) => ({
        key: `stage-${i}`,
        title: s,
        type: "step" as never,
        tags: ["journey", s.toLowerCase()],
      })),
      nodes: stages.map((_, i) => ({ cardKey: `stage-${i}`, position: grid(i, 0) })),
      edges: stages.slice(0, -1).map((_, i) => ({
        fromKey: `stage-${i}`,
        toKey: `stage-${i + 1}`,
        kind: "sequence" as never,
      })),
    };
  },
};

/* ------------------------------------------------------------------ *
 *  6. OKR Tree                                                        *
 * ------------------------------------------------------------------ */

const okrTree: Template = {
  id: "okr-tree",
  name: "OKR Tree",
  category: "planning",
  icon: "◉",
  description: "One Objective branching into 3 Key Results, each with supporting initiatives.",
  build() {
    return {
      boardName: "OKR Tree",
      cards: [
        { key: "obj", title: "Objective", type: "goal", tags: ["okr"], bodyText: "What inspiring outcome are you chasing?" },
        { key: "kr1", title: "Key Result 1", type: "metric", tags: ["okr", "kr"] },
        { key: "kr2", title: "Key Result 2", type: "metric", tags: ["okr", "kr"] },
        { key: "kr3", title: "Key Result 3", type: "metric", tags: ["okr", "kr"] },
        { key: "i1a", title: "Initiative", type: "step", tags: ["okr", "initiative"] },
        { key: "i1b", title: "Initiative", type: "step", tags: ["okr", "initiative"] },
        { key: "i2a", title: "Initiative", type: "step", tags: ["okr", "initiative"] },
        { key: "i3a", title: "Initiative", type: "step", tags: ["okr", "initiative"] },
        { key: "i3b", title: "Initiative", type: "step", tags: ["okr", "initiative"] },
      ],
      nodes: [
        { cardKey: "obj", position: grid(2, 0) },
        { cardKey: "kr1", position: grid(0, 1) },
        { cardKey: "kr2", position: grid(2, 1) },
        { cardKey: "kr3", position: grid(4, 1) },
        { cardKey: "i1a", position: grid(0, 2) },
        { cardKey: "i1b", position: grid(1, 2) },
        { cardKey: "i2a", position: grid(2, 2) },
        { cardKey: "i3a", position: grid(3, 2) },
        { cardKey: "i3b", position: grid(4, 2) },
      ],
      edges: [
        { fromKey: "obj", toKey: "kr1", kind: "contains" },
        { fromKey: "obj", toKey: "kr2", kind: "contains" },
        { fromKey: "obj", toKey: "kr3", kind: "contains" },
        { fromKey: "kr1", toKey: "i1a", kind: "informs" },
        { fromKey: "kr1", toKey: "i1b", kind: "informs" },
        { fromKey: "kr2", toKey: "i2a", kind: "informs" },
        { fromKey: "kr3", toKey: "i3a", kind: "informs" },
        { fromKey: "kr3", toKey: "i3b", kind: "informs" },
      ],
    };
  },
};

/* ------------------------------------------------------------------ *
 *  7. Roadmap (Now / Next / Later)                                    *
 * ------------------------------------------------------------------ */

const roadmap: Template = {
  id: "roadmap-now-next-later",
  name: "Roadmap — Now / Next / Later",
  category: "planning",
  icon: "▷",
  description: "Three swim-lanes for short, mid and long-term work. Drop your goals and steps into each column.",
  build() {
    const lanes: Array<[string, string]> = [
      ["now", "Now"],
      ["next", "Next"],
      ["later", "Later"],
    ];
    return {
      boardName: "Roadmap",
      cards: lanes.map(([key, title]) => ({
        key: `lane-${key}`,
        title,
        type: "note" as never,
        tags: ["roadmap", "lane", key],
      })),
      nodes: lanes.map(([key], i) => ({
        cardKey: `lane-${key}`,
        position: grid(i, 0, { w: 320, h: 480 }),
        width: 320,
        height: 480,
      })),
      edges: [],
    };
  },
};

/* ------------------------------------------------------------------ *
 *  Registry                                                           *
 * ------------------------------------------------------------------ */

export const TEMPLATES: readonly Template[] = [
  leanCanvas,
  bmc,
  swot,
  c4Context,
  userJourney,
  okrTree,
  roadmap,
] as const;

export function findTemplate(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
