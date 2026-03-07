import { useState } from 'react';
import { ITEM_DEFS, ItemDef } from '../game/data/items';
import { CanvasBounds } from './HUD';

const ORE_HUD_COLORS = ['#8B6B4A', '#9B9555', '#55659B'];

const ITEM_ICONS: Record<string, string> = {
  hook: '⚓', aura: '◎', rocket: '↑', carve: '⛏', dynamo: 'ϟ', flashlight: '◈',
};

const GREEN = '#44ff88';
const DIM_GREEN = '#2a5a3a';
const DIM = '#3a5a3a';
const CARD_INNER_HEIGHT = 72;

export interface ShopActions {
  buy: (itemId: string) => boolean;
  upgrade: (itemId: string) => boolean;
  equip: (itemId: string, slot: number) => boolean;
  unequip: (itemId: string) => boolean;
}

interface ShopOverlayProps {
  bounds: CanvasBounds;
  ores: number[];
  ownedItems: Record<string, number>;
  equipped: (string | null)[];
  actions: ShopActions;
}

function OreCost({ cost }: { cost: [number, number, number] }) {
  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
      {cost.map((amount, i) => amount > 0 ? (
        <span key={i} style={{ color: ORE_HUD_COLORS[i], display: 'inline-flex', alignItems: 'center', gap: 2 }}>
          {amount}
          <span style={{
            display: 'inline-block',
            width: 5,
            height: 5,
            background: ORE_HUD_COLORS[i],
            borderRadius: 0,
            clipPath: i === 1 ? 'polygon(50% 0%, 0% 100%, 100% 100%)' : undefined,
            transform: i === 2 ? 'rotate(45deg)' : undefined,
          }} />
        </span>
      ) : null)}
    </span>
  );
}

function canAfford(cost: [number, number, number], ores: number[]): boolean {
  return cost.every((c, i) => (ores[i] ?? 0) >= c);
}

function LevelBoxes({ level, max }: { level: number; max: number }) {
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {Array.from({ length: max }).map((_, i) => (
        <div key={i} style={{
          width: 7,
          height: 7,
          border: `1px solid ${i < level ? GREEN : DIM}`,
          background: i < level ? GREEN : 'transparent',
        }} />
      ))}
    </div>
  );
}

/* Card with dashed border and + corners */
function TerminalCard({ children, onClick, style }: {
  children: React.ReactNode;
  onClick?: () => void;
  style?: React.CSSProperties;
}) {
  return (
    <div onClick={onClick} style={{
      position: 'relative',
      border: `1px dashed ${DIM}`,
      borderRadius: 6,
      padding: '8px 3px',
      fontFamily: 'monospace',
      boxSizing: 'border-box',
      ...style,
    }}>
      <span style={{ position: 'absolute', top: -5, left: -3, color: DIM, fontSize: '8px', lineHeight: '8px' }}>+</span>
      <span style={{ position: 'absolute', top: -5, right: -3, color: DIM, fontSize: '8px', lineHeight: '8px' }}>+</span>
      <span style={{ position: 'absolute', bottom: -5, left: -3, color: DIM, fontSize: '8px', lineHeight: '8px' }}>+</span>
      <span style={{ position: 'absolute', bottom: -5, right: -3, color: DIM, fontSize: '8px', lineHeight: '8px' }}>+</span>
      {children}
    </div>
  );
}

function ItemCard({ def, level, ores, actions }: {
  def: ItemDef;
  level: number;
  ores: number[];
  actions: ShopActions;
}) {
  const owned = level > 0;
  const maxed = level >= def.maxLevel;
  const cost = owned ? (maxed ? null : def.costs[level]) : def.costs[0];
  const affordable = cost ? canAfford(cost as [number, number, number], ores) : false;
  const textColor = owned ? GREEN : DIM_GREEN;

  return (
    <TerminalCard>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 3,
        justifyContent: 'space-between',
        height: CARD_INNER_HEIGHT,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <span style={{ fontSize: 12, color: textColor }}>
            {ITEM_ICONS[def.id] ?? '?'}
          </span>
          <span style={{ color: textColor, fontSize: '7px', letterSpacing: 1 }}>
            {def.name.toUpperCase()}
          </span>
        </div>
        <div style={{ visibility: owned ? 'visible' : 'hidden' }}>
          <LevelBoxes level={level} max={def.maxLevel} />
        </div>
        <div style={{ fontSize: '7px', display: 'flex', alignItems: 'center' }}>
          {cost ? <OreCost cost={cost as [number, number, number]} /> : <span>&nbsp;</span>}
        </div>
        <button
          onClick={() => {
            if (maxed) return;
            owned ? actions.upgrade(def.id) : actions.buy(def.id);
          }}
          disabled={maxed || !affordable}
          style={{
            background: 'none',
            border: `1px solid ${maxed ? DIM : affordable ? GREEN : DIM}`,
            color: maxed ? DIM : affordable ? GREEN : DIM,
            fontFamily: 'monospace',
            fontSize: '7px',
            padding: '1px 4px',
            cursor: maxed ? 'default' : affordable ? 'pointer' : 'default',
            letterSpacing: 1,
          }}
        >
          {maxed ? 'MAX' : owned ? 'UPGRADE' : 'BUY'}
        </button>
      </div>
    </TerminalCard>
  );
}

function ShipTab({ equipped, ownedItems, actions }: {
  equipped: (string | null)[];
  ownedItems: Record<string, number>;
  actions: ShopActions;
}) {
  const ownedList = ITEM_DEFS.filter(d => (ownedItems[d.id] ?? 0) > 0);
  const equippedCount = equipped.filter(e => e !== null).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Item grid — same 3-col layout as shop */}
      {ownedList.length > 0 ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 6,
        }}>
          {ownedList.map(def => {
            const level = ownedItems[def.id] ?? 0;
            const isEquipped = equipped.includes(def.id);
            return (
              <TerminalCard
                key={def.id}
                onClick={() => {
                  if (isEquipped) {
                    actions.unequip(def.id);
                  } else {
                    // Find first empty slot
                    const emptySlot = equipped.indexOf(null);
                    if (emptySlot !== -1) {
                      actions.equip(def.id, emptySlot);
                    }
                  }
                }}
                style={{
                  cursor: 'pointer',
                  opacity: isEquipped ? 1 : 0.5,
                  borderColor: isEquipped ? '#666' : DIM,
                }}
              >
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 3,
                  justifyContent: 'space-between',
                  height: CARD_INNER_HEIGHT,
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                    <span style={{ fontSize: 12, color: isEquipped ? '#ccc' : '#666' }}>
                      {ITEM_ICONS[def.id] ?? '?'}
                    </span>
                    <span style={{ color: isEquipped ? '#ccc' : '#666', fontSize: '7px', letterSpacing: 1 }}>
                      {def.name.toUpperCase()}
                    </span>
                  </div>
                  <LevelBoxes level={level} max={def.maxLevel} />
                  <span>&nbsp;</span>
                  <span style={{
                    fontSize: '7px',
                    letterSpacing: 1,
                    color: isEquipped ? '#ccc' : DIM,
                  }}>
                    {isEquipped ? 'EQUIPPED' : 'NOT EQUIPPED'}
                  </span>
                </div>
              </TerminalCard>
            );
          })}
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 6,
            visibility: 'hidden',
          }}>
            {ITEM_DEFS.map(def => (
              <TerminalCard key={def.id}>
                <div style={{ height: CARD_INNER_HEIGHT }} />
              </TerminalCard>
            ))}
          </div>
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: DIM,
            fontSize: '8px',
            fontFamily: 'monospace',
          }}>
            No items owned yet
          </div>
        </div>
      )}

      {/* 3 equip slot indicators */}
      <div style={{ display: 'flex', gap: 4 }}>
        {[0, 1, 2].map(slot => {
          const filled = slot < equippedCount;
          return (
            <div key={slot} style={{
              flex: 1,
              height: 5,
              border: `1px solid ${filled ? '#ccc' : '#333'}`,
              background: filled ? '#ccc' : 'transparent',
              opacity: 0.85,
              borderRadius: 2,
            }} />
          );
        })}
      </div>
    </div>
  );
}

export function ShopOverlay({ bounds, ores, ownedItems, equipped, actions }: ShopOverlayProps) {
  const [activeTab, setActiveTab] = useState<'shop' | 'equip'>('shop');
  const isShop = activeTab === 'shop';

  return (
    <div style={{
      position: 'absolute',
      left: bounds.left,
      top: bounds.top,
      width: bounds.width,
      height: bounds.height,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      pointerEvents: 'none',
    }}>
    <div style={{
      background: 'rgba(0, 0, 0, 0.92)',
      border: `1px dashed ${DIM}`,
      borderRadius: 6,
      pointerEvents: 'auto',
      display: 'flex',
      flexDirection: 'column',
      padding: '8px 14px',
      gap: 4,
      width: bounds.width * 0.55,
      fontFamily: 'monospace',
      boxSizing: 'border-box',
      position: 'relative',
    }}>
      {/* Tab bar */}
      <div style={{
        display: 'flex',
        borderBottom: `1px dashed ${DIM}`,
        marginBottom: 2,
      }}>
        {(['shop', 'equip'] as const).map(tab => {
          const active = activeTab === tab;
          const isShopTab = tab === 'shop';
          const label = isShopTab ? 'SHOP' : 'SHIP';
          const activeColor = isShopTab ? GREEN : '#ccc';
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                flex: 1,
                background: active ? (isShopTab ? 'rgba(68,255,136,0.12)' : 'rgba(255,255,255,0.06)') : 'none',
                border: 'none',
                borderBottom: active ? `2px solid ${activeColor}` : '2px solid transparent',
                color: active ? activeColor : '#555',
                fontFamily: 'monospace',
                fontSize: '10px',
                padding: '3px 0',
                cursor: 'pointer',
                letterSpacing: 2,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div style={{ overflow: 'hidden' }}>
        {activeTab === 'shop' && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 6,
            paddingBottom: 13,
          }}>
            {ITEM_DEFS.map(def => (
              <ItemCard
                key={def.id}
                def={def}
                level={ownedItems[def.id] ?? 0}
                ores={ores}
                actions={actions}
              />
            ))}
          </div>
        )}
        {activeTab === 'equip' && (
          <ShipTab equipped={equipped} ownedItems={ownedItems} actions={actions} />
        )}
      </div>

      {/* Footer */}
      <div style={{
        borderTop: `1px dashed ${DIM}`,
        paddingTop: 4,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ display: 'inline-flex', gap: 6, fontSize: '8px', alignItems: 'center' }}>
          <span style={{ color: DIM, fontSize: '7px', letterSpacing: 1 }}>ORE:</span>
          {ores.map((count, i) => (
            <span key={i} style={{ color: ORE_HUD_COLORS[i], display: 'inline-flex', alignItems: 'center', gap: 2 }}>
              <span style={{
                display: 'inline-block', width: 5, height: 5,
                background: ORE_HUD_COLORS[i],
                borderRadius: i === 0 ? '50%' : 0,
                clipPath: i === 1 ? 'polygon(50% 0%, 0% 100%, 100% 100%)' : undefined,
                transform: i === 2 ? 'rotate(45deg)' : undefined,
              }} />
              {count.toLocaleString()}
            </span>
          ))}
        </div>
        <span style={{ color: DIM, fontSize: '7px', letterSpacing: 1 }}>TAB · ESC</span>
      </div>
    </div>
    </div>
  );
}
