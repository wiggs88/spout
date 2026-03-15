import { useState, useRef, useEffect } from 'react';
import { debugConfig } from '../game/debug';
import { ShopOverlay, ShopActions } from './ShopOverlay';
import { getItemDef } from '../game/data/items';

const overlayStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  pointerEvents: 'none',
  fontFamily: 'monospace',
  color: '#ccc',
};

export const frameStyle: React.CSSProperties = {
  pointerEvents: 'none',
  fontFamily: 'monospace',
  border: '1px solid #333',
  background: 'rgba(0, 0, 0, 0.4)',
  boxSizing: 'border-box',
  borderRadius: 2,
};

const ORE_HUD_COLORS = ['#8B6B4A', '#9B9555', '#55659B'];

export interface CanvasBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface HUDProps {
  score: number;
  gameOver: boolean;
  gameStarted: boolean;
  health: number;
  energy: number;
  ores: number[];
  equipped: (string | null)[];
  ownedItems: Record<string, number>;
  toggles: Record<string, boolean>;
  slotCooldowns: boolean[];
  shopOpen: boolean;
  nearShop: boolean;
  shopMarkerPos: { x: number; y: number } | null;
  shopScreenPos: { x: number; y: number } | null;
  hubMarkerPos: { x: number; y: number } | null;
  oreCollects: { tier: number; screenX: number; screenY: number }[];
  nearPedestal: { shape: string; color: number; screenX: number; screenY: number; placed: boolean } | null;
  canvasBounds: CanvasBounds | null;
  shopActions: ShopActions;
}

function StatBar({ value, max = 100, color, side, bounds, icon, iconColor, introAnim = false, introDelay = 0 }: {
  value: number;
  max?: number;
  color: string;
  side: 'left' | 'right';
  bounds: CanvasBounds;
  icon: string;
  iconColor: string;
  introAnim?: boolean;
  introDelay?: number;
}) {
  // Intro phases: 0=hidden, 1=icon flickers, 2=frame fades in, 3=bar fills, 4=ready
  const [phase, setPhase] = useState(introAnim ? 0 : 4);
  const prevValueRef = useRef(value);
  const [hitKey, setHitKey] = useState(0);

  useEffect(() => {
    if (!introAnim) return;
    const d = introDelay;
    const timers = [
      setTimeout(() => setPhase(1), d + 200),
      setTimeout(() => setPhase(2), d + 700),
      setTimeout(() => setPhase(3), d + 1000),
      setTimeout(() => setPhase(4), d + 2400),
    ];
    return () => timers.forEach(clearTimeout);
  }, [introAnim, introDelay]);

  useEffect(() => {
    if (phase < 4) return;
    if (value < prevValueRef.current) {
      setHitKey(k => k + 1);
    }
    prevValueRef.current = value;
  }, [value, phase]);

  if (introAnim && phase === 0) return null;

  const showHeart = phase >= 1;
  const showFrame = phase >= 2;
  const introFill = phase === 3;
  const ready = phase >= 4;

  const ratio = ready
    ? Math.max(0, Math.min(1, value / max))
    : introFill ? 1 : 0;

  const barHeight = bounds.height * 0.18;
  const barWidth = 5;
  const pad = 2;
  const border = 1;
  const outerWidth = barWidth + pad * 2 + border * 2;
  const outerHeight = barHeight + pad * 2 + border * 2;
  const iconSize = 10;
  const iconGap = 3;
  const totalHeight = outerHeight + iconGap + iconSize;
  const inset = 6;
  const x = side === 'left'
    ? bounds.left + inset
    : bounds.left + bounds.width - inset - outerWidth;

  return (
    <div style={{
      position: 'absolute',
      left: x,
      top: bounds.top + (bounds.height - totalHeight) / 2,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      pointerEvents: 'none',
    }}>
      <div style={{
        ...frameStyle,
        boxSizing: 'content-box',
        width: barWidth,
        height: barHeight,
        padding: pad,
        opacity: showFrame ? 1 : 0,
        transition: 'opacity 0.3s ease-out',
      }}>
        <div style={{
          width: '100%',
          height: '100%',
          position: 'relative',
        }}>
          <div
            key={ready ? `fill-${hitKey}` : 'intro'}
            style={{
              width: '100%',
              height: `${ratio * 100}%`,
              background: color,
              position: 'absolute',
              bottom: 0,
              transition: introFill ? 'height 1.3s ease-out' : 'height 60ms linear',
              animation: introFill
                ? 'oreFlickerIn 0.6s ease-out'
                : ready && hitKey > 0 ? 'hudHitFlash 0.25s ease-out' : undefined,
            }}
          />
        </div>
      </div>
      <span
        key={ready ? `icon-${hitKey}` : 'intro-icon'}
        style={{
          fontSize: iconSize,
          lineHeight: `${iconSize}px`,
          marginTop: iconGap,
          color: iconColor,
          opacity: showHeart ? 1 : 0,
          animation: showHeart && phase === 1
            ? 'oreFlickerIn 0.45s ease-out'
            : ready && hitKey > 0
              ? 'hudHitFlash 0.25s ease-out'
              : undefined,
        }}
      >{icon}</span>
    </div>
  );
}

function OreCounter({ ores, bounds }: { ores: number[]; bounds: CanvasBounds }) {
  const prevOresRef = useRef<number[]>([0, 0, 0]);
  const [flashKeys, setFlashKeys] = useState<number[]>([0, 0, 0]);

  useEffect(() => {
    const prev = prevOresRef.current;
    const newKeys = [...flashKeys];
    let changed = false;
    for (let i = 0; i < 3; i++) {
      if (ores[i] > prev[i]) {
        newKeys[i]++;
        changed = true;
      }
    }
    if (changed) setFlashKeys(newKeys);
    prevOresRef.current = [...ores];
  }, [ores]);

  const visible = ores.map((count, i) => ({ count, i })).filter(o => o.count > 0);
  if (visible.length === 0) return null;

  return (
    <>
      <div style={{
        ...frameStyle,
        position: 'absolute',
        top: bounds.top + 1,
        left: bounds.left + bounds.width / 2,
        transform: 'translateX(-50%)',
        fontSize: '11px',
        display: 'inline-flex',
        gap: 10,
        padding: '2px 6px',
      }}>
        {visible.map(({ count, i }) => (
          <span
            key={`${i}-${flashKeys[i]}`}
            style={{
              color: ORE_HUD_COLORS[i],
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              animation: 'oreFlickerIn 0.45s ease-out',
            }}
          >
            <span style={{
              display: 'inline-block',
              width: 6,
              height: 6,
              background: ORE_HUD_COLORS[i],
              borderRadius: 0,
              clipPath: i === 1 ? 'polygon(50% 0%, 0% 100%, 100% 100%)' : undefined,
              transform: i === 2 ? 'rotate(45deg)' : undefined,
            }} />
            {count}
          </span>
        ))}
      </div>
    </>
  );
}

const ITEM_BAR_ICONS: Record<string, string> = {
  hook: '⚓', aura: '◎', rocket: '↑', carve: '⛏', dynamo: 'ϟ', flashlight: '◈',
};

function ItemBar({ equipped, toggles, cooldowns, bounds, shopOpen }: {
  equipped: (string | null)[];
  toggles: Record<string, boolean>;
  cooldowns: boolean[];
  bounds: CanvasBounds;
  shopOpen: boolean;
}) {
  // Track which items are "new" (just equipped after closing shop)
  const prevEquippedRef = useRef<(string | null)[]>([null, null, null]);
  const wasShopOpenRef = useRef(false);
  const [newSlots, setNewSlots] = useState<boolean[]>([false, false, false]);

  useEffect(() => {
    // Detect shop closing: was open, now closed
    if (wasShopOpenRef.current && !shopOpen) {
      const prev = prevEquippedRef.current;
      const fresh = equipped.map((id, i) => id !== null && id !== prev[i]);
      if (fresh.some(Boolean)) {
        setNewSlots(fresh);
        // Clear flicker after animation
        const timer = setTimeout(() => setNewSlots([false, false, false]), 600);
        return () => clearTimeout(timer);
      }
    }
    wasShopOpenRef.current = shopOpen;
    prevEquippedRef.current = [...equipped];
  }, [equipped, shopOpen]);

  // Only show slots that have items
  const filledSlots = equipped
    .map((itemId, i) => ({ itemId, i }))
    .filter(s => s.itemId !== null);

  if (filledSlots.length === 0 || shopOpen) return null;

  return (
    <div style={{
      position: 'absolute',
      top: bounds.top + bounds.height - 30,
      left: bounds.left + bounds.width / 2,
      transform: 'translateX(-50%)',
      display: 'flex',
      gap: 6,
      fontFamily: 'monospace',
      pointerEvents: 'none',
    }}>
      {filledSlots.map(({ itemId, i }) => {
        const def = itemId ? getItemDef(itemId) : null;
        const icon = def ? (ITEM_BAR_ICONS[def.id] ?? '?') : null;
        const onCooldown = cooldowns[i] ?? false;
        const isActive = itemId ? (toggles[itemId] ?? false) : false;
        const bright = isActive ? 1 : 0.6;
        const borderColor = isActive ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.12)';
        const bg = isActive ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.45)';
        const isNew = newSlots[i];
        return (
          <div key={`${i}-${itemId}`} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 0,
            opacity: onCooldown ? 0.3 : bright,
            border: `1px solid ${borderColor}`,
            borderRadius: 5,
            background: bg,
            padding: '2px 2px',
            animation: isNew ? 'oreFlickerIn 0.6s ease-out' : undefined,
          }}>
            {/* Slot number */}
            <span style={{
              color: '#888',
              fontSize: '12px',
              width: 14,
              textAlign: 'center',
            }}>
              {i + 1}
            </span>
            {/* Icon box */}
            <span style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 20,
              height: 20,
              borderRadius: 4,
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.1)',
              fontSize: '12px',
              color: '#888',
            }}>
              {icon ?? ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ShopIndicator({ pos, bounds }: { pos: { x: number; y: number }; bounds: CanvasBounds }) {
  const left = bounds.left + pos.x * bounds.width;
  const top = bounds.top + pos.y * bounds.height;
  return (
    <div style={{
      ...frameStyle,
      position: 'absolute',
      top: top - 20,
      left,
      transform: 'translateX(-50%)',
      fontSize: '9px',
      color: '#44ff88',
      padding: '1px 6px',
      border: '1px solid #44ff88',
    }}>
      TAB to open shop
    </div>
  );
}

function ShopDirectionMarker({ pos, bounds }: { pos: { x: number; y: number }; bounds: CanvasBounds }) {
  const [showTime] = useState(() => Date.now());
  const [flickerTick, setFlickerTick] = useState(0);

  // Drive flicker animation for the first 2 seconds
  useEffect(() => {
    const age = Date.now() - showTime;
    if (age >= 2000) return;
    const id = setInterval(() => setFlickerTick(t => t + 1), 50);
    const timeout = setTimeout(() => clearInterval(id), 2000 - age);
    return () => { clearInterval(id); clearTimeout(timeout); };
  }, [showTime]);

  const age = Date.now() - showTime;
  const introFlicker = age < 2000;
  // During intro, toggle visibility every tick
  if (introFlicker && flickerTick % 2 === 1) return null;

  const left = bounds.left + pos.x * bounds.width;
  const top = bounds.top + pos.y * bounds.height;

  return (
    <div style={{
      ...frameStyle,
      position: 'absolute',
      left,
      top,
      transform: 'translate(-50%, -50%)',
      fontSize: '8px',
      color: '#44ff88',
      padding: '1px 5px',
      border: '1px solid #44ff88',
      opacity: 0.75,
      whiteSpace: 'nowrap',
    }}>
      SHOP
    </div>
  );
}

function HubDirectionMarker({ pos, bounds }: { pos: { x: number; y: number }; bounds: CanvasBounds }) {
  const [showTime] = useState(() => Date.now());
  const [flickerTick, setFlickerTick] = useState(0);

  useEffect(() => {
    const age = Date.now() - showTime;
    if (age >= 2000) return;
    const id = setInterval(() => setFlickerTick(t => t + 1), 50);
    const timeout = setTimeout(() => clearInterval(id), 2000 - age);
    return () => { clearInterval(id); clearTimeout(timeout); };
  }, [showTime]);

  const age = Date.now() - showTime;
  if (age < 2000 && flickerTick % 2 === 1) return null;

  const left = bounds.left + pos.x * bounds.width;
  const top = bounds.top + pos.y * bounds.height;

  return (
    <div style={{
      ...frameStyle,
      position: 'absolute',
      left,
      top,
      transform: 'translate(-50%, -50%)',
      fontSize: '8px',
      color: '#aaa',
      padding: '1px 5px',
      border: '1px solid #666',
      opacity: 0.75,
      whiteSpace: 'nowrap',
    }}>
      HUB
    </div>
  );
}

interface OrePopup {
  id: number;
  tier: number;
  x: number;
  y: number;
  born: number;
}

let popupIdCounter = 0;

function OreCollectPopups({ collects, bounds }: {
  collects: { tier: number; screenX: number; screenY: number }[];
  bounds: CanvasBounds;
}) {
  const [popups, setPopups] = useState<OrePopup[]>([]);

  useEffect(() => {
    if (collects.length === 0) return;
    const now = Date.now();
    const newPopups = collects.map(c => ({
      id: popupIdCounter++,
      tier: c.tier,
      x: bounds.left + c.screenX * bounds.width,
      y: bounds.top + c.screenY * bounds.height,
      born: now,
    }));
    setPopups(prev => [...prev, ...newPopups]);
  }, [collects, bounds]);

  // Clean up expired popups
  useEffect(() => {
    if (popups.length === 0) return;
    const timer = setTimeout(() => {
      const now = Date.now();
      setPopups(prev => prev.filter(p => now - p.born < 1800));
    }, 1850);
    return () => clearTimeout(timer);
  }, [popups]);

  return (
    <>
      {popups.map(p => {
        const age = Date.now() - p.born;
        const t = Math.min(1, age / 1800);
        const opacity = t < 0.1 ? t / 0.1 : t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
        const offsetY = -t * 20;
        return (
          <div key={p.id} style={{
            position: 'absolute',
            left: p.x,
            top: p.y + offsetY,
            transform: 'translate(-50%, -100%)',
            fontSize: '10px',
            fontFamily: 'monospace',
            fontWeight: 'bold',
            color: ORE_HUD_COLORS[p.tier - 1],
            opacity: Math.max(0, opacity),
            pointerEvents: 'none',
            background: 'rgba(0,0,0,0.75)',
            borderRadius: 3,
            padding: '1px 4px',
          }}>
            +1
          </div>
        );
      })}
    </>
  );
}

export function HUD({
  score, gameOver, gameStarted, health, energy, ores,
  equipped, ownedItems, toggles, slotCooldowns,
  shopOpen, nearShop, shopMarkerPos, shopScreenPos, hubMarkerPos, oreCollects, nearPedestal, canvasBounds, shopActions,
}: HUDProps) {
  const [threshold, setThreshold] = useState(0);

  const onThresholdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    setThreshold(v);
    debugConfig.wallThreshold = v;
  };

  return (
    <>
      <style>{`
        @keyframes oreFlickerIn {
          0% { opacity: 0; }
          10% { opacity: 0.7; }
          20% { opacity: 0.1; }
          35% { opacity: 0.85; }
          50% { opacity: 0.2; }
          65% { opacity: 0.95; }
          80% { opacity: 0.7; }
          100% { opacity: 1; }
        }
        @keyframes hudHitFlash {
          0% { opacity: 1; }
          25% { opacity: 0.1; }
          55% { opacity: 0.9; }
          100% { opacity: 1; }
        }
      `}</style>
      {gameStarted && canvasBounds && <OreCollectPopups collects={oreCollects} bounds={canvasBounds} />}
      {gameStarted && canvasBounds && <OreCounter ores={ores} bounds={canvasBounds} />}
      {gameStarted && !gameOver && canvasBounds && (
        <ItemBar equipped={equipped} toggles={toggles} cooldowns={slotCooldowns} bounds={canvasBounds} shopOpen={shopOpen} />
      )}
      {gameStarted && !gameOver && nearShop && !shopOpen && shopScreenPos && canvasBounds && (
        <ShopIndicator pos={shopScreenPos} bounds={canvasBounds} />
      )}
      {gameStarted && !gameOver && !shopOpen && shopMarkerPos && canvasBounds && (
        <ShopDirectionMarker pos={shopMarkerPos} bounds={canvasBounds} />
      )}
      {gameStarted && !gameOver && !shopOpen && hubMarkerPos && canvasBounds && (
        <HubDirectionMarker pos={hubMarkerPos} bounds={canvasBounds} />
      )}

      {gameStarted && !gameOver && canvasBounds && (
        <>
          <StatBar value={health} color="#c44" side="left" bounds={canvasBounds} icon="❤" iconColor="#c44" introAnim />
          <StatBar value={energy} color="#6899aa" side="right" bounds={canvasBounds} icon="ϟ" iconColor="#fff" introAnim introDelay={2600} />
        </>
      )}

      {shopOpen && canvasBounds && (
        <ShopOverlay
          bounds={canvasBounds}
          ores={ores}
          ownedItems={ownedItems}
          equipped={equipped}
          actions={shopActions}
        />
      )}

      {/* Start screen removed — intro sequence plays in-game */}

      {/* Debug panel */}
      <div style={{
        position: 'absolute',
        bottom: 10,
        right: 10,
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#444',
        pointerEvents: 'auto',
        userSelect: 'none',
      }}>
        <div style={{ marginBottom: 6, color: '#555', borderBottom: '1px solid #333', paddingBottom: 4 }}>
          DEBUG KEYS
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 6 }}>
          {[
            ['P', '+10 ore each'],
            ['L', 'Lvl 3 flashlight'],
            ['K', 'God mode (invincible + carve)'],
            ['M', 'Spawn artifact near ship'],
            ['J', 'Teleport to next artifact'],
            ['R', 'Restart (game over only)'],
          ].map(([key, desc]) => (
            <div key={key} style={{ display: 'flex', gap: 6 }}>
              <span style={{ color: '#666', width: 14, textAlign: 'right' }}>{key}</span>
              <span style={{ color: '#444' }}>{desc}</span>
            </div>
          ))}
        </div>
        <div style={{ marginBottom: 3, color: '#555' }}>
          WALL THRESHOLD: {threshold}
        </div>
        <input
          type="range"
          min={0}
          max={2}
          step={1}
          value={threshold}
          onChange={onThresholdChange}
          style={{ width: 120, accentColor: '#555', cursor: 'pointer' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', width: 120, color: '#333' }}>
          <span>dense</span>
          <span>open</span>
        </div>
      </div>

      {gameOver && (
        <div style={overlayStyle}>
          <div style={{ fontSize: '24px', color: '#888', marginBottom: '8px' }}>
            GAME OVER
          </div>
          <div style={{ fontSize: '16px', marginBottom: '16px' }}>
            SCORE: {score}
          </div>
          <div style={{ fontSize: '12px', color: '#888' }}>
            Press R to restart
          </div>
        </div>
      )}
    </>
  );
}
