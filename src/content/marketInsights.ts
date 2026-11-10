/*
 * Figures behind the Markets Insights tab, curated by hand from Sid's research notes in
 * github.com/sidagarwal-labs/models/tree/main/notes ("Research as of October 3, 2026"). They are fixed to those notes,
 * not parsed at build time: when the notes change, update this file and its dates together.
 * Every item links to the note section it came from (GitHub heading anchors), which opens the GitHub app inside Lab OS.
 */

const notesBase = "https://github.com/sidagarwal-labs/models/blob/main/notes";
const note = (file: string, anchor: string) => `${notesBase}/${file}#${anchor}`;

export const NOTES_HOME = "https://github.com/sidagarwal-labs/models/tree/main/notes";
/* The notes' own "research as of" date. */
export const NOTES_AS_OF = "2026-10-03";

export type Source = { label: string; href: string };

export const sources = {
  ranking: { label: "memory-storage.md › Bottleneck Ranking", href: note("memory-storage.md", "bottleneck-ranking") },
  hbm: { label: "memory-storage.md › Why HBM Binds Before Peak FLOPs", href: note("memory-storage.md", "why-hbm-binds-before-peak-flops") },
  scenarios: { label: "memory-storage.md › 2026 Inference Scenarios", href: note("memory-storage.md", "2026-inference-scenarios") },
  allocation: { label: "ai-capex.md › Illustrative Allocation Of Each $100", href: note("ai-capex.md", "illustrative-allocation-of-each-100") },
  consensus: { label: "ai-capex.md › Five-Hyperscaler Consensus Snapshot", href: note("ai-capex.md", "five-hyperscaler-consensus-snapshot") },
  backlog: { label: "cloud-growth.md › Backlog Growth And The Cash-Flow Outlook", href: note("cloud-growth.md", "backlog-growth-and-the-cash-flow-outlook") },
  buildout: { label: "ai-buildout-2026-10.md › Revenue, Backlogs, And Cash Flow", href: note("ai-buildout-2026-10.md", "revenue-backlogs-and-cash-flow") },
  spotSpread: { label: "gpu-prices.md › September 8 Provider Check", href: note("gpu-prices.md", "september-8-provider-check") },
  rents: { label: "gpu-prices.md › Rental Resilience And Inferred GPU Value", href: note("gpu-prices.md", "rental-resilience-and-inferred-gpu-value") }
} satisfies Record<string, Source>;

/* Fallback names for the tracker sheet's levels; the live sheet's own area names win when it has them. */
export const levelNames: Record<number, string> = {
  0: "Materials", 1: "Designing", 2: "Custom Design", 3: "Machining", 4: "Packaging", 5: "Memory - HBM", 6: "Foundry",
  7: "Energy", 8: "Cooling", 9: "Networking", 10: "Memory - Cold", 11: "Chips", 12: "Cloud Infrastructure", 13: "Servers",
  14: "Storage", 15: "Cloud / Analytics", 16: "Ads / Software", 17: "Mobile"
};

/* ---------- 1. Bottleneck ranking (memory-storage.md › Bottleneck Ranking) ---------- */

export type Tightness = "very-high" | "high" | "medium-high" | "medium" | "low";

export const tightnessScale: { id: Tightness; label: string; score: number }[] = [
  { id: "low", label: "Low", score: 1 },
  { id: "medium", label: "Medium", score: 2 },
  { id: "medium-high", label: "Medium-high", score: 3 },
  { id: "high", label: "High", score: 4 },
  { id: "very-high", label: "Very high", score: 5 }
];

export const tightnessLabel = (id: Tightness) => tightnessScale.find((item) => item.id === id)!.label;
export const tightnessScore = (id: Tightness) => tightnessScale.find((item) => item.id === id)!.score;

export type Bottleneck = {
  id: string;
  rank: number;
  /* The note's layer name. */
  name: string;
  tightness: Tightness;
  /* The note's own wording for the tightness, when it says more than the scale ("High, but not first"). */
  tightnessText: string;
  reason: string;
  /* Tracker-sheet levels this constraint maps to. */
  levels: number[];
  /* Shown when the constraint has no level of its own. */
  levelNote?: string;
};

export const bottlenecks: Bottleneck[] = [
  {
    id: "hbm", rank: 1, name: "HBM capacity and bandwidth", tightness: "very-high", tightnessText: "Very high",
    reason: "Weight fit, KV cache, and decode bandwidth all bind; qualified stacks are allocated with GPUs", levels: [5]
  },
  {
    id: "systems", rank: 2, name: "Deployable accelerator systems", tightness: "very-high", tightnessText: "Very high",
    reason: "Advanced packaging, networking, liquid cooling, racks, and power must arrive together", levels: [4, 8, 9]
  },
  {
    id: "power", rank: 3, name: "Grid and datacenter power", tightness: "very-high", tightnessText: "Very high",
    reason: "Base text inference alone implies ~2.5 GW IT load, or ~3.0 GW at 1.2 PUE", levels: [7]
  },
  {
    id: "arithmetic", rank: 4, name: "GPU arithmetic", tightness: "high", tightnessText: "High, but not first",
    reason: "Practical serving needs ~3.3x the base-case provisioned arithmetic capacity, or ~9.5x the raw floor", levels: [1, 6]
  },
  {
    id: "ddr5", rank: 5, name: "Server DDR5", tightness: "medium-high", tightnessText: "Medium-high",
    reason: "Roughly 2-4x HBM capacity per node and competes for DRAM wafers", levels: [],
    levelNote: "No level of its own: the Level 5 memory makers also make DDR5"
  },
  {
    id: "ssd", rank: 6, name: "Enterprise SSD", tightness: "medium", tightnessText: "Medium",
    reason: "Several TB/GPU is useful, but storage can be shared and disaggregated", levels: [10]
  },
  {
    id: "hdd", rank: 7, name: "HDD", tightness: "low", tightnessText: "Low for online inference",
    reason: "Important for corpora and archives, but outside the token-generation latency path", levels: [10]
  }
];

export const bottlenecksForLevel = (level: number) => bottlenecks.filter((item) => item.levels.includes(level));

/* ---------- 2. Where each $100 of AI capex goes (ai-capex.md › Illustrative Allocation Of Each $100) ---------- */

export type CapexBucket = {
  id: string;
  label: string;
  dollars: number;
  /* Stack levels whose companies sell into this bucket. */
  levels: number[];
  /* The level a click on the segment jumps to. */
  jump: number;
  parts?: { id: string; label: string; dollars: number; levels: number[]; jump: number; note?: string }[];
};

export const capexAllocation: { observed: string; buckets: CapexBucket[] } = {
  observed: "BNP Paribas Equity Research, August 2026 (via a16z Growth's September State of Markets)",
  buckets: [
    {
      id: "chips", label: "Semiconductor chips", dollars: 50, levels: [0, 1, 2, 3, 4, 5, 6, 11], jump: 1,
      parts: [
        { id: "accelerators", label: "Accelerators", dollars: 25, levels: [1, 2, 6], jump: 1 },
        { id: "memory", label: "Memory ICs", dollars: 15, levels: [5], jump: 5, note: "Not an HBM-only estimate" },
        { id: "cpus", label: "CPUs, other chips, and server production", dollars: 10, levels: [11], jump: 11 }
      ]
    },
    { id: "power", label: "Power", dollars: 20, levels: [7], jump: 7 },
    { id: "networking", label: "Networking equipment", dollars: 15, levels: [9], jump: 9 },
    { id: "cooling", label: "Cooling", dollars: 7.5, levels: [8], jump: 8 },
    { id: "facilities", label: "Facilities and construction", dollars: 7.5, levels: [12, 13], jump: 12 }
  ]
};

/* ---------- 3. Explainers ---------- */

export type Explainer = {
  id: string;
  title: string;
  levels: number[];
  observed: string;
  facts: { value: string; label: string }[];
  caveat: string;
  sources: Source[];
};

export const explainers: Explainer[] = [
  {
    id: "hbm",
    title: "Why HBM binds before peak FLOPs",
    levels: [5],
    observed: "Planning model in the notes, Oct 3, 2026 (NVIDIA H100: 80 GB, 3.35 TB/s)",
    facts: [
      { value: "≈70 GB", label: "for a 70B model's weights at FP8 (140 GB at BF16), against 80 GB of HBM on one H100" },
      { value: "≈42 GB", label: "of KV cache for one 128K-token live context (≈0.33 MB per token, BF16, grouped-query attention)" },
      { value: "≈48/s", label: "batch-1 decode steps per H100-equivalent: 70 GB of weights read against 3.35 TB/s, before overhead" }
    ],
    caveat: "Order-of-magnitude arithmetic, not a benchmark. Batching, quantization, and paged KV caches move these numbers but don't make bandwidth or capacity free.",
    sources: [sources.hbm]
  },
  {
    id: "power",
    title: "Power: gigawatts for text inference alone",
    levels: [7],
    observed: "Base scenario in the notes, Oct 3, 2026 (100T tokens/day, 1.5 kW per accelerator)",
    facts: [
      { value: "≈2.5 GW", label: "of node IT load for base-case text inference (1.65M H100-equivalents)" },
      { value: "≈3.0 GW", label: "at a 1.2 PUE, once cooling and facility overhead are counted" },
      { value: "≈7.4 GW", label: "if hidden reasoning or agent loops triple the base case (≈5M H100-equivalents)" }
    ],
    caveat: "A scenario, not a forecast: it excludes training, embeddings, and image/video generation, and efficiency gains could offset it.",
    sources: [sources.ranking, sources.scenarios]
  },
  {
    id: "rents",
    title: "GPU rents: a wide spot discount, resilient prices",
    levels: [12],
    observed: "CoreWeave North America price list, observed Sep 8, 2026; Silicon Data rents, Sep 7, 2026",
    facts: [
      { value: "≈60%", label: "below on-demand for CoreWeave H100 spot ($19.71 vs $49.24 per 8-GPU instance-hour)" },
      { value: "≈50%", label: "below on-demand for CoreWeave B200 spot ($34.11 vs $68.80 per 8-GPU instance-hour)" },
      { value: "$2.63", label: "per H100 GPU-hour in Silicon Data's rental benchmark (B200 $5.69, A100 $1.59): older GPUs still earn rent" }
    ],
    caveat: "Advertised list prices, not executed trades. Spot has different availability and interruption terms, so a wide spread isn't proof of excess supply.",
    sources: [sources.spotSpread, sources.rents]
  }
];

/* ---------- 4. Demand signals ---------- */

export type DemandSignal = { id: string; value: string; label: string; detail: string; observed: string; source: Source };

export const demandSignals: DemandSignal[] = [
  {
    id: "capex-2026",
    value: "$777B",
    label: "2026 capex, five hyperscalers",
    detail: "Alphabet, Amazon, Meta, Microsoft, and Oracle: up 86.8% from $416B in 2025, with consensus above $1T a year from 2027",
    observed: "Bloomberg consensus as of Jul 31, 2026 (Vanguard)",
    source: sources.consensus
  },
  {
    id: "capex-2025",
    value: "$416B",
    label: "2025 capex, same five",
    detail: "Up 72.6% from $241B in 2024",
    observed: "Historical actual",
    source: sources.consensus
  },
  {
    id: "backlog",
    value: "≈$1.7T",
    label: "Cloud backlog, Microsoft + Google + Amazon",
    detail: "Microsoft RPO, Google Cloud backlog, and Amazon RPO combined; contracted demand, not current revenue",
    observed: "Plotted Q2 2026 endpoint",
    source: sources.backlog
  }
];

export const demandReadMore = sources.buildout;
