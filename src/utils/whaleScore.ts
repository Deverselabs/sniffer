import type { IndustryProfile, WalletData } from "../api/types";

export type { IndustryProfile };

export interface ScoringWeights {
  t1WalletWealth: number;
  t2GamblingSignal: number;
  t3TransactionVolume: number;
  t4WalletAge: number;
  t5UniqueSenders: number;
  t6AvgDepositSize: number;
  t7RecentActivity: number;
  t8LargeDepositCount: number;
  t9BalanceStrength: number;
  t10RiskAdjustment: number;
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
    weights: {
      t1WalletWealth: 15,
      t2GamblingSignal: 18,
      t3TransactionVolume: 10,
      t4WalletAge: 8,
      t5UniqueSenders: 8,
      t6AvgDepositSize: 10,
      t7RecentActivity: 10,
      t8LargeDepositCount: 10,
      t9BalanceStrength: 6,
      t10RiskAdjustment: 5,
    },
  },
  risk: {
    label: "Risk & Compliance",
    emoji: "🛡️",
    description: "Flag suspicious wallets. Penalise mixers, new wallets, and unknown sources.",
    weights: {
      t1WalletWealth: 12,
      t2GamblingSignal: 8,
      t3TransactionVolume: 12,
      t4WalletAge: 12,
      t5UniqueSenders: 8,
      t6AvgDepositSize: 8,
      t7RecentActivity: 10,
      t8LargeDepositCount: 10,
      t9BalanceStrength: 15,
      t10RiskAdjustment: 5,
    },
  },
  marketing: {
    label: "Marketing & CRM",
    emoji: "📣",
    description: "Find wealthy wallets worth targeting. Balance and volume are everything.",
    weights: {
      t1WalletWealth: 18,
      t2GamblingSignal: 6,
      t3TransactionVolume: 12,
      t4WalletAge: 8,
      t5UniqueSenders: 10,
      t6AvgDepositSize: 12,
      t7RecentActivity: 10,
      t8LargeDepositCount: 10,
      t9BalanceStrength: 9,
      t10RiskAdjustment: 5,
    },
  },
  exchange: {
    label: "Crypto Exchange",
    emoji: "🏦",
    description: "Identify active traders. DEX usage and tx frequency are the top signals.",
    weights: {
      t1WalletWealth: 14,
      t2GamblingSignal: 14,
      t3TransactionVolume: 14,
      t4WalletAge: 8,
      t5UniqueSenders: 10,
      t6AvgDepositSize: 10,
      t7RecentActivity: 10,
      t8LargeDepositCount: 10,
      t9BalanceStrength: 5,
      t10RiskAdjustment: 5,
    },
  },
  defi: {
    label: "DeFi Protocol",
    emoji: "⚡",
    description: "Find liquidity providers and power users. Volume and age signal loyalty.",
    weights: {
      t1WalletWealth: 15,
      t2GamblingSignal: 10,
      t3TransactionVolume: 15,
      t4WalletAge: 10,
      t5UniqueSenders: 10,
      t6AvgDepositSize: 10,
      t7RecentActivity: 10,
      t8LargeDepositCount: 10,
      t9BalanceStrength: 5,
      t10RiskAdjustment: 5,
    },
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

export interface TierBreakdown {
  id: string;
  label: string;
  points: number;
  max: number;
}

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
  tiers: TierBreakdown[];
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

  const t1WalletWealth =
    totalUsdReceived >= 250000
      ? weightedScore(weights.t1WalletWealth, 1)
      : totalUsdReceived >= 50000
        ? weightedScore(weights.t1WalletWealth, 0.8)
        : totalUsdReceived >= 10000
          ? weightedScore(weights.t1WalletWealth, 0.48)
          : totalUsdReceived >= 1000
            ? weightedScore(weights.t1WalletWealth, 0.2)
            : 0;

  const gamblingTxCount = data.incomingTx.filter((tx) =>
    GAMBLING_CONTRACTS.has(tx.from.toLowerCase())
  ).length;
  const gamblingPlatforms = new Set(
    data.incomingTx
      .filter((tx) => GAMBLING_CONTRACTS.has(tx.from.toLowerCase()))
      .map((tx) => tx.from.toLowerCase())
  ).size;
  const ninetyDaysAgo = now - 90 * 24 * 60 * 60;
  const gamblingLast90d = data.incomingTx.filter(
    (tx) => tx.timestamp >= ninetyDaysAgo && GAMBLING_CONTRACTS.has(tx.from.toLowerCase())
  ).length;
  const latestGamblingTx = data.incomingTx
    .filter((tx) => GAMBLING_CONTRACTS.has(tx.from.toLowerCase()))
    .sort((a, b) => b.timestamp - a.timestamp)[0];
  const recencyDays = latestGamblingTx
    ? (now - latestGamblingTx.timestamp) / (24 * 60 * 60)
    : Number.POSITIVE_INFINITY;
  const baseGamblingRatio =
    gamblingTxCount >= 30 ? 1 : gamblingTxCount >= 10 ? 0.8 : gamblingTxCount >= 3 ? 0.57 : gamblingTxCount >= 1 ? 0.29 : 0;
  const platformBonus = Math.min(0.2, gamblingPlatforms * 0.03);
  const frequencyBonus = gamblingLast90d >= 20 ? 0.15 : gamblingLast90d >= 8 ? 0.1 : gamblingLast90d >= 3 ? 0.05 : 0;
  const recencyBonus = recencyDays <= 7 ? 0.1 : recencyDays <= 30 ? 0.05 : 0;
  const gambling = weightedScore(
    weights.t2GamblingSignal,
    Math.min(1, baseGamblingRatio + platformBonus + frequencyBonus + recencyBonus)
  );

  const age =
    walletAgeDays >= 730
      ? weightedScore(weights.t4WalletAge, 1)
      : walletAgeDays >= 365
        ? weightedScore(weights.t4WalletAge, 0.75)
        : walletAgeDays >= 180
          ? weightedScore(weights.t4WalletAge, 0.5)
          : walletAgeDays >= 30
            ? weightedScore(weights.t4WalletAge, 0.25)
            : 0;

  const volume =
    totalEthReceived >= 100
      ? weightedScore(weights.t3TransactionVolume, 1)
      : totalEthReceived >= 50
        ? weightedScore(weights.t3TransactionVolume, 0.75)
        : totalEthReceived >= 10
          ? weightedScore(weights.t3TransactionVolume, 0.5)
          : totalEthReceived >= 1
            ? weightedScore(weights.t3TransactionVolume, 0.25)
            : 0;

  const uniqueSenders = data.uniqueSenders;
  const t5UniqueSenders =
    uniqueSenders >= 100
      ? weightedScore(weights.t5UniqueSenders, 1)
      : uniqueSenders >= 40
        ? weightedScore(weights.t5UniqueSenders, 0.75)
        : uniqueSenders >= 15
          ? weightedScore(weights.t5UniqueSenders, 0.5)
          : uniqueSenders >= 5
            ? weightedScore(weights.t5UniqueSenders, 0.25)
            : 0;
  const avgDeposit = totalEthReceived / Math.max(1, data.incomingTx.length);
  const t6AvgDepositSize =
    avgDeposit >= 5
      ? weightedScore(weights.t6AvgDepositSize, 1)
      : avgDeposit >= 2
        ? weightedScore(weights.t6AvgDepositSize, 0.75)
        : avgDeposit >= 0.5
          ? weightedScore(weights.t6AvgDepositSize, 0.5)
          : avgDeposit >= 0.1
            ? weightedScore(weights.t6AvgDepositSize, 0.25)
            : 0;
  const recentTxCount = data.incomingTx.filter((tx) => tx.timestamp >= now - 30 * 24 * 60 * 60).length;
  const t7RecentActivity =
    recentTxCount >= 50
      ? weightedScore(weights.t7RecentActivity, 1)
      : recentTxCount >= 20
        ? weightedScore(weights.t7RecentActivity, 0.75)
        : recentTxCount >= 8
          ? weightedScore(weights.t7RecentActivity, 0.5)
          : recentTxCount >= 3
            ? weightedScore(weights.t7RecentActivity, 0.25)
            : 0;
  const largeDeposits = data.incomingTx.filter((tx) => tx.valueEth >= 10).length;
  const t8LargeDepositCount =
    largeDeposits >= 10
      ? weightedScore(weights.t8LargeDepositCount, 1)
      : largeDeposits >= 5
        ? weightedScore(weights.t8LargeDepositCount, 0.75)
        : largeDeposits >= 2
          ? weightedScore(weights.t8LargeDepositCount, 0.5)
          : largeDeposits >= 1
            ? weightedScore(weights.t8LargeDepositCount, 0.25)
            : 0;
  const t9BalanceStrength =
    data.balanceEth >= 200
      ? weightedScore(weights.t9BalanceStrength, 1)
      : data.balanceEth >= 75
        ? weightedScore(weights.t9BalanceStrength, 0.75)
        : data.balanceEth >= 20
          ? weightedScore(weights.t9BalanceStrength, 0.5)
          : data.balanceEth >= 5
            ? weightedScore(weights.t9BalanceStrength, 0.25)
            : 0;
  const t10RiskAdjustment = weightedScore(
    weights.t10RiskAdjustment,
    gamblingTxCount >= 10 ? 1 : gamblingTxCount >= 3 ? 0.5 : 0
  );

  const tiers: TierBreakdown[] = [
    { id: "t1", label: "T1 Wallet Wealth", points: t1WalletWealth, max: weights.t1WalletWealth },
    { id: "t2", label: "T2 Gambling Signal", points: gambling, max: weights.t2GamblingSignal },
    { id: "t3", label: "T3 Transaction Volume", points: volume, max: weights.t3TransactionVolume },
    { id: "t4", label: "T4 Wallet Age", points: age, max: weights.t4WalletAge },
    { id: "t5", label: "T5 Unique Senders", points: t5UniqueSenders, max: weights.t5UniqueSenders },
    { id: "t6", label: "T6 Avg Deposit Size", points: t6AvgDepositSize, max: weights.t6AvgDepositSize },
    { id: "t7", label: "T7 Recent Activity", points: t7RecentActivity, max: weights.t7RecentActivity },
    { id: "t8", label: "T8 Large Deposit Count", points: t8LargeDepositCount, max: weights.t8LargeDepositCount },
    { id: "t9", label: "T9 Balance Strength", points: t9BalanceStrength, max: weights.t9BalanceStrength },
    { id: "t10", label: "T10 Risk Adjustment", points: t10RiskAdjustment, max: weights.t10RiskAdjustment },
  ];

  const total = Math.min(100, Math.round(tiers.reduce((sum, t) => sum + t.points, 0)));

  if (total >= 90) {
    return {
      total,
      wealth: t1WalletWealth,
      gambling,
      age,
      volume,
      tier: "Instant VIP",
      tierColor: "green",
      gamblingTxCount,
      totalEthReceived,
      walletAgeDays,
      profile,
      tiers,
    };
  }
  if (total >= 70) {
    return {
      total,
      wealth: t1WalletWealth,
      gambling,
      age,
      volume,
      tier: "VIP",
      tierColor: "purple",
      gamblingTxCount,
      totalEthReceived,
      walletAgeDays,
      profile,
      tiers,
    };
  }
  if (total >= 50) {
    return {
      total,
      wealth: t1WalletWealth,
      gambling,
      age,
      volume,
      tier: "Warm Lead",
      tierColor: "blue",
      gamblingTxCount,
      totalEthReceived,
      walletAgeDays,
      profile,
      tiers,
    };
  }
  if (total >= 30) {
    return {
      total,
      wealth: t1WalletWealth,
      gambling,
      age,
      volume,
      tier: "Monitor",
      tierColor: "amber",
      gamblingTxCount,
      totalEthReceived,
      walletAgeDays,
      profile,
      tiers,
    };
  }

  return {
    total,
    wealth: t1WalletWealth,
    gambling,
    age,
    volume,
    tier: "Standard",
    tierColor: "red",
    gamblingTxCount,
    totalEthReceived,
    walletAgeDays,
    profile,
    tiers,
  };
}
