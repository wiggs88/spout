import { useState } from 'react';
import { MainMenu } from './components/MainMenu';
import { GameCanvas } from './components/GameCanvas';

export function App() {
  const [playing, setPlaying] = useState(false);

  if (!playing) {
    return <MainMenu onStart={() => setPlaying(true)} />;
  }

  return <GameCanvas />;
}
