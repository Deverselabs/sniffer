import type { WalletData } from "../api";

export type IndustryProfile = "casino" | "risk" | "marketing" | "exchange" | "defi";

export interface ScoringWeights {
  wealth: number;
  gambling: number;
  age: number;
  volume: number;
}

export const INDUSTRY_PROFILES: Record<
  IndustryProfile,
  {
    label: string;
    emoji: string;
    description: string;
    weights: ScoringWeights;
  }
> = {
  casino: {
    label: "Crypto Casino",
    emoji: "🎰",
    description: "Identify high-rollers and degens. Gambling interactions are the top signal.",
    weights: { wealth: 20, gambling: 40, age: 20, volume: 20 },
  },
  risk: {
    label: "Risk & Compliance",
    emoji: "🛡️",
    description: "Flag suspicious wallets. Penalise mixers, new wallets, and unknown sources.",
    weights: { wealth: 15, gambling: 10, age: 40, volume: 35 },
  },
  marketing: {
    label: "Marketing & CRM",
    emoji: "📣",
    description: "Find wealthy wallets worth targeting. Balance and volume are everything.",
    weights: { wealth: 40, gambling: 10, age: 20, volume: 30 },
  },
  exchange: {
    label: "Crypto Exchange",
    emoji: "🏦",
    description: "Identify active traders. DEX usage and tx frequency are the top signals.",
    weights: { wealth: 20, gambling: 35, age: 15, volume: 30 },
  },
  defi: {
    label: "DeFi Protocol",
    emoji: "⚡",
    description: "Find liquidity providers and power users. Volume and age signal loyalty.",
    weights: { wealth: 25, gambling: 20, age: 25, volume: 30 },
  },
};

export const GAMBLING_CONTRACTS = new Set([
  "0x0000000000000000000000000000000000000000",
  "0xb5c457ddb4ce3312a6c5a2b056a1652bd542a208",
  "0x28ade70258dab1f7f3f4f4e0f2c29f4e1a45e0f5",
  "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45",
  "0x1111111254fb6c44bac0bed2854e76f90643097d",
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  "0xdac17f958d2ee523a2206206994597c13d831ec7",
  "0x6b175474e89094c44da98b954eedeac495271d0f",
]);

export interface ScoreBreakdown {
  total: number;
  wealth: number;
  gambling: number;
  age: number;
  volume: number;
  tier: "Instant VIP" | "VIP" | "Warm Lead" | "Monitor" | "Standard";
  tierColor: "green" | "purple" | "blue" | "amber" | "red";
  gamblingTxCount: number;
  totalEthReceived: number;
  walletAgeDays: number;
  profile: IndustryProfile;
}

function weightedScore(weight: number, percent: number): number {
  return Math.round(weight * percent);
}

export function computeWhaleScore(
  data: WalletData,
  profile: IndustryProfile = "casino"
): ScoreBreakdown {
  const weights = INDUSTRY_PROFILES[profile].weights;
  const now = Date.now() / 1000;
  const oldestTimestamp =
    data.incomingTx.length > 0
      ? Math.min(...data.incomingTx.map((tx) => tx.timestamp))
      : null;

  const walletAgeDays = oldestTimestamp
    ? (now - oldestTimestamp) / (24 * 60 * 60)
    : 0;
  const totalEthReceived = data.incomingTx.reduce((sum, tx) => sum + tx.valueEth, 0);
  const totalUsdReceived = totalEthReceived * (data.ethPriceUsd ?? 0);

  const wealth =
    totalUsdReceived >= 250000
      ? weightedScore(weights.wealth, 1)
      : totalUsdReceived >= 50000
        ? weightedScore(weights.wealth, 0.8)
        : totalUsdReceived >= 10000
          ? weightedScore(weights.wealth, 0.48)
          : totalUsdReceived >= 1000
            ? weightedScore(weights.wealth, 0.2)
            : 0;

  const gamblingTxCount = data.incomingTx.filter((tx) =>
    GAMBLING_CONTRACTS.has(tx.from.toLowerCase())
  ).length;
  const gambling =
    gamblingTxCount >= 30
      ? weightedScore(weights.gambling, 1)
      : gamblingTxCount >= 10
        ? weightedScore(weights.gambling, 0.8)
        : gamblingTxCount >= 3
          ? weightedScore(weights.gambling, 0.57)
          : gamblingTxCount >= 1
            ? weightedScore(weights.gambling, 0.29)
            : 0;

  const age =
    walletAgeDays >= 730
      ? weightedScore(weights.age, 1)
      : walletAgeDays >= 365
        ? weightedScore(weights.age, 0.75)
        : walletAgeDays >= 180
          ? weightedScore(weights.age, 0.5)
          : walletAgeDays >= 30
            ? weightedScore(weights.age, 0.25)
            : 0;

  const volume =
    totalEthReceived >= 100
      ? weightedScore(weights.volume, 1)
      : totalEthReceived >= 50
        ? weightedScore(weights.volume, 0.75)
        : totalEthReceived >= 10
          ? weightedScore(weights.volume, 0.5)
          : totalEthReceived >= 1
            ? weightedScore(weights.volume, 0.25)
            : 0;

  const total = Math.min(100, Math.round(wealth + gambling + age + volume));

  if (total >= 90) {
    return {
      total,
      wealth,
      gambling,
      age,
      volume,
      tier: "Instant VIP",
      tierColor: "green",
      gamblingTxCount,
      totalEthReceived,
      walletAgeDays,
      profile,
    };
  }
  if (total >= 70) {
    return {
      total,
      wealth,
      gambling,
      age,
      volume,
      tier: "VIP",
      tierColor: "purple",
      gamblingTxCount,
      totalEthReceived,
      walletAgeDays,
      profile,
    };
  }
  if (total >= 50) {
    return {
      total,
      wealth,
      gambling,
      age,
      volume,
      tier: "Warm Lead",
      tierColor: "blue",
      gamblingTxCount,
      totalEthReceived,
      walletAgeDays,
      profile,
    };
  }
  if (total >= 30) {
    return {
      total,
      wealth,
      gambling,
      age,
      volume,
      tier: "Monitor",
      tierColor: "amber",
      gamblingTxCount,
      totalEthReceived,
      walletAgeDays,
      profile,
    };
  }

  return {
    total,
    wealth,
    gambling,
    age,
    volume,
    tier: "Standard",
    tierColor: "red",
    gamblingTxCount,
    totalEthReceived,
    walletAgeDays,
    profile,
  };
}
