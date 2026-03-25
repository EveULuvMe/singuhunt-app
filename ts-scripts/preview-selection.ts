/// Preview a daily random gate selection from the local gate config file.

import { randomInt } from "node:crypto";
import { loadGateConfig, getGateConfigPath } from "./utils/gate-config.js";

function shuffleInPlace<T>(items: T[]) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
}

async function main() {
  const gateConfig = loadGateConfig();
  const unique = new Map<string, { id: string; name: string; sourceIndex: number }>();

  gateConfig.pool.forEach((gate, index) => {
    if (!unique.has(gate.id.toLowerCase())) {
      unique.set(gate.id.toLowerCase(), {
        id: gate.id,
        name: gate.name,
        sourceIndex: index,
      });
    }
  });

  const pool = [...unique.values()];
  if (pool.length < gateConfig.requiredSinguCount) {
    throw new Error(
      `Need at least ${gateConfig.requiredSinguCount} unique gates in ${getGateConfigPath()}. Found ${pool.length}.`,
    );
  }

  shuffleInPlace(pool);
  const selected = pool.slice(0, gateConfig.requiredSinguCount);

  console.log(`Config source: ${getGateConfigPath()}`);
  console.log(`Required Singu Count: ${gateConfig.requiredSinguCount}`);
  console.log(`Pool size: ${gateConfig.pool.length}`);
  console.log(`Unique pool size: ${pool.length}`);
  console.log(`\nToday's sampled ${gateConfig.requiredSinguCount} gates:`);
  selected.forEach((gate, index) => {
    console.log(`  ${index + 1}. [pool ${gate.sourceIndex}] ${gate.name} (${gate.id})`);
  });
}

main().catch(console.error);
