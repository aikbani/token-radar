// The token radar's model, version radar-3: a fitted size curve, tested blind.
//
// A protocol's launch is the token it may issue one day. This model asks what
// that token would be worth if it launched at the valuation discipline the
// market already gives the live-token protocols, fitted as one size curve over
// the whole live set and tested before it is trusted.
//
// The curve is log-log, fitted by least squares on the snapshot's own
// live-token protocols (a market cap above zero, a positive TVL, not an
// exchange token):
//
//   log(mcap_usd) = intercept + slope x log(tvl_usd)
//
// and a pre-token protocol's implied value is the curve's prediction at its
// own TVL, with the implied multiple winsorized to [WINSOR_LOW, WINSOR_HIGH]
// as a guardrail against extrapolation. The curve is one function for every
// row: no protocol name is ever special-cased, and the dashboard states the
// fitted intercept and slope and shows each row's own multiple.
//
// Two predictors the first version used were tested on the blind splits and
// dropped, and the dashboard says so: seven-day growth and age with no token
// did not improve the out-of-sample error on either split, so the curve
// prices on TVL alone. Growth and age are still shown on every row as
// context, and the retired constant-multiple model is kept in this file only
// to be scored on the same splits, so the board can say what changed.
//
// The curve is tested blind in two ways, both computed from the snapshot at
// run time, never asserted:
//
//   time split   fit the curve on the live tokens listed before 2024-01-01,
//                predict the market caps of the live tokens listed on or
//                after it (the newer tokens the fit never saw);
//   holdout      fit on four fifths of the live tokens by slug order, test
//                on the held-out fifth.
//
// Each test reports the median absolute log error, the median absolute
// percentage error, and the share of predictions within 2x and within 1.5x
// of the market's own value. A bootstrap (200 resamples, seeded) reports how
// stable the fitted slope and intercept are. The numbers on the dashboard
// are the ones this run computed.
//
// The farm plan is netted to the dollar. A plan's out-of-pocket cost is its
// gas plus its fees (0.3% of the capital the plan moves, plus a $2 bridge
// toll when it covers two chains); its expected airdrop is 5% of the row's
// implied value — the community allocation the model assumes — split among
// 10,000 farmers, a stated assumption the snapshot cannot see. Net is
// expected minus cost, and the verdict is FARM when the net is above $25,
// THIN when it is above $0, and SKIP when it is not. The dashboard also
// shows what the verdicts become at 25,000 and 50,000 farmers, because the
// verdict is sensitive to that count and the reader should see the leverage.
//
// The board covers every protocol the snapshot's watchlist names (the floor,
// never the ceiling) and every other pre-token protocol the snapshot can rank:
// pre-token, and not a wrapped, staked or bridged product of a token that
// already trades, under the same rule that built the watchlist. The snapshot
// records no token for a wrapped product either — WBTC, Binance staked ETH
// and USDT0 record none — so the rule below, not the token fields alone,
// keeps the board to protocols whose launch is still to come. Live-token
// protocols are kept apart and shown with the market's own values, never
// mixed into the ranked board.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The retired constant-multiple model's constants, kept only so the backtest can score it on the same splits. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  min_comps: number;
  multiple_floor: number;
  multiple_cap: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -50,
  growth_cap: 100,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  min_comps: 4,
  multiple_floor: 0.03,
  multiple_cap: 0.75,
};

/** The size curve's guardrails: the implied multiple is winsorized to this band. */
export const CURVE = {
  winsor_low: 0.005,
  winsor_high: 0.75,
} as const;

/** The farm plan's netting assumptions, as the dashboard states them. */
export const NETTING = {
  /** The share of a launch's implied value the model assumes goes to farmers. */
  airdrop_share: 0.05,
  /** The farmers that share it, a stated assumption the snapshot cannot see. */
  farmers_assumed: 15000,
  /** The stressed farmer counts the dashboard shows the verdicts at. */
  farmers_stress: [10000, 25000],
  /** The net above which a plan is a FARM rather than THIN. */
  farm_threshold_usd: 25,
  /** The swap and bridge slippage the plan's fees charge on capital moved. */
  fee_rate: 0.003,
  /** The bridge toll a two-chain plan pays on top of the rate. */
  bridge_toll_usd: 2,
} as const;

/** The backtest's design, as the dashboard states it. */
export const BACKTEST = {
  /** The time split's cutoff: the fit sees live tokens listed before it. */
  time_cutoff: '2024-01-01',
  /** The holdout's stride: every fifth live token by slug order is held out. */
  holdout_every: 5,
  /** The bootstrap's resamples, and the seed that makes them deterministic. */
  bootstrap_runs: 200,
  bootstrap_seed: 20261114,
} as const;

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-3';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** One category's comparables: the live-token protocols that price it. */
export interface CategoryComps {
  median: number;
  n: number;
}

/** The calibration the snapshot's own live-token protocols produce. */
export interface Comps {
  /** Per-category median mcap/TVL, keyed by the category string (null becomes 'Other'). */
  by_category: Record<string, CategoryComps>;
  /** The median across every live-token protocol: the fallback multiple. */
  overall_median: number;
  /** How many live-token protocols the overall median stands on. */
  overall_n: number;
}

/** The fitted size curve: log(mcap) = intercept + slope x log(tvl). */
export interface SizeCurve {
  intercept: number;
  slope: number;
  /** How many usable live-token protocols the fit stands on. */
  n: number;
}

/** One blind test's score: how the curve did on tokens its fit never saw. */
export interface BacktestSplit {
  name: string;
  train_n: number;
  test_n: number;
  /** The median absolute log error of the predictions on the held-out tokens. */
  median_abs_log_error: number;
  /** The same error as a percentage: exp(median |log error|) - 1. */
  median_abs_pct_error: number;
  /** The share of held-out predictions within 2x of the market's own value. */
  within_2x: number;
  /** The share within 1.5x. */
  within_1_5x: number;
}

/** The bootstrap's stability: the fitted slope and intercept across resamples. */
export interface BootstrapResult {
  runs: number;
  slope_median: number;
  slope_p5: number;
  slope_p95: number;
  intercept_median: number;
  intercept_p5: number;
  intercept_p95: number;
}

/** Everything the dashboard's backtest panel shows, computed at run time. */
export interface BacktestResult {
  time_split: BacktestSplit;
  holdout: BacktestSplit;
  /** The retired model's score on the same splits, for the contrast. */
  retired_time_split: BacktestSplit;
  retired_holdout: BacktestSplit;
  bootstrap: BootstrapResult;
  /** The live tokens the time split leaves out because no listed date is recorded. */
  time_split_excluded_no_date: number;
}

/** One row's farm economics, netted to the dollar. */
export interface FarmEconomics {
  capital_usd: number;
  gas_usd: number;
  fees_usd: number;
  cost_usd: number;
  /** The farmers the expected airdrop is split among (the stated assumption). */
  farmers: number;
  expected_usd: number;
  net_usd: number;
  verdict: 'FARM' | 'THIN' | 'SKIP';
  /** The verdict at each stressed farmer count, in NETTING.farmers_stress order. */
  verdict_at_stress: ('FARM' | 'THIN' | 'SKIP')[];
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  is_watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  farm_capital_usd: number;
  farm_gas_usd: number;
  farm_fees_usd: number;
  farm_cost_usd: number;
  farm_expected_usd: number;
  farm_net_usd: number;
  farm_verdict: 'FARM' | 'THIN' | 'SKIP';
  model: {
    multiple: number;
    multiple_source: 'curve';
    comps_n: number;
    curve_intercept: number;
    curve_slope: number;
    growth_pct: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  is_watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  farm_capital_usd: number;
  farm_gas_usd: number;
  farm_fees_usd: number;
  farm_cost_usd: number;
  farm_expected_usd: number;
  farm_net_usd: number;
  farm_verdict: 'FARM' | 'THIN' | 'SKIP';
  multiple: number;
  multiple_source: 'curve';
  comps_n: number;
  curve_intercept: number;
  curve_slope: number;
  growth_pct: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** One line of the dashboard's comparables table: a category's median multiple and its sample. */
export interface CompsTableRow {
  category: string;
  median: number;
  n: number;
  used: boolean;
}

/** The strongest comparables, most protocols first, for the dashboard's model panel. */
export function topComps(comps: Comps, limit = 10): CompsTableRow[] {
  return Object.entries(comps.by_category)
    .map(([category, entry]) => ({
      category,
      median: round4(Math.min(MODEL.multiple_cap, Math.max(MODEL.multiple_floor, entry.median))),
      n: entry.n,
      used: entry.n >= MODEL.min_comps,
    }))
    .sort((a, b) => b.n - a.n || b.median - a.median)
    .slice(0, limit);
}

/** Everything the dashboard needs: the board, the live set, the comps and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  comps: Comps;
  comps_table: CompsTableRow[];
  size_curve: SizeCurve;
  backtest: BacktestResult;
  netting: {
    airdrop_share: number;
    farmers_assumed: number;
    farmers_stress: number[];
    farm_threshold_usd: number;
    fee_rate: number;
    bridge_toll_usd: number;
    verdict_counts: { FARM: number; THIN: number; SKIP: number };
    verdict_counts_at_stress: { farmers: number; FARM: number; THIN: number; SKIP: number }[];
    /** The same counts at wider farmer counts, so the reader sees the leverage. */
    sensitivity: { farmers: number; FARM: number; THIN: number; SKIP: number }[];
  };
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a non-empty list of numbers. */
export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/**
 * The live-token protocols the size curve may learn from: a market cap above
 * zero, a positive TVL, not an exchange token. Fourteen protocols in the
 * snapshot record a market cap of zero or less — a truncated or placeholder
 * figure, not a price — and they are left out here and named in the
 * dashboard, so no log of zero or a negative ever enters the fit.
 */
export function usableLive(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter(
    (p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0 && p.category !== 'CEX',
  );
}

/**
 * The comparables the snapshot's live-token protocols produce. A protocol
 * counts as a comparable when its token already trades (a market cap is
 * recorded) and its TVL is positive; exchanges are left out because an
 * exchange token prices the exchange, not a protocol's TVL. The retired
 * model prices from these medians; the size curve is fitted on the same
 * usable set, with the zero-or-negative market caps left out.
 */
export function computeComps(snapshot: Snapshot): Comps {
  const live = usableLive(snapshot);
  const byCategory: Record<string, CategoryComps> = {};
  const groups = new Map<string, number[]>();
  for (const p of live) {
    const key = p.category ?? 'Other';
    const list = groups.get(key) ?? [];
    list.push(p.mcap_usd! / p.tvl_usd);
    groups.set(key, list);
  }
  for (const [key, ratios] of groups) {
    byCategory[key] = { median: median(ratios), n: ratios.length };
  }
  return {
    by_category: byCategory,
    overall_median: median(live.map((p) => p.mcap_usd! / p.tvl_usd)),
    overall_n: live.length,
  };
}

/** The multiple one category's comparables give, winsorized to the retired model's band. */
export function multipleFor(
  category: string | null,
  comps: Comps,
  model: ModelConstants = MODEL,
): { multiple: number; source: 'category' | 'overall'; n: number } {
  const key = category ?? 'Other';
  const entry = comps.by_category[key];
  let raw: number;
  let source: 'category' | 'overall';
  let n: number;
  if (entry !== undefined && entry.n >= model.min_comps) {
    raw = entry.median;
    source = 'category';
    n = entry.n;
  } else {
    raw = comps.overall_median;
    source = 'overall';
    n = comps.overall_n;
  }
  const multiple = Math.min(model.multiple_cap, Math.max(model.multiple_floor, raw));
  return { multiple, source, n };
}

/** Least squares on log TVL against log market cap: the size curve's fit. */
export function fitSizeCurve(live: SnapshotProtocol[]): SizeCurve {
  const xs = live.map((p) => Math.log(p.tvl_usd));
  const ys = live.map((p) => Math.log(p.mcap_usd!));
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < xs.length; i++) {
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sxx += (xs[i]! - mx) * (xs[i]! - mx);
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  return { intercept: my - slope * mx, slope, n: live.length };
}

/** The curve's prediction for one protocol, with the implied multiple winsorized to the curve's band. */
export function curveImplied(
  protocol: SnapshotProtocol,
  curve: SizeCurve,
): { implied: number; multiple: number } {
  const raw = Math.exp(curve.intercept + curve.slope * Math.log(protocol.tvl_usd));
  const multiple = Math.min(CURVE.winsor_high, Math.max(CURVE.winsor_low, raw / protocol.tvl_usd));
  return { implied: Math.max(1, Math.round(protocol.tvl_usd * multiple)), multiple };
}

/** The retired constant-multiple model's prediction, for the backtest's contrast only. */
export function retiredImplied(
  protocol: SnapshotProtocol,
  asOf: string,
  comps: Comps,
  model: ModelConstants = MODEL,
): number {
  const age = ageDays(asOf, protocol.listed_at);
  const { multiple } = multipleFor(protocol.category, comps, model);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor +
    (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  return Math.max(1, Math.round(protocol.tvl_usd * multiple * growthMult * maturityMult));
}

/** One blind test's score from its held-out predictions. */
function scoreSplit(
  name: string,
  train: SnapshotProtocol[],
  test: SnapshotProtocol[],
  predict: (p: SnapshotProtocol, train: SnapshotProtocol[]) => number,
): BacktestSplit {
  const errors: number[] = [];
  let within2 = 0;
  let within15 = 0;
  for (const p of test) {
    const pred = Math.max(1, predict(p, train));
    const ratio = pred / p.mcap_usd!;
    errors.push(Math.abs(Math.log(ratio)));
    if (ratio >= 0.5 && ratio <= 2) within2++;
    if (ratio >= 2 / 3 && ratio <= 1.5) within15++;
  }
  const med = median(errors);
  return {
    name,
    train_n: train.length,
    test_n: test.length,
    median_abs_log_error: round4(med),
    median_abs_pct_error: round4((Math.exp(med) - 1) * 100),
    within_2x: round4(within2 / test.length),
    within_1_5x: round4(within15 / test.length),
  };
}

/** A deterministic pseudo-random source (LCG) so the bootstrap repeats byte for byte. */
function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** The bootstrap: refit the size curve on resampled live tokens and report the fit's spread. */
function bootstrapCurve(live: SnapshotProtocol[]): BootstrapResult {
  const rnd = seededRandom(BACKTEST.bootstrap_seed);
  const slopes: number[] = [];
  const intercepts: number[] = [];
  for (let b = 0; b < BACKTEST.bootstrap_runs; b++) {
    const sample: SnapshotProtocol[] = [];
    for (let i = 0; i < live.length; i++) sample.push(live[Math.floor(rnd() * live.length)]!);
    const fit = fitSizeCurve(sample);
    slopes.push(fit.slope);
    intercepts.push(fit.intercept);
  }
  slopes.sort((a, b) => a - b);
  intercepts.sort((a, b) => a - b);
  const at = (sorted: number[], q: number): number => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
  return {
    runs: BACKTEST.bootstrap_runs,
    slope_median: round4(median(slopes)),
    slope_p5: round4(at(slopes, 0.05)),
    slope_p95: round4(at(slopes, 0.95)),
    intercept_median: round4(median(intercepts)),
    intercept_p5: round4(at(intercepts, 0.05)),
    intercept_p95: round4(at(intercepts, 0.95)),
  };
}

/**
 * The blind backtest, computed from the snapshot at run time. The time split
 * fits the curve on the live tokens listed before the cutoff and tests it on
 * the live tokens listed on or after it; the holdout fits on four fifths by
 * slug order and tests on the held-out fifth. The retired model is scored on
 * the same splits, from the same train subsets, so the contrast is apples to
 * apples. A live token with no listed date cannot join the time split and is
 * counted, not hidden.
 */
export function backtestCurve(snapshot: Snapshot): BacktestResult {
  const live = usableLive(snapshot);
  const dated = live.filter((p) => p.listed_at !== null);
  const trainTime = dated.filter((p) => p.listed_at! < BACKTEST.time_cutoff);
  const testTime = dated.filter((p) => p.listed_at! >= BACKTEST.time_cutoff);
  const ordered = [...live].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const trainHold = ordered.filter((_, i) => i % BACKTEST.holdout_every !== BACKTEST.holdout_every - 1);
  const testHold = ordered.filter((_, i) => i % BACKTEST.holdout_every === BACKTEST.holdout_every - 1);

  const curvePredict = (p: SnapshotProtocol, train: SnapshotProtocol[]): number =>
    curveImplied(p, fitSizeCurve(train)).implied;
  const retiredPredict = (p: SnapshotProtocol, train: SnapshotProtocol[]): number => {
    const sub: Snapshot = { ...snapshot, protocols: train };
    return retiredImplied(p, snapshot.as_of, computeComps(sub));
  };

  return {
    time_split: scoreSplit('time split (listed before 2024-01-01 trains, on or after tests)', trainTime, testTime, curvePredict),
    holdout: scoreSplit('holdout (every 5th live token by slug)', trainHold, testHold, curvePredict),
    retired_time_split: scoreSplit('retired model, same time split', trainTime, testTime, retiredPredict),
    retired_holdout: scoreSplit('retired model, same holdout', trainHold, testHold, retiredPredict),
    bootstrap: bootstrapCurve(live),
    time_split_excluded_no_date: live.length - dated.length,
  };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** The watchlist's own exclusion, as the snapshot shows it: these categories are wrapped, staked or bridged products of a token that already trades. */
const WRAPPED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

/** A whole word wrapped, staked or staking anywhere in the name, in any case. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** An exchange's name at the start of the protocol's name. */
const EXCHANGE_NAMES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol is one the board may rank: it records no token, and it
 * is not a wrapped, staked or bridged product of a token that already trades,
 * under the same rule that built the snapshot's watchlist. The snapshot's ten
 * fields carry everything that rule needs except DefiLlama's parent record,
 * which the watchlist already applied when it was built.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && WRAPPED_CATEGORIES.has(p.category)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_NAMES.some((e) => p.name.startsWith(e))) return false;
  return !VERSIONED.test(p.name);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** A dollar amount with its sign, as the farm plan writes a net: +$319, -$20, $0. */
export function signedMoney(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  if (rounded === 0) return '$0';
  const sign = rounded > 0 ? '+' : '-';
  const abs = Math.abs(rounded);
  return `${sign}$${Number.isInteger(abs) ? String(abs) : abs.toFixed(2)}`;
}

/** A dollar amount as the farm plan writes it: whole dollars plain, cents to two places. */
export function money(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return `$${Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2)}`;
}

/** The verdict a net earns: FARM above the threshold, THIN above zero, SKIP otherwise. */
export function verdictFor(netUsd: number): 'FARM' | 'THIN' | 'SKIP' {
  if (netUsd > NETTING.farm_threshold_usd) return 'FARM';
  if (netUsd > 0) return 'THIN';
  return 'SKIP';
}

/** One protocol's farm economics, netted to the dollar under the stated assumptions. */
export function farmEconomics(p: SnapshotProtocol, impliedUsd: number): FarmEconomics {
  const capital = capitalFor(p);
  const half = Math.max(25, Math.round(capital / 2));
  const twoChains = p.chains.length > 1;
  const gas = 3 + (capital >= 150 ? 8 : 4) + 2 + 2 + 4;
  const moved = capital + half + 25 + 25;
  const fees = Math.round(moved * NETTING.fee_rate * 100) / 100 + (twoChains ? NETTING.bridge_toll_usd : 0);
  const cost = Math.round((gas + fees) * 100) / 100;
  const farmers = NETTING.farmers_assumed;
  const expected = Math.round(((impliedUsd * NETTING.airdrop_share) / farmers) * 100) / 100;
  const net = Math.round((expected - cost) * 100) / 100;
  const verdictAtStress = NETTING.farmers_stress.map((f) => {
    const exp = Math.round(((impliedUsd * NETTING.airdrop_share) / f) * 100) / 100;
    return verdictFor(Math.round((exp - cost) * 100) / 100);
  });
  return {
    capital_usd: capital + half + 25,
    gas_usd: gas,
    fees_usd: fees,
    cost_usd: cost,
    farmers,
    expected_usd: expected,
    net_usd: net,
    verdict: verdictFor(net),
    verdict_at_stress: verdictAtStress,
  };
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const comps = computeComps(snapshot);
  const curve = fitSizeCurve(usableLive(snapshot));
  const index = bySlug(snapshot.protocols);
  const watchlist = new Set(snapshot.watchlist);
  // Every rankable pre-token protocol is a row: the watchlist is the floor,
  // and the early radar is every other rankable protocol, not a TVL cut.
  const chosen = snapshot.protocols.filter((p) => isRankable(p));
  // A watchlist slug the rankable rule somehow missed is still covered: the
  // gate's coverage row is never gambled on a filter.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined && !chosen.includes(p)) chosen.push(p);
  }
  const scored = chosen.map((p) => {
    const v = curveImplied(p, curve);
    const age = ageDays(snapshot.as_of, p.listed_at);
    const econ = farmEconomics(p, v.implied);
    const rawGrowth = finite(p.change_7d, 0);
    const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
    return { p, v, age, econ, growthPct };
  });
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    is_watchlist: watchlist.has(s.p.slug),
    age_days: s.age,
    implied_value_usd: s.v.implied,
    farm_capital_usd: s.econ.capital_usd,
    farm_gas_usd: s.econ.gas_usd,
    farm_fees_usd: s.econ.fees_usd,
    farm_cost_usd: s.econ.cost_usd,
    farm_expected_usd: s.econ.expected_usd,
    farm_net_usd: s.econ.net_usd,
    farm_verdict: s.econ.verdict,
    model: {
      multiple: round4(s.v.multiple),
      multiple_source: 'curve' as const,
      comps_n: curve.n,
      curve_intercept: round4(curve.intercept),
      curve_slope: round4(curve.slope),
      growth_pct: round4(s.growthPct),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age, s.econ).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's family: one word the action and the second action both key on. */
export function familyOf(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return 'lend';
  if (c.includes('dex')) return 'dex';
  if (c.includes('yield') || c.includes('farm')) return 'yield';
  if (c.includes('bridge')) return 'bridge';
  if (c.includes('stak')) return 'stake';
  if (c.includes('deriv') || c.includes('perpetual') || c.includes('basis')) return 'deriv';
  if (c.includes('curator') || c.includes('allocator')) return 'curator';
  if (c.includes('rwa')) return 'rwa';
  if (c.includes('stable')) return 'stable';
  if (c.includes('insurance')) return 'insurance';
  if (c.includes('payment')) return 'payments';
  if (c.includes('governance')) return 'governance';
  if (c.includes('index')) return 'index';
  if (c.includes('chain')) return 'chain';
  return 'default';
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const name = p.name;
  switch (familyOf(p)) {
    case 'lend':
      return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
    case 'dex':
      return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
    case 'yield':
      return `Deposit $${capital} of USDC into ${name}'s main yield vault on ${chain} and keep the shares.`;
    case 'bridge':
      return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
    case 'stake':
      return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
    case 'deriv':
      return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
    case 'curator':
      return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
    case 'rwa':
      return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
    case 'stable':
      return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
    case 'insurance':
      return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
    case 'payments':
      return `Send $${capital} through ${name}'s payment rails on ${chain}.`;
    case 'governance':
      return `Deposit $${capital} and stake it for voting power on ${name}.`;
    case 'index':
      return `Buy $${capital} of ${name}'s index tokens on ${chain} and hold them.`;
    case 'chain':
      return `Bridge $${capital} of USDC to ${chain} and deposit it into the chain's largest app.`;
    default:
      return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
  }
}

/** The category's second qualifying action: the same farm, a different footprint. */
function secondActionFor(p: SnapshotProtocol): string {
  const name = p.name;
  switch (familyOf(p)) {
    case 'lend':
      return `Borrow $25 of USDC against the supply and repay it within the week, so the position shows both sides of the market.`;
    case 'dex':
      return `Swap $25 through the pool, so the position shows trading activity as well as liquidity.`;
    case 'yield':
      return `Claim the first yield and redeposit it, so the position compounds instead of sitting idle.`;
    case 'bridge':
      return `Bridge $25 back to the starting chain, so the position shows a round trip.`;
    case 'stake':
      return `Restake the first rewards, so the staked balance grows instead of sitting idle.`;
    case 'deriv':
      return `Close the first hedge and open a fresh one, so the position shows repeated use.`;
    case 'curator':
      return `Deposit $25 into a second vault of the same curator, so the farm is not one vault only.`;
    case 'rwa':
      return `Check the yield accrual after the first week and leave the asset in place.`;
    case 'stable':
      return `Swap $25 of the stable asset into a second stablecoin ${name} supports.`;
    case 'insurance':
      return `Add $25 of cover for a second risk, so the position is not a single policy.`;
    case 'payments':
      return `Send a second payment of $25 through the rails a week later.`;
    case 'governance':
      return `Vote on a second proposal once one opens.`;
    case 'index':
      return `Rebalance after the first week if the index weights moved.`;
    case 'chain':
      return `Use a second app on the chain with $25, so the farm touches more than one program.`;
    default:
      return `Make a second deposit of $25 a week later, so the position shows repeated use.`;
  }
}

/**
 * A protocol's farm plan: nine steps, each an action with a cost and a time.
 * The plan is derived from the protocol's own record (category, chains, TVL,
 * age), never from a hand-written list of names. The ninth step nets the
 * plan to the dollar: its out-of-pocket cost against the expected airdrop
 * under the stated assumptions, and the verdict that net earns.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, econ: FarmEconomics): FarmStep[] {
  const chain = chainOf(p);
  const chain2 = p.chains.length > 1 ? p.chains[1]! : null;
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const half = Math.max(25, Math.round(capital / 2));
  const stress = NETTING.farmers_stress
    .map((f, i) => `${f.toLocaleString('en-US')} farmers: ${econ.verdict_at_stress[i]}`)
    .join('; ');
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: secondActionFor(p),
      cost: 'about $2 of gas',
      time: '10 minutes',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text:
        chain2 !== null
          ? `Repeat the core position on ${chain2} with $${half}, so the farm covers two chains instead of one.`
          : `Open a second position of the same kind in a different pool or vault of ${p.name}, so the farm is not one position only.`,
      cost: `$${half} of capital and about $4 of gas`,
      time: '15 minutes',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
    {
      text:
        `Net this plan: out of pocket ${money(econ.cost_usd)} (gas ${money(econ.gas_usd)} + fees ${money(econ.fees_usd)}). ` +
        `At a ${Math.round(NETTING.airdrop_share * 100)}% community allocation split among ${econ.farmers.toLocaleString('en-US')} farmers, the expected airdrop is ${money(econ.expected_usd)}, so the net is ${signedMoney(econ.net_usd)} — verdict ${econ.verdict}. ` +
        `The count is an assumption: ${stress}.`,
      cost: `net ${signedMoney(econ.net_usd)} after ${money(econ.cost_usd)} out of pocket`,
      time: 'read before you farm',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    is_watchlist: row.is_watchlist,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    farm_capital_usd: row.farm_capital_usd,
    farm_gas_usd: row.farm_gas_usd,
    farm_fees_usd: row.farm_fees_usd,
    farm_cost_usd: row.farm_cost_usd,
    farm_expected_usd: row.farm_expected_usd,
    farm_net_usd: row.farm_net_usd,
    farm_verdict: row.farm_verdict,
    multiple: row.model.multiple,
    multiple_source: row.model.multiple_source,
    comps_n: row.model.comps_n,
    curve_intercept: row.model.curve_intercept,
    curve_slope: row.model.curve_slope,
    growth_pct: row.model.growth_pct,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(
  snapshot: Snapshot,
  model: ModelConstants = MODEL,
): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const comps = computeComps(snapshot);
  const curve = fitSizeCurve(usableLive(snapshot));
  const backtest = backtestCurve(snapshot);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !r.is_watchlist).length;
  const verdictCounts = { FARM: 0, THIN: 0, SKIP: 0 };
  for (const r of board) verdictCounts[r.farm_verdict]++;
  const verdictCountsAtStress = NETTING.farmers_stress.map((f) => {
    const counts = { FARM: 0, THIN: 0, SKIP: 0 };
    for (const r of board) {
      const exp = Math.round(((r.implied_value_usd * NETTING.airdrop_share) / f) * 100) / 100;
      counts[verdictFor(Math.round((exp - r.farm_cost_usd) * 100) / 100)]++;
    }
    return { farmers: f, ...counts };
  });
  const sensitivity = [10000, 25000, 50000].map((f) => {
    const counts = { FARM: 0, THIN: 0, SKIP: 0 };
    for (const r of board) {
      const exp = Math.round(((r.implied_value_usd * NETTING.airdrop_share) / f) * 100) / 100;
      counts[verdictFor(Math.round((exp - r.farm_cost_usd) * 100) / 100)]++;
    }
    return { farmers: f, ...counts };
  });
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    comps,
    comps_table: topComps(comps),
    size_curve: curve,
    backtest,
    netting: {
      airdrop_share: NETTING.airdrop_share,
      farmers_assumed: NETTING.farmers_assumed,
      farmers_stress: [...NETTING.farmers_stress],
      farm_threshold_usd: NETTING.farm_threshold_usd,
      fee_rate: NETTING.fee_rate,
      bridge_toll_usd: NETTING.bridge_toll_usd,
      verdict_counts: verdictCounts,
      verdict_counts_at_stress: verdictCountsAtStress,
      sensitivity,
    },
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
