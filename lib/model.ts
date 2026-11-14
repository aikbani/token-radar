// The token radar's model, version radar-2: comps-calibrated implied value.
//
// A protocol's launch is the token it may issue one day. This model asks what
// that token would be worth if it launched at the valuation discipline the
// market already gives the category's live-token protocols, with the
// protocol's own record as it stands in the sealed snapshot. It predicts
// neither whether nor when a token is issued, and its implied value is the
// entry's own claim, never the market's.
//
// The calibration comes from the snapshot itself, never from a hand-kept
// list of names. For each category, the comparables are the protocols in the
// snapshot whose token already trades: the median of their market cap over
// TVL. A category with fewer than MIN_COMPS live comparables falls back to
// the overall median across every live-token protocol. The multiple is
// winsorized to [MULTIPLE_FLOOR, MULTIPLE_CAP] so one outlier category
// cannot price a whole board.
//
//   multiple     = winsorized category median mcap/TVL, or the overall median
//   growth       = clamp(change_7d, GROWTH_FLOOR, GROWTH_CAP) per cent
//   growthMult   = 1 + (growth / 100) x GROWTH_WEIGHT
//   maturity     = MATURITY_FLOOR + min(age_days, MATURITY_DAYS) / MATURITY_DAYS x MATURITY_RANGE
//   implied      = max(1, round(tvl_usd x multiple x growthMult x maturity))
//
// Age is the time since DefiLlama first listed the protocol, the best record
// of how long it has run with no token; an unlisted age uses UNKNOWN_AGE_DAYS.
// The same function scores every row: no protocol name is ever special-cased,
// and the dashboard states the constants and shows each row's own breakdown.
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

/** The model's constants, as the dashboard states them. */
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

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2';

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
  model: {
    multiple: number;
    multiple_source: 'category' | 'overall';
    comps_n: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
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
  multiple: number;
  multiple_source: 'category' | 'overall';
  comps_n: number;
  growth_multiplier: number;
  maturity_multiplier: number;
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
 * The comparables the snapshot's live-token protocols produce. A protocol
 * counts as a comparable when its token already trades (a market cap is
 * recorded) and its TVL is positive; exchanges are left out because an
 * exchange token prices the exchange, not a protocol's TVL.
 */
export function computeComps(snapshot: Snapshot): Comps {
  const live = snapshot.protocols.filter(
    (p) => p.mcap_usd !== null && p.tvl_usd > 0 && p.category !== 'CEX',
  );
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

/** The multiple one category's comparables give, winsorized to the model's band. */
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

/** The three multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  comps: Comps,
  model: ModelConstants = MODEL,
): {
  implied: number;
  multiple: number;
  multipleSource: 'category' | 'overall';
  compsN: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const { multiple, source, n } = multipleFor(protocol.category, comps, model);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor +
    (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const implied = Math.max(1, Math.round(protocol.tvl_usd * multiple * growthMult * maturityMult));
  return { implied, multiple, multipleSource: source, compsN: n, growthPct, growthMult, maturityMult, age };
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

/** The headline sentence's figures: how many watchlist slugs, how many rows, how many live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const comps = computeComps(snapshot);
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
    const v = impliedValue(p, snapshot.as_of, comps, model);
    return { p, v };
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
    age_days: s.v.age,
    implied_value_usd: s.v.implied,
    farm_capital_usd: capitalFor(s.p) + Math.max(25, Math.round(capitalFor(s.p) / 2)) + 25,
    farm_gas_usd: (capitalFor(s.p) >= 150 ? 8 : 4) + 2 + 2 + 4 + 3,
    model: {
      multiple: round4(s.v.multiple),
      multiple_source: s.v.multipleSource,
      comps_n: s.v.compsN,
      growth_pct: round4(s.v.growthPct),
      growth_multiplier: round4(s.v.growthMult),
      maturity_multiplier: round4(s.v.maturityMult),
      age_days: s.v.age,
    },
    farm_steps: farmSteps(s.p, s.v.age).map(stepText),
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
 * A protocol's farm plan: eight steps, each an action with a cost and a time.
 * The plan is derived from the protocol's own record (category, chains, TVL,
 * age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const chain2 = p.chains.length > 1 ? p.chains[1]! : null;
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const half = Math.max(25, Math.round(capital / 2));
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
    multiple: row.model.multiple,
    multiple_source: row.model.multiple_source,
    comps_n: row.model.comps_n,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(
  snapshot: Snapshot,
  model: ModelConstants = MODEL,
): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const comps = computeComps(snapshot);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !r.is_watchlist).length;
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
