import { ITEM_DEFS, getItemDef } from '../data/items';

export interface PlayerInventory {
  owned: Map<string, number>;        // itemId → level (1-indexed)
  equipped: (string | null)[];       // 3 slots
}

export class ShopSystem {
  readonly inventory: PlayerInventory = {
    owned: new Map(),
    equipped: [null, null, null],
  };

  /** Try to buy an item at level 1. Returns true on success. */
  buy(itemId: string, ores: number[]): boolean {
    const def = getItemDef(itemId);
    if (!def) return false;
    if (this.inventory.owned.has(itemId)) return false; // already owned
    const cost = def.costs[0];
    if (!this.canAfford(cost, ores)) return false;
    this.deductOres(cost, ores);
    this.inventory.owned.set(itemId, 1);
    return true;
  }

  /** Try to upgrade an owned item. Returns true on success. */
  upgrade(itemId: string, ores: number[]): boolean {
    const def = getItemDef(itemId);
    if (!def) return false;
    const currentLevel = this.inventory.owned.get(itemId);
    if (currentLevel === undefined) return false; // not owned
    if (currentLevel >= def.maxLevel) return false; // max level
    const cost = def.costs[currentLevel]; // costs[0]=L1 buy, costs[1]=L2 upgrade, etc.
    if (!this.canAfford(cost, ores)) return false;
    this.deductOres(cost, ores);
    this.inventory.owned.set(itemId, currentLevel + 1);
    return true;
  }

  /** Equip an owned item into a slot (0-2). Returns true on success. */
  equip(itemId: string, slot: number): boolean {
    if (slot < 0 || slot > 2) return false;
    if (!this.inventory.owned.has(itemId)) return false;
    // Unequip from current slot if already equipped elsewhere
    const existingSlot = this.inventory.equipped.indexOf(itemId);
    if (existingSlot !== -1) this.inventory.equipped[existingSlot] = null;
    this.inventory.equipped[slot] = itemId;
    return true;
  }

  /** Unequip an item from its slot. */
  unequip(itemId: string): boolean {
    const slot = this.inventory.equipped.indexOf(itemId);
    if (slot === -1) return false;
    this.inventory.equipped[slot] = null;
    return true;
  }

  /** Get the level of an owned item, or 0 if not owned. */
  getLevel(itemId: string): number {
    return this.inventory.owned.get(itemId) ?? 0;
  }

  /** Check if an item is currently equipped. */
  isEquipped(itemId: string): boolean {
    return this.inventory.equipped.includes(itemId);
  }

  /** Get the item equipped in a specific slot. */
  getEquippedInSlot(slot: number): string | null {
    return this.inventory.equipped[slot] ?? null;
  }

  /** Get upgrade cost for next level, or null if maxed/not owned. */
  getUpgradeCost(itemId: string): [number, number, number] | null {
    const def = getItemDef(itemId);
    if (!def) return null;
    const level = this.getLevel(itemId);
    if (level === 0) return null; // not owned, use buy cost
    if (level >= def.maxLevel) return null;
    return def.costs[level];
  }

  /** Get buy cost (level 1). */
  getBuyCost(itemId: string): [number, number, number] | null {
    const def = getItemDef(itemId);
    if (!def) return null;
    return def.costs[0];
  }

  private canAfford(cost: [number, number, number], ores: number[]): boolean {
    // ores is [tier1, tier2, tier3, tier4] (0-indexed, no unused slot)
    for (let i = 0; i < 3; i++) {
      if ((ores[i] ?? 0) < cost[i]) return false;
    }
    return true;
  }

  private deductOres(cost: [number, number, number], ores: number[]): void {
    for (let i = 0; i < 3; i++) {
      ores[i] -= cost[i];
    }
  }

  /** Serializable snapshot for HUD state. */
  getState(): { owned: Record<string, number>; equipped: (string | null)[] } {
    const owned: Record<string, number> = {};
    this.inventory.owned.forEach((level, id) => { owned[id] = level; });
    return { owned, equipped: [...this.inventory.equipped] };
  }
}
