import { HuntBoard } from "./HuntBoard.tsx";

function App() {
  return (
    <div className="app">
      <div className="header">
        <div className="header-left">
          <h1>SINGUHUNT</h1>
          <p className="subtitle">Singularity Hunting Game // EVE Frontier</p>
        </div>
      </div>

      <HuntBoard />

      <div className="footer">
        SinguHunt on Sui Testnet
      </div>
    </div>
  );
}

export default App;
