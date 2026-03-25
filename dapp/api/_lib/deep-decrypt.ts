export type DeepDecryptQuestion = {
  id: number;
  prompt: string;
  answer: string;
  aliases?: string[];
  sourceUrl: string;
};

const OVERVIEW = "https://whitepaper.evefrontier.com/game/overview";
const GAME_VISION = "https://whitepaper.evefrontier.com/game";
const SMART_ASSEMBLIES = "https://whitepaper.evefrontier.com/digital-physics/smart-assemblies";
const SMART_OBJECTS = "https://whitepaper.evefrontier.com/technology/blockchain-foundations/smart-objects";
const TRIBES = "https://whitepaper.evefrontier.com/game/tribes-and-syndicates";
const REBUILDING = "https://whitepaper.evefrontier.com/decentralization-governance-and-autonomy/rebuilding-the-frontier";
const TUTORIAL = "https://support.evefrontier.com/hc/en-us/articles/20347890149916-EVE-Frontier-first-steps-Tutorial";
const FLIGHT = "https://support.evefrontier.com/hc/en-us/articles/24824074439964-EVE-Frontier-Flight-2-0-Direct-Control-Real-Skill";
const STRUCTURES = "https://support.evefrontier.com/hc/en-us/articles/20533051255452-Core-Deployable-Structures";
const JUMP = "https://support.evefrontier.com/hc/en-us/articles/20555308267036-Interstellar-Jump-Drive";
const STARMAP = "https://support.evefrontier.com/hc/en-us/articles/19354879882396-Using-the-Star-Map-in-Frontier-A-Guide-for-Explorers";
const TERMINAL = "https://support.evefrontier.com/hc/en-us/articles/20218856847132-The-Terminal";
const HOW_TO_PLAY = "https://support.evefrontier.com/hc/en-us/articles/17357341545628-How-do-I-play-EVE-Frontier";
const FOUNDER = "https://evefrontier.com/en/news/introducing-founder-access";
const WALLET = "https://support.evefrontier.com/hc/en-us/articles/20893081903516-Your-EVE-Frontier-Wallet-recovery-options";
const UI = "https://support.evefrontier.com/hc/en-us/articles/17174868215708-UI-Breakdown";

export const QUESTION_BANK: DeepDecryptQuestion[] = [
  { id: 1, prompt: "在 EVE Frontier 中，玩家角色被稱為什麼？", answer: "Riders", sourceUrl: OVERVIEW },
  { id: 2, prompt: "Frontier 是由幾個超大質量黑洞擴張形成的？", answer: "3", aliases: ["three", "three black holes"], sourceUrl: OVERVIEW },
  { id: 3, prompt: "官方概覽提到 Frontier 目前有超過多少個星系？", answer: "24000", aliases: ["24,000", "over 24000", "over 24,000"], sourceUrl: OVERVIEW },
  { id: 4, prompt: "玩家在 Frontier 核心循環中開採的是哪種物質？", answer: "Crude Matter", sourceUrl: OVERVIEW },
  { id: 5, prompt: "概覽中把哪條定律放在策略決策核心？", answer: "Law of Conservation of Energy", aliases: ["conservation of energy"], sourceUrl: OVERVIEW },
  { id: 6, prompt: "EVE Frontier 的背景是繁榮文明的什麼之後？", answer: "collapse", aliases: ["a collapse", "the collapse"], sourceUrl: OVERVIEW },
  { id: 7, prompt: "Frontier 的危險來自時間與什麼混亂？", answer: "gravitational chaos", aliases: ["gravity chaos"], sourceUrl: OVERVIEW },
  { id: 8, prompt: "概覽中提到玩家可以建立貿易什麼？", answer: "trade empires", aliases: ["empire", "trade empire"], sourceUrl: OVERVIEW },
  { id: 9, prompt: "在概覽裡，玩家被賦予重新點燃文明最後什麼的任務？", answer: "spark", aliases: ["the last spark", "last spark"], sourceUrl: OVERVIEW },
  { id: 10, prompt: "為了建立 Frontier 模型，天體物理學家模擬的是幾個合併中的星系？", answer: "3", aliases: ["three", "three galaxies"], sourceUrl: OVERVIEW },

  { id: 11, prompt: "官方願景頁中延續的社群口號是什麼？", answer: "EVE Forever", sourceUrl: GAME_VISION },
  { id: 12, prompt: "官方說 EVE Online 在推出時被稱為世界上第一個什麼遊戲？", answer: "database game", aliases: ["the world's first-ever database game"], sourceUrl: GAME_VISION },
  { id: 13, prompt: "官方認為 EVE Online 無法真正成為『EVE Forever』的核心原因是什麼性質？", answer: "centralized", aliases: ["centralization", "centralized technology and ownership"], sourceUrl: GAME_VISION },
  { id: 14, prompt: "EVE Frontier 被描述為單分片的什麼 MMO？", answer: "space survival", aliases: ["space survival mmo"], sourceUrl: GAME_VISION },
  { id: 15, prompt: "官方希望 EVE Frontier 能比創造者更長久地什麼？", answer: "live forever", aliases: ["live", "last forever"], sourceUrl: GAME_VISION },
  { id: 16, prompt: "願景頁指出，為了真正永續的線上文明，社群需要真正的 agency 與真正的什麼？", answer: "ownership", aliases: ["real ownership"], sourceUrl: GAME_VISION },
  { id: 17, prompt: "願景頁中說世界不應該有單一什麼失效點？", answer: "point of failure", aliases: ["single point of failure"], sourceUrl: GAME_VISION },
  { id: 18, prompt: "EVE Frontier 想推進的是下一代什麼 worlds？", answer: "virtual", aliases: ["virtual worlds"], sourceUrl: GAME_VISION },
  { id: 19, prompt: "官方說玩家應該能持續即時擴張宇宙，靠的是什麼生成內容？", answer: "user-generated content", aliases: ["ugc"], sourceUrl: GAME_VISION },
  { id: 20, prompt: "願景頁提到，若 CCP Games 或冰島不存在，哪款遊戲也會不存在？", answer: "EVE Online", sourceUrl: GAME_VISION },

  { id: 21, prompt: "Smart Assemblies 主要使用哪種語言來治理可編程功能？", answer: "Solidity", sourceUrl: SMART_ASSEMBLIES },
  { id: 22, prompt: "官方將 Smart Assemblies 描述為哪一種新類別的遊戲內物件？", answer: "in-game objects", aliases: ["objects"], sourceUrl: SMART_ASSEMBLIES },
  { id: 23, prompt: "官方白皮書說所有玩家建造的結構都從哪種模板開始？", answer: "Smart Assembly", aliases: ["smart assembly template"], sourceUrl: SMART_ASSEMBLIES },
  { id: 24, prompt: "白皮書中舉例，Smart Storage Unit 可以被寫成 marketplace、quest giver，或什麼系統？", answer: "bounty hunter system", aliases: ["bounty hunter"], sourceUrl: SMART_ASSEMBLIES },
  { id: 25, prompt: "任何和 Smart Assembly 相關的功能都必須配置什麼消耗需求？", answer: "Fuel", aliases: ["fuel consumption", "fuel requirement"], sourceUrl: SMART_ASSEMBLIES },
  { id: 26, prompt: "官方說若不持續投入能量保護 Smart Assemblies，物件就會開始什麼？", answer: "degrade", aliases: ["degradation"], sourceUrl: SMART_ASSEMBLIES },
  { id: 27, prompt: "白皮書指出，Smart Assemblies 與概念物件都存在 Frontier 的哪條鏈上？", answer: "Frontier blockchain", sourceUrl: SMART_ASSEMBLIES },
  { id: 28, prompt: "白皮書說 Frontier blockchain 是 Ethereum 上的哪一層？", answer: "layer 2", aliases: ["l2"], sourceUrl: SMART_ASSEMBLIES },
  { id: 29, prompt: "官方說任何被建立的 Smart Object 會自動成為哪種型態？", answer: "Singleton", sourceUrl: SMART_ASSEMBLIES },
  { id: 30, prompt: "Smart Assemblies 白皮書最後引用了哪位物理學家的名言？", answer: "Stephen Hawking", aliases: ["hawking"], sourceUrl: SMART_ASSEMBLIES },

  { id: 31, prompt: "Smart Objects 指的是能透過可編程層連接遊戲外部的什麼？", answer: "object", aliases: ["objects"], sourceUrl: SMART_OBJECTS },
  { id: 32, prompt: "官方說目前 Smart Object 實體包含 Smart Assemblies 與哪種角色物件？", answer: "Smart Characters", aliases: ["smart character"], sourceUrl: SMART_OBJECTS },
  { id: 33, prompt: "Smart Assemblies 基礎設施包括 storage facilities、trading posts、defenses，還有更多什麼？", answer: "infrastructure", aliases: ["infrastructure systems"], sourceUrl: SMART_OBJECTS },
  { id: 34, prompt: "官方列出的 Smart Assembly 類型中，SSU 的全名是什麼？", answer: "Smart Storage Unit", aliases: ["ssu"], sourceUrl: SMART_OBJECTS },
  { id: 35, prompt: "官方列出的可建 Smart Assembly 類型之一，可自訂 targeting logic 的是什麼？", answer: "Smart Turret", sourceUrl: SMART_OBJECTS },
  { id: 36, prompt: "官方列出的可建 Smart Assembly 類型之一，可自訂 gate access logic 的是什麼？", answer: "Smart Gate", sourceUrl: SMART_OBJECTS },
  { id: 37, prompt: "Smart Assemblies 在白皮書中是透過哪個開發框架被『帶到生命』的？", answer: "MUD", sourceUrl: SMART_OBJECTS },
  { id: 38, prompt: "MUD 的一個特點是把 save state 與什麼分離？", answer: "logic", sourceUrl: SMART_OBJECTS },
  { id: 39, prompt: "官方說玩家操控基礎設施可編程介面時使用的是哪種開源語言？", answer: "Solidity", sourceUrl: SMART_OBJECTS },
  { id: 40, prompt: "Smart Objects 白皮書說『Smart』指的是物件能連到哪種世界之外的可編程層？", answer: "blockchain", aliases: ["the blockchain"], sourceUrl: SMART_OBJECTS },

  { id: 41, prompt: "Tribes 通常由幾十到幾百名玩家組成？", answer: "tens to hundreds", aliases: ["tens", "hundreds"], sourceUrl: TRIBES },
  { id: 42, prompt: "由多個 Tribes 組成、更大的聯盟叫什麼？", answer: "Syndicates", aliases: ["syndicate"], sourceUrl: TRIBES },
  { id: 43, prompt: "官方說 Tribes 與 Syndicates 是透過遊戲內 UI 建立並在鏈上如何？", answer: "formalized onchain", aliases: ["formalized", "onchain"], sourceUrl: TRIBES },
  { id: 44, prompt: "Tribes 與 Syndicates 的控制與權限，官方說由治理結構和什麼決定？", answer: "voting power", sourceUrl: TRIBES },
  { id: 45, prompt: "官方說這些組織存在為鏈上實體，並能被第三方開發者延展其什麼？", answer: "logic", aliases: ["logic and capabilities", "capabilities"], sourceUrl: TRIBES },
  { id: 46, prompt: "Tribes / Syndicates 可能依 mandate 分化，例如 trading、piracy，還有什麼？", answer: "defense", aliases: ["protection", "defense and protection"], sourceUrl: TRIBES },
  { id: 47, prompt: "管理風格可能從和平民主到什麼？", answer: "authoritarianism", aliases: ["deranged authoritarianism"], sourceUrl: TRIBES },
  { id: 48, prompt: "官方說重建文明本質上是一個什麼問題？", answer: "coordination problem", sourceUrl: TRIBES },
  { id: 49, prompt: "Tribes 白皮書指出 Frontier 不能被如何征服？", answer: "alone", aliases: ["not alone"], sourceUrl: TRIBES },
  { id: 50, prompt: "Beyond function and structure, 個別 Riders 會聯合起來一起合作、密謀並大規模做什麼？", answer: "go to war", aliases: ["war"], sourceUrl: TRIBES },

  { id: 51, prompt: "Rebuilding the Frontier 頁面說，玩家從一開始就被賦予從頭開始做什麼？", answer: "rebuild the world", aliases: ["rebuilding the world"], sourceUrl: REBUILDING },
  { id: 52, prompt: "官方列舉玩家會在客戶端重建哪一種 network？", answer: "stargate network", aliases: ["the stargate network"], sourceUrl: REBUILDING },
  { id: 53, prompt: "官方希望透過哪一種 development 讓 Frontier 進一步擴張？", answer: "third-party development", aliases: ["third party development"], sourceUrl: REBUILDING },
  { id: 54, prompt: "白皮書說為了促成外部開發，他們會 open-source 什麼？", answer: "the code", aliases: ["code"], sourceUrl: REBUILDING },
  { id: 55, prompt: "Rebuilding 頁面說 Smart Assemblies 讓玩家能把自訂 UI 用哪種標準在遊戲內呈現？", answer: "HTML 5", aliases: ["html5"], sourceUrl: REBUILDING },
  { id: 56, prompt: "官方說先進密碼學技術會在 client 與鏈上環境之間安全且可驗證地傳遞什麼？", answer: "data", sourceUrl: REBUILDING },
  { id: 57, prompt: "Rebuilding 頁面中，開放與自訂的最終目的是解鎖無邊的什麼？", answer: "creativity", aliases: ["boundless creativity"], sourceUrl: REBUILDING },
  { id: 58, prompt: "官方說所有這些能力都會由哪個 technology stack 與底層 blockchain 啟用？", answer: "EVE Frontier", aliases: ["eve frontier technology stack"], sourceUrl: REBUILDING },
  { id: 59, prompt: "頁面說玩家不該被初始條件、系統與功能所什麼？", answer: "unconstrained", aliases: ["constrained"], sourceUrl: REBUILDING },
  { id: 60, prompt: "官方說玩家能透過第三方 app 將自己的 smart contracts 什麼 in-game？", answer: "bring to life", aliases: ["manifest"], sourceUrl: REBUILDING },

  { id: 61, prompt: "新手教學一開始，玩家會在 Starter System 裡單獨醒來。官方稱那裡是安靜的什麼？", answer: "starter system", sourceUrl: TUTORIAL },
  { id: 62, prompt: "Tutorial 提到新手會學到四大支柱：Piloting、Base Building、Industry，還有什麼？", answer: "Combat", sourceUrl: TUTORIAL },
  { id: 63, prompt: "教學前期的主要目標是打造第一艘真正的船，它叫什麼？", answer: "Reflex", sourceUrl: TUTORIAL },
  { id: 64, prompt: "角色建立後，玩家最初駕駛的微型起始船叫什麼？", answer: "Wend", sourceUrl: TUTORIAL },
  { id: 65, prompt: "Tutorial 說打造 Reflex hull 後，就能離開 Starter System 進入真正的什麼？", answer: "Frontier", sourceUrl: TUTORIAL },
  { id: 66, prompt: "打造 Reflex 需要從 Wrecks、Asteroids，與哪類 Deployable Structures 取得資源？", answer: "Refineries and Printers", aliases: ["refineries", "printers"], sourceUrl: TUTORIAL },
  { id: 67, prompt: "官方說教學不會只是倒一堆 menu，而是推著玩家一步一步去什麼？", answer: "do things", aliases: ["do things step by step"], sourceUrl: TUTORIAL },
  { id: 68, prompt: "Tutorial 說玩家離開新手區後，宇宙會開始試著做什麼？", answer: "kill you", sourceUrl: TUTORIAL },
  { id: 69, prompt: "玩家一開始從什麼地方撿燃料與戰利品？", answer: "Wrecks", sourceUrl: TUTORIAL },
  { id: 70, prompt: "Tutorial 指出礦石是從哪種太空物件採集？", answer: "Asteroids", sourceUrl: TUTORIAL },

  { id: 71, prompt: "Flight 2.0 中，哪兩個鍵負責 pitch？", answer: "W and S", aliases: ["w s", "w/s"], sourceUrl: FLIGHT },
  { id: 72, prompt: "Flight 2.0 中，哪兩個鍵負責 yaw？", answer: "A and D", aliases: ["a d", "a/d"], sourceUrl: FLIGHT },
  { id: 73, prompt: "Flight 2.0 中，加速前進用哪個鍵？", answer: "E", sourceUrl: FLIGHT },
  { id: 74, prompt: "Flight 2.0 中，退回零速以下進入 reverse 用哪個鍵？", answer: "Q", sourceUrl: FLIGHT },
  { id: 75, prompt: "想讓航向『set and forget』時，要按住哪組組合鍵？", answer: "Alt + WASD", aliases: ["alt wasd"], sourceUrl: FLIGHT },
  { id: 76, prompt: "立即完全停船並鎖定 stabilizer 的快捷鍵是什麼？", answer: "Ctrl + Space", aliases: ["ctrl space"], sourceUrl: FLIGHT },
  { id: 77, prompt: "官方說 WASD flight 帶來的不是 autopilot，而是什麼？", answer: "you", aliases: ["YOU"], sourceUrl: FLIGHT },
  { id: 78, prompt: "Flight 2.0 說 ship speed 現在分成幾個 forward tiers？", answer: "4", aliases: ["four"], sourceUrl: FLIGHT },
  { id: 79, prompt: "舊式 interaction system 仍可用於 asteroids、keeps、stargates，還有什麼？", answer: "Smart Assemblies", sourceUrl: FLIGHT },
  { id: 80, prompt: "自訂飛行快捷鍵要去 Settings → Shortcuts → 哪個分頁？", answer: "Navigation", sourceUrl: FLIGHT },

  { id: 81, prompt: "Core Deployable Structures 文中，提供基本服務與 ship storage 的結構叫什麼？", answer: "Refuge", sourceUrl: STRUCTURES },
  { id: 82, prompt: "Refuge 的建造成本是 50 個什麼 Matrix？", answer: "Platinum - Palladium Matrix", aliases: ["platinum palladium matrix"], sourceUrl: STRUCTURES },
  { id: 83, prompt: "Portable Refinery 主要用來做什麼？", answer: "Processes common resources", aliases: ["process resources", "process common resources"], sourceUrl: STRUCTURES },
  { id: 84, prompt: "Portable Printer 主要用來製作哪一類 gear？", answer: "essential survival gear", aliases: ["survival gear"], sourceUrl: STRUCTURES },
  { id: 85, prompt: "Portable Storage 的用途是提供哪種 expedition resource storage？", answer: "limited", aliases: ["limited storage"], sourceUrl: STRUCTURES },
  { id: 86, prompt: "進階結構需要的 home base anchor 叫什麼？", answer: "Network Node", sourceUrl: STRUCTURES },
  { id: 87, prompt: "Network Node 必須放在什麼點位？", answer: "L-point", aliases: ["l point"], sourceUrl: STRUCTURES },
  { id: 88, prompt: "Portable Refinery 的建造成本是 50 個什麼？", answer: "Feldspar Crystal", aliases: ["feldspar crystals"], sourceUrl: STRUCTURES },
  { id: 89, prompt: "Portable Printer 的建造成本是 50 個什麼 Matrix？", answer: "Hydrated Sulfide Matrix", aliases: ["hydrated sulfide matrix"], sourceUrl: STRUCTURES },
  { id: 90, prompt: "Network Node 的 build time 是多久？", answer: "30 seconds", aliases: ["30", "30s"], sourceUrl: STRUCTURES },

  { id: 91, prompt: "Interstellar Jump Drive 讓玩家在不使用什麼的情況下跨系統跳躍？", answer: "gates", aliases: ["stargates"], sourceUrl: JUMP },
  { id: 92, prompt: "Jump Drive 的可跳躍距離與燃料之外，還取決於船的什麼？", answer: "mass", sourceUrl: JUMP },
  { id: 93, prompt: "如果 inventory 載重越多，Jump Drive 的可跳距離會如何？", answer: "shorter", aliases: ["be shorter", "decrease"], sourceUrl: JUMP },
  { id: 94, prompt: "Star Map 指南說，地圖上星系通常顯示成什麼形狀？", answer: "small dots", aliases: ["dots"], sourceUrl: STARMAP },
  { id: 95, prompt: "Star Map 可以顯示你或你所在 Tribe 的哪種 network？", answer: "smart gate network", aliases: ["smart gate"], sourceUrl: STARMAP },
  { id: 96, prompt: "The Terminal 裡，哪個分頁可查看角色曾加入過的 Tribes 歷史？", answer: "History", aliases: ["history tab"], sourceUrl: TERMINAL },
  { id: 97, prompt: "The Terminal 中顯示 LUX 交易紀錄的是哪個分頁？", answer: "Wallet", sourceUrl: TERMINAL },
  { id: 98, prompt: "UI Breakdown 說畫面右上角顯示已鎖定目標的是哪個區塊？", answer: "Locked Targets", sourceUrl: UI },
  { id: 99, prompt: "How do I play EVE Frontier? 一文指出 closed alpha 伺服器自哪一天起 24/7 開放？", answer: "December 10 2024", aliases: ["2024-12-10", "december 10th 2024"], sourceUrl: HOW_TO_PLAY },
  { id: 100, prompt: "Wallet recovery 文章中，EVE Frontier 使用的錢包名稱是什麼？", answer: "EVE Vault", aliases: ["vault"], sourceUrl: WALLET },
];

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function normalizeAnswer(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9+\- ]+/g, " ")
    .replace(/\s+/g, " ");
}

export function getUtc8DateKey(date = new Date()) {
  const utc = date.getTime() + date.getTimezoneOffset() * 60_000;
  const utc8 = new Date(utc + 8 * 60 * 60 * 1000);
  return `${utc8.getUTCFullYear()}-${pad(utc8.getUTCMonth() + 1)}-${pad(utc8.getUTCDate())}`;
}

export function getQuestionIndexForDateKey(dateKey: string) {
  const start = Date.parse("2026-01-01T00:00:00+08:00");
  const current = Date.parse(`${dateKey}T00:00:00+08:00`);
  const days = Math.floor((current - start) / 86_400_000);
  const mod = ((days % QUESTION_BANK.length) + QUESTION_BANK.length) % QUESTION_BANK.length;
  return mod;
}

export function getQuestionOfTheDay(date = new Date()) {
  const dateKey = getUtc8DateKey(date);
  const index = getQuestionIndexForDateKey(dateKey);
  return {
    dateKey,
    index,
    question: QUESTION_BANK[index],
  };
}

export function isCorrectAnswer(question: DeepDecryptQuestion, guess: string) {
  const normalizedGuess = normalizeAnswer(guess);
  if (!normalizedGuess) return false;
  const accepted = [question.answer, ...(question.aliases || [])].map(normalizeAnswer);
  return accepted.includes(normalizedGuess);
}
