interface MainMenuProps {
  onStart: () => void;
}

export function MainMenu({ onStart }: MainMenuProps) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#000',
        fontFamily: 'monospace',
        color: '#fff',
      }}
    >
      <h1 style={{ fontSize: '48px', letterSpacing: '12px', marginBottom: '32px' }}>
        SPOUT
      </h1>
      <p style={{ color: '#888', marginBottom: '24px', fontSize: '14px' }}>
        A cave-flying game
      </p>
      <button
        onClick={onStart}
        style={{
          background: 'none',
          border: '1px solid #555',
          color: '#fff',
          padding: '12px 32px',
          fontSize: '16px',
          fontFamily: 'monospace',
          cursor: 'pointer',
          letterSpacing: '4px',
        }}
      >
        START
      </button>
      <div style={{ marginTop: '48px', color: '#555', fontSize: '11px', textAlign: 'center' }}>
        <p>ARROWS or A/D to rotate</p>
        <p>SPACE, W, or SHIFT to thrust</p>
        <p style={{ marginTop: '8px' }}>Blast through the cave to ascend!</p>
      </div>
    </div>
  );
}
