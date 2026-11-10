import { bottlenecksForLevel, capexAllocation, levelNames, tightnessScore, type Bottleneck } from "../../content/marketInsights";
import { distance, layerId, layerLabel, median, type AiStackRow } from "./aiStack";

export type LevelStat = {
  level: number;
  name: string;
  layer: string;
  layerId: string;
  /* Unique companies at the level. */
  symbols: string[];
  /* Sum of the level's companies' whole market caps, in billions; missing caps are skipped. */
  marketCap: number;
  medianFromHigh: number | null;
  medianChange: number | null;
};

export const levelName = (level: number, rows: AiStackRow[]) => {
  const areas = [...new Set(rows.filter((row) => row.level === level).map((row) => row.area).filter(Boolean))];
  return areas.length ? areas.join(" · ") : levelNames[level] ?? `Level ${level}`;
};

export function levelStats(rows: AiStackRow[]): LevelStat[] {
  const byLevel = new Map<number, AiStackRow[]>();
  for (const row of rows) byLevel.set(row.level, [...(byLevel.get(row.level) ?? []), row]);
  return [...byLevel.entries()].sort(([a], [b]) => a - b).map(([level, levelRows]) => {
    const unique = [...new Map(levelRows.map((row) => [row.symbol.toUpperCase(), row])).values()];
    return {
      level,
      name: levelName(level, levelRows),
      layer: layerLabel(levelRows[0].layer),
      layerId: layerId(levelRows[0].layer),
      symbols: unique.map((row) => row.symbol),
      marketCap: unique.reduce((sum, row) => sum + (row.marketCap ?? 0), 0),
      medianFromHigh: median(unique.map((row) => distance(row.price, row.high))),
      medianChange: median(unique.map((row) => row.change))
    };
  });
}

/* A company that sits at several levels (Alphabet, Microsoft, Broadcom, Intel) has its market cap split evenly across
   its placements, so totals across levels count each company once. */
export function splitCaps(rows: AiStackRow[]) {
  const placements = new Map<string, number>();
  for (const row of rows) placements.set(row.symbol.toUpperCase(), (placements.get(row.symbol.toUpperCase()) ?? 0) + 1);
  return rows.map((row) => (row.marketCap === null || row.marketCap <= 0 ? 0 : row.marketCap / placements.get(row.symbol.toUpperCase())!));
}

export type BucketShare = { id: string; label: string; capexShare: number; capShare: number | null; marketCap: number; companies: number; levels: number[] };

/* Each first-level $100 bucket's share of capex against the share of market cap its stack levels hold, across the
   five buckets only (levels outside them, such as storage and applications, aren't counted). */
export function bucketShares(rows: AiStackRow[]): BucketShare[] {
  const caps = splitCaps(rows);
  const raw = capexAllocation.buckets.map((bucket) => {
    const inBucket = rows.map((row, index) => ({ row, cap: caps[index] })).filter(({ row }) => bucket.levels.includes(row.level));
    return {
      id: bucket.id,
      label: bucket.label,
      capexShare: bucket.dollars,
      marketCap: inBucket.reduce((sum, item) => sum + item.cap, 0),
      companies: new Set(inBucket.map(({ row }) => row.symbol.toUpperCase())).size,
      levels: bucket.levels
    };
  });
  const total = raw.reduce((sum, bucket) => sum + bucket.marketCap, 0);
  return raw.map((bucket) => ({ ...bucket, capShare: total > 0 ? (bucket.marketCap / total) * 100 : null }));
}

export type PricedPoint = LevelStat & { bottlenecks: Bottleneck[]; score: number };

/* Levels the notes rank, scored by their tightest constraint, against how far their stocks sit from 52-week highs. */
export function pricedInPoints(rows: AiStackRow[]): PricedPoint[] {
  return levelStats(rows)
    .map((stat) => {
      const ranked = bottlenecksForLevel(stat.level);
      return { ...stat, bottlenecks: ranked, score: Math.max(0, ...ranked.map((item) => tightnessScore(item.tightness))) };
    })
    .filter((point) => point.bottlenecks.length > 0);
}

/* A plain-language comparison for the scatter; deliberately descriptive. */
export function pricedInReadout(points: PricedPoint[]) {
  const tight = median(points.filter((point) => point.score === 5).map((point) => point.medianFromHigh));
  const rest = median(points.filter((point) => point.score < 5).map((point) => point.medianFromHigh));
  if (tight === null || rest === null) return "Not enough prices in the sheet to compare the tightest levels with the rest.";
  const fmt = (value: number) => `${Math.abs(value).toFixed(1)}%`;
  const gap = Math.abs(tight - rest);
  const lead = `The very-high bottleneck levels sit a median ${fmt(tight)} below their 52-week highs, against ${fmt(rest)} for the other ranked levels.`;
  if (gap < 3) return `${lead} That's about the same: on this measure the market isn't treating the tightest layers differently.`;
  return tight > rest
    ? `${lead} The tightest layers are trading closer to their highs, which fits the market pricing in the bottlenecks.`
    : `${lead} The tightest layers have fallen further from their highs, so on this measure the bottlenecks don't look priced in.`;
}

/* ---------- Treemap ---------- */

export type Rect = { x: number; y: number; w: number; h: number };
type Weighted = { value: number };

const worst = (row: number[], side: number) => {
  const sum = row.reduce((a, b) => a + b, 0);
  const max = Math.max(...row);
  const min = Math.min(...row);
  return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
};

/* Squarified treemap (Bruls, Huizing, van Wijk): lays out items in order, largest first, keeping tiles near square. */
export function squarify<T extends Weighted>(items: T[], rect: Rect): (T & Rect)[] {
  const positive = items.filter((item) => item.value > 0).sort((a, b) => b.value - a.value);
  const total = positive.reduce((sum, item) => sum + item.value, 0);
  if (!positive.length || rect.w <= 0 || rect.h <= 0) return [];
  const scale = (rect.w * rect.h) / total;
  const areas = positive.map((item) => item.value * scale);
  const out: (T & Rect)[] = [];
  let { x, y, w, h } = rect;
  let start = 0;
  while (start < areas.length) {
    const side = Math.min(w, h);
    let end = start + 1;
    while (end < areas.length && worst(areas.slice(start, end + 1), side) <= worst(areas.slice(start, end), side)) end++;
    const row = areas.slice(start, end);
    const sum = row.reduce((a, b) => a + b, 0);
    if (w >= h) {
      const width = sum / h;
      let offset = y;
      row.forEach((area, index) => {
        const height = area / width;
        out.push({ ...positive[start + index], x, y: offset, w: width, h: height });
        offset += height;
      });
      x += width;
      w -= width;
    } else {
      const height = sum / w;
      let offset = x;
      row.forEach((area, index) => {
        const width = area / height;
        out.push({ ...positive[start + index], x: offset, y, w: width, h: height });
        offset += width;
      });
      y += height;
      h -= height;
    }
    start = end;
  }
  return out;
}

export type TreeTile = Rect & { symbol: string; level: number; layerId: string; layer: string; value: number; change: number | null };
export type TreeGroup = Rect & { key: string; label: string; layerId: string; value: number };

/* Layers, then levels inside each layer, then companies inside each level, all squarified by (split) market cap. */
export function treemap(rows: AiStackRow[], width: number, height: number, gap = 2) {
  const caps = splitCaps(rows);
  const entries = rows.map((row, index) => ({ row, value: caps[index] })).filter((entry) => entry.value > 0);
  const layers = new Map<string, typeof entries>();
  for (const entry of entries) layers.set(layerId(entry.row.layer), [...(layers.get(layerId(entry.row.layer)) ?? []), entry]);
  const layerRects = squarify([...layers.entries()].map(([id, list]) => ({
    id, list, label: layerLabel(list[0].row.layer), value: list.reduce((sum, entry) => sum + entry.value, 0)
  })), { x: 0, y: 0, w: width, h: height });

  const groups: TreeGroup[] = [];
  const tiles: TreeTile[] = [];
  for (const layer of layerRects) {
    const levels = new Map<number, typeof entries>();
    for (const entry of layer.list) levels.set(entry.row.level, [...(levels.get(entry.row.level) ?? []), entry]);
    const inner = { x: layer.x + gap, y: layer.y + gap, w: Math.max(0, layer.w - gap * 2), h: Math.max(0, layer.h - gap * 2) };
    const levelRects = squarify([...levels.entries()].map(([level, list]) => ({
      level, list, value: list.reduce((sum, entry) => sum + entry.value, 0)
    })), inner);
    for (const level of levelRects) {
      groups.push({ key: `L${level.level}`, label: `L${level.level} ${levelName(level.level, level.list.map((entry) => entry.row))}`, layerId: layer.id, value: level.value, x: level.x, y: level.y, w: level.w, h: level.h });
      const cells = squarify(level.list.map((entry) => ({ entry, value: entry.value })), { x: level.x + 1, y: level.y + 1, w: Math.max(0, level.w - 2), h: Math.max(0, level.h - 2) });
      for (const cell of cells) {
        tiles.push({
          symbol: cell.entry.row.symbol, level: cell.entry.row.level, layerId: layer.id, layer: layer.label,
          value: cell.value, change: cell.entry.row.change, x: cell.x, y: cell.y, w: cell.w, h: cell.h
        });
      }
    }
  }
  return { groups, tiles };
}
