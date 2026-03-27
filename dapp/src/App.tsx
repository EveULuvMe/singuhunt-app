import { Suspense, lazy } from "react";

const HuntBoard = lazy(() =>
  import("./HuntBoard.tsx").then((m) => ({ default: m.HuntBoard }))
);

function App() {
  return (
    <div className="app">
      <div className="header">
        <div className="header-left">
          <h1>SINGUHUNT</h1>
          <p className="subtitle">Singularity Hunting Game // EVE Frontier</p>
        </div>
      </div>

      <Suspense fallback={<div className="loading">INITIALIZING...</div>}>
        <HuntBoard />
      </Suspense>

      <div className="footer">
        SinguHunt on Sui Testnet
      </div>
    </div>
  );
}

export default App;
