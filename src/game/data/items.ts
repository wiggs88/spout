// ── Item Registry ──────────────────────────────────────────────
// Central definitions for all items with per-level stats and upgrade costs.
// Costs are [tier1, tier2, tier3] ore amounts (brown, yellow, blue).

export interface HookStats { range: number; frames: number; cooldown: number; energyCost: number }
export interface AuraStats { pullRange: number; pullSpeed: number; drain: number }
export interface RocketStats { speed: number; cooldown: number; blastRadius: number; energyCost: number }
export interface CarveStats { radius: number; halfCycle: number; drain: number }
export interface DynamoStats { regenBonus: number }
export interface FlashlightStats { fogRadius: number }

export type ItemStats = HookStats | AuraStats | RocketStats | CarveStats | DynamoStats | FlashlightStats;

export interface ItemDef {
  id: string;
  name: string;
  type: 'active' | 'passive';
  maxLevel: number;
  levels: ItemStats[];
  costs: [number, number, number][]; // ore cost per level
}

export const ITEM_DEFS: ItemDef[] = [
  {
    id: 'hook', name: 'Hook', type: 'active', maxLevel: 3,
    levels: [
      { range: 40, frames: 10, cooldown: 700, energyCost: 18 },
      { range: 64, frames: 10, cooldown: 500, energyCost: 15 },
      { range: 90, frames: 8, cooldown: 350, energyCost: 12 },
    ],
    costs: [[4, 0, 0], [8, 2, 0], [16, 6, 2]],
  },
  {
    id: 'aura', name: 'Aura', type: 'active', maxLevel: 3,
    levels: [
      { pullRange: 25, pullSpeed: 1.0, drain: 12 },
      { pullRange: 40, pullSpeed: 1.5, drain: 10 },
      { pullRange: 55, pullSpeed: 2.0, drain: 8 },
    ],
    costs: [[3, 0, 0], [6, 3, 0], [12, 6, 2]],
  },
  {
    id: 'rocket', name: 'Rocket', type: 'active', maxLevel: 3,
    levels: [
      { speed: 3, cooldown: 1000, blastRadius: 18, energyCost: 22 },
      { speed: 4, cooldown: 800, blastRadius: 27, energyCost: 20 },
      { speed: 5, cooldown: 600, blastRadius: 35, energyCost: 18 },
    ],
    costs: [[5, 0, 0], [10, 4, 0], [20, 8, 3]],
  },
  {
    id: 'carve', name: 'Carve', type: 'active', maxLevel: 3,
    levels: [
      { radius: 12, halfCycle: 70, drain: 18 },
      { radius: 20, halfCycle: 60, drain: 15 },
      { radius: 28, halfCycle: 50, drain: 12 },
    ],
    costs: [[4, 0, 0], [8, 3, 0], [16, 7, 2]],
  },
  {
    id: 'dynamo', name: 'Dynamo', type: 'passive', maxLevel: 3,
    levels: [
      { regenBonus: 3 },
      { regenBonus: 5 },
      { regenBonus: 8 },
    ],
    costs: [[3, 0, 0], [5, 2, 0], [10, 5, 2]],
  },
  {
    id: 'flashlight', name: 'Flashlight', type: 'passive', maxLevel: 3,
    levels: [
      { fogRadius: 0.30 },
      { fogRadius: 0.45 },
      { fogRadius: 1.5 },
    ],
    costs: [[3, 0, 0], [6, 2, 0], [12, 5, 2]],
  },
];

export function getItemDef(id: string): ItemDef | undefined {
  return ITEM_DEFS.find(d => d.id === id);
}

export function getItemStats(id: string, level: number): ItemStats | undefined {
  const def = getItemDef(id);
  if (!def || level < 1 || level > def.maxLevel) return undefined;
  return def.levels[level - 1];
}
