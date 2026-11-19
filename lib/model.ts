// Token launch radar: the model.
//
// One sealed snapshot of the protocol universe goes in; one ranked board comes out. The board
// covers every slug on the snapshot's watchlist (the floor, never the ceiling) and ranks every
// other rankable pre-token protocol the snapshot carries, because the early rows below the floor
// are the ones a radar exists to find. Protocols whose token already trades are never ranked:
// they are the comparison set, shown apart at the market's own values.
//
// The implied value is anchored to the snapshot's own market, not to a constant. For every
// category, the protocols in it whose token already trades give a set of market-cap-to-TVL
// ratios; the category's multiple is the median of those ratios, shrunk toward the global
// median by the number of comparisons behind it, so a category priced by two thin comparisons
// borrows strength from the whole market instead of shouting. The ratios are winsorized first
// at the market's own 90th percentile: a traded token whose recorded TVL is a sliver of its
// market cap would otherwise price a whole category at hundreds of times TVL. A pre-token
// protocol's base value
// is its TVL times its category's multiple. Three adjustments follow, each stated on the page:
//
//   growth     its 7-day TVL change, clamped, moves the value by up to about half
//   maturity   the longer a protocol has run with no token, the closer it sits to the full
//              multiple; a young one is discounted, because most young TVL does not stay
//   breadth    each chain past the first adds a little, to a cap: distribution is surface
//              a token launch can be priced on
//
// No protocol's name is ever special-cased: one function scores every row, and the dashboard
// recomputes each row's value from the same figures so the page and board.json cannot drift.

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

/** The model's constants, printed on the dashboard's method view so a reader can re-run them. */
export interface ModelConstants {
  shrink_k: number;
  winsor_pct: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  breadth_per_chain: number;
  breadth_max_extra_chains: number;
}

export const MODEL: ModelConstants = {
  shrink_k: 4,
  winsor_pct: 0.9,
  growth_weight: 0.45,
  growth_floor: -50,
  growth_cap: 100,
  maturity_floor: 0.7,
  maturity_range: 0.3,
  maturity_days: 1460,
  unknown_age_days: 365,
  breadth_per_chain: 0.02,
  breadth_max_extra_chains: 5,
};

/** The model's version label: the dashboard and board rows name it. */
export const MODEL_VERSION = 'comps-2';

/** How many live-token protocols the comparison view carries, by market cap. */
export const LIVE_ROWS = 30;

/** One category's anchor: the multiple the market itself pays for a dollar of TVL in it. */
export interface CategoryAnchor {
  category: string;
  multiple: number;
  raw_median: number;
  comps: number;
}

/** The anchors the model derived from the snapshot: one global, and one per named category. */
export interface Anchors {
  global_multiple: number;
  global_comps: number;
  ratio_cap: number;
  by_category: Map<string, CategoryAnchor>;
}

/** A farm step before it is flattened: the action, what it costs, how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: a pre-token protocol, its implied value and the arithmetic behind it. */
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
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  model: {
    category_multiple: number;
    category_comps: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one board row, farm plan included. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  watchlist: boolean;
  implied_value_usd: number;
  category_multiple: number;
  category_comps: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so it is shown at the market's value, never ranked. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  symbol: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  mcap_tvl: number | null;
}

/** Everything the dashboard renders: the board, the comparison set, and the anchors behind both. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  global_multiple: number;
  global_comps: number;
  ratio_cap: number;
  categories: CategoryAnchor[];
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
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

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

function bySlugOrder(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** A whole day count from `listedAt` to `asOf`, clamped at zero; null when a date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The calendar date `days` after `asOf`, as YYYY-MM-DD, for farm plans' review dates. */
export function dateAfter(asOf: string, days: number): string {
  const t = Date.parse(`${asOf}T00:00:00Z`) + days * DAY_MS;
  return new Date(t).toISOString().slice(0, 10);
}

/** The median of a non-empty list of numbers. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Whether a protocol records no token at all: no market cap, no CoinGecko id, no symbol. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * The market's own anchors, derived from the snapshot alone: every protocol whose token trades
 * and whose record carries both a market cap and a TVL prices one dollar of TVL in its category.
 */
export function deriveAnchors(snapshot: Snapshot, model: ModelConstants = MODEL): Anchors {
  const priced = snapshot.protocols.filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
  const rawRatios = priced.map((p) => p.mcap_usd! / p.tvl_usd);
  // Winsorize at the market's own high percentile: the cap is a figure of the snapshot, not a
  // constant of the model, and it binds before any median is taken, the global one included.
  const ordered = [...rawRatios].sort((a, b) => a - b);
  const cap = ordered.length > 0 ? ordered[Math.min(ordered.length - 1, Math.floor(model.winsor_pct * ordered.length))]! : 0.25;
  const all = rawRatios.map((r) => Math.min(r, cap));
  const globalMultiple = all.length > 0 ? median(all) : 0.25;
  const groups = new Map<string, number[]>();
  for (const p of priced) {
    if (p.category === null) continue;
    const list = groups.get(p.category) ?? [];
    list.push(Math.min(p.mcap_usd! / p.tvl_usd, cap));
    groups.set(p.category, list);
  }
  const byCategory = new Map<string, CategoryAnchor>();
  for (const [category, ratios] of groups) {
    const raw = median(ratios);
    const shrunk = (ratios.length * raw + model.shrink_k * globalMultiple) / (ratios.length + model.shrink_k);
    byCategory.set(category, { category, multiple: round4(shrunk), raw_median: round4(raw), comps: ratios.length });
  }
  return { global_multiple: round4(globalMultiple), global_comps: all.length, ratio_cap: round4(cap), by_category: byCategory };
}

/** The anchor one protocol is priced on: its category's, or the global one when it has none. */
function anchorFor(p: SnapshotProtocol, anchors: Anchors): CategoryAnchor {
  if (p.category !== null) {
    const found = anchors.by_category.get(p.category);
    if (found !== undefined) return found;
  }
  return { category: p.category ?? 'All categories', multiple: anchors.global_multiple, raw_median: anchors.global_multiple, comps: anchors.global_comps };
}

/** The adjustments and the implied value one protocol gets under `model` and `anchors`. */
export function impliedValue(
  p: SnapshotProtocol,
  asOf: string,
  anchors: Anchors,
  model: ModelConstants = MODEL,
): { implied: number; anchor: CategoryAnchor; growthPct: number; growthMult: number; maturityMult: number; breadthMult: number; age: number | null } {
  const anchor = anchorFor(p, anchors);
  const age = ageDays(asOf, p.listed_at);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, finite(p.change_7d, 0)));
  const growthMult = Math.max(0.2, 1 + (growthPct / 100) * model.growth_weight);
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const extraChains = Math.min(Math.max(p.chains.length - 1, 0), model.breadth_max_extra_chains);
  const breadthMult = 1 + extraChains * model.breadth_per_chain;
  const implied = Math.max(1, Math.round(p.tvl_usd * anchor.multiple * growthMult * maturityMult * breadthMult));
  return { implied, anchor, growthPct, growthMult, maturityMult, breadthMult, age };
}

/** DefiLlama's version-marker shape: a name ending in a release is a deployment of another product. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** A whole word that marks a wrapped or staked product of a token that already trades. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** Categories whose product is a wrapped, staked or bridged form of an asset that already trades. */
const WRAPPER_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Exchange names: a protocol that begins with one is that exchange's own product, not a launch. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/**
 * Whether a protocol is one the board may rank: it records no token, it is not an exchange or a
 * wrapper category's product, not an exchange's own product, not a versioned deployment of
 * another product, and not a wrapped or staked product of a traded token. The watchlist's own
 * hygiene, applied to the whole board: these protocols' value is an asset that already trades.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  return (
    isPreToken(p) &&
    (p.category === null || !WRAPPER_CATEGORIES.has(p.category)) &&
    !EXCHANGE_PREFIX.test(p.name) &&
    !VERSIONED.test(p.name) &&
    !WRAPPED_WORD.test(p.name)
  );
}

/** The protocols the board ranks, strongest first, with ranks 1..n and every watchlist slug in. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; anchors: Anchors } {
  const anchors = deriveAnchors(snapshot, model);
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug on it is ranked, whatever the filters below would say.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // Then every other rankable pre-token protocol in the snapshot, at any TVL: the radar's reach.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }
  const watch = new Set(snapshot.watchlist);
  const scored = [...chosen.values()].map((p) => ({ p, ...impliedValue(p, snapshot.as_of, anchors, model) }));
  scored.sort((a, b) => b.implied - a.implied || bySlugOrder(a.p.slug, b.p.slug));
  const board = scored.map((s, i) => ({
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
    token_status: 'pre-token' as const,
    watchlist: watch.has(s.p.slug),
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      category_multiple: s.anchor.multiple,
      category_comps: s.anchor.comps,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      breadth_multiplier: round4(s.breadthMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age, snapshot.as_of).map(stepText),
  }));
  return { board, anchors };
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Keep the position open and the log current.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase when it names none. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** What one transaction costs on a chain, in dollars, by the chain's fee class. */
function gasUsd(chain: string): number {
  const c = chain.toLowerCase();
  if (c === 'ethereum') return 12;
  if (c.includes('solana')) return 0.05;
  if (c.includes('bsc') || c.includes('bnb') || c.includes('binance')) return 0.3;
  if (c.includes('bitcoin')) return 2;
  return 0.6;
}

/** A gas figure as a reader meets it: cents under a dollar, whole dollars above. */
function gasText(chain: string): string {
  const g = gasUsd(chain);
  return g < 1 ? `about ${Math.round(g * 100)} cents` : `about $${g}`;
}

/** How much capital one farm position carries, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 300;
  if (p.tvl_usd >= 1_000_000_000) return 200;
  if (p.tvl_usd >= 250_000_000) return 120;
  if (p.tvl_usd >= 50_000_000) return 80;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols earn a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  if (age < 730) return 35;
  return 30;
}

type ActionPair = { first: string; deepen: string };

/** The category's two moves, in words a farmer can follow: open the position, then deepen it. */
function actionsFor(p: SnapshotProtocol, capital: number, chain: string): ActionPair {
  const c = (p.category ?? '').toLowerCase();
  const n = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return {
      first: `Supply $${capital} of USDC to ${n} on ${chain} so the wallet starts earning a supply history`,
      deepen: `Borrow about $${Math.round(capital / 3)} of USDC against that supply on ${n} and re-supply it once, keeping the health factor above 2`,
    };
  }
  if (c.includes('dex') || c.includes('aggregator') || c.includes('yield') || c.includes('leveraged')) {
    return {
      first: `Swap about $${Math.round(capital / 4)} through ${n} on ${chain}, then provide the rest as liquidity in its most-used pool`,
      deepen: `Keep the liquidity position open on ${n} and claim any pool fees weekly so the position shows continuing use, not one visit`,
    };
  }
  if (c.includes('bridge') || c.includes('canonical')) {
    return {
      first: `Bridge $${capital} of USDC from Ethereum to ${chain} through ${n} and hold the bridged balance on the far side`,
      deepen: `Use part of the bridged funds in one app on ${chain}, then bridge a smaller amount back through ${n} a week later`,
    };
  }
  if (c.includes('staking') || c.includes('restak')) {
    return {
      first: `Stake $${capital} of the chain's staking asset through ${n} on ${chain} and keep the staking receipt in the same wallet`,
      deepen: `Restake or delegate the receipt position once if ${n} offers it, and leave both positions untouched while they season`,
    };
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) {
    return {
      first: `Deposit $${capital} of USDC as margin on ${n} and open one small hedged position, long and short in equal size`,
      deepen: `Roll the hedge once a week on ${n} so the account shows steady trading volume without directional risk`,
    };
  }
  if (c.includes('prediction')) {
    return {
      first: `Fund $${capital} on ${n} and take one position in its most liquid market, sized under a fifth of the fund`,
      deepen: `Settle that market on ${n} and take a second position in a different market so the account history spans two events`,
    };
  }
  if (c.includes('curator') || c.includes('allocator') || c.includes('vault')) {
    return {
      first: `Deposit $${capital} into a ${n} vault on ${chain} and keep the vault shares in the wallet that deposited`,
      deepen: `Add about $${Math.round(capital / 4)} more to the same ${n} vault after two weeks so the deposit history shows a pattern, not a spike`,
    };
  }
  if (c.includes('stable') || c.includes('synthetic')) {
    return {
      first: `Mint or deposit $${capital} of the stable asset through ${n} on ${chain} and hold the minted balance`,
      deepen: `Move half the minted balance into ${n}'s own savings or staking option if it has one, and hold both halves`,
    };
  }
  if (c.includes('rwa')) {
    return {
      first: `Mint $${capital} of ${n}'s yield asset on ${chain} after its onboarding check and hold the position`,
      deepen: `Let one full yield period pass on ${n}, then mint a second smaller tranche so the account shows repeat use`,
    };
  }
  if (c.includes('insurance')) {
    return {
      first: `Buy $${capital} of cover from ${n} on ${chain} for the longest term it offers and keep the policy active`,
      deepen: `Renew or extend the ${n} policy once before it lapses so the cover history is unbroken`,
    };
  }
  if (c.includes('launchpad') || c.includes('ido')) {
    return {
      first: `Deposit $${capital} into ${n} on ${chain} and complete its participation or staking step in full`,
      deepen: `Take part in one live round on ${n} at the smallest tier so the wallet carries a completed participation record`,
    };
  }
  return {
    first: `Deposit $${capital} of USDC into ${n} on ${chain} and keep the position open`,
    deepen: `Repeat a smaller deposit of about $${Math.round(capital / 4)} into ${n} after two weeks so the history shows continuing use`,
  };
}

/**
 * A protocol's farm plan: seven steps, each an action with what it costs and how long it takes.
 * Every figure in it comes from the protocol's own record: its category picks the moves, its
 * first chain prices the gas, its TVL sizes the capital, its age sets the hold, its 7-day
 * change sets the cadence, and the snapshot's date sets the review date.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, asOf: string): FarmStep[] {
  const chain = chainOf(p);
  const gas = gasText(chain);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const review = dateAfter(asOf, hold);
  const actions = actionsFor(p, capital, chain);
  const growth = finite(p.change_7d, 0);
  const cadence =
    growth >= 10
      ? { text: `Interact twice a week while ${p.name}'s TVL is climbing this fast: repeat the smaller of the two moves above, alternating them`, cost: `${gas} of gas a visit`, time: '10 minutes twice a week' }
      : growth < -5
        ? { text: `Interact once every two weeks: ${p.name}'s TVL is shrinking, so keep the position but add no new capital until it steadies`, cost: `${gas} of gas a visit`, time: '10 minutes every two weeks' }
        : { text: `Interact once a week with ${p.name}: repeat the smaller of the two moves above so each week adds one dated transaction`, cost: `${gas} of gas a visit`, time: '10 minutes a week' };
  return [
    {
      text: `Set up a fresh wallet for ${p.name} alone, fund it from your main wallet, and keep its seed phrase offline`,
      cost: `${gas} of gas for the funding transaction`,
      time: '10 minutes',
    },
    {
      text: actions.first,
      cost: `$${capital} of capital and ${gas} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: actions.deepen,
      cost: `${gas} of gas, no new capital beyond the first position`,
      time: '10 minutes',
    },
    cadence,
    {
      text: `Hold the position at least ${hold} days, until ${review}, so the activity spans more than one weekly snapshot of ${p.name}`,
      cost: `the $${capital} stays in the position until then`,
      time: `${hold} days`,
    },
    {
      text: `On the review date, open ${p.name}'s own site and check its points, rewards or governance page for a claim or snapshot announcement, following only links the site itself publishes`,
      cost: 'nothing to check; never pay a fee to claim',
      time: '10 minutes',
    },
    {
      text: `Log the wallet, every date and transaction hash in a farm log, and unwind the position if ${p.name}'s TVL falls by a third in a week or its terms change`,
      cost: 'nothing but the log',
      time: '5 minutes a week',
    },
  ];
}

/** The live-token protocols, by market cap: the comparison set the anchors are priced from. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd || bySlugOrder(a.slug, b.slug))
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      symbol: p.symbol,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      mcap_tvl: p.mcap_usd !== null && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null,
    }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    listed_at: row.listed_at,
    age_days: row.age_days,
    watchlist: row.watchlist,
    implied_value_usd: row.implied_value_usd,
    category_multiple: row.model.category_multiple,
    category_comps: row.model.category_comps,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const { board, anchors } = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const watch = new Set(snapshot.watchlist);
  const categories = [...anchors.by_category.values()].sort((a, b) => b.comps - a.comps || bySlugOrder(a.category, b.category));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    global_multiple: anchors.global_multiple,
    global_comps: anchors.global_comps,
    ratio_cap: anchors.ratio_cap,
    categories,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.filter((r) => !watch.has(r.slug)).length,
    live_size: live.length,
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
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, values, farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  if (slugs.size !== board.length) return 'the board carries a slug twice';
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  for (const r of board) if (!known.has(r.slug)) return `${r.slug} is not one of the snapshot's protocols`;
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  if (board.length < 100) return `the board holds ${board.length} rows, under the 100-row floor`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  const ordered = [...board].sort((a, b) => a.rank - b.rank);
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i]!.implied_value_usd > ordered[i - 1]!.implied_value_usd) return `rank ${ordered[i]!.rank} outranks rank ${ordered[i - 1]!.rank} on implied value`;
  }
  if (board.length >= 2 && ordered[0]!.implied_value_usd === ordered[ordered.length - 1]!.implied_value_usd) {
    return 'every row shares one implied value: a board that ranks nothing by value is not a ranking';
  }
  for (const r of board) {
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) {
      const trimmed = s.trim();
      if (trimmed.length < 20 || trimmed.length > 600) return `${r.slug} has a farm step of ${trimmed.length} characters`;
    }
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) {
      return `${r.slug} has implied value ${r.implied_value_usd}`;
    }
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
