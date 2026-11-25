// Token launch radar: the model.
//
// A sealed snapshot of the protocol universe goes in, one ranked board comes out.
// The board covers every slug on the snapshot's watchlist and every other rankable
// pre-token protocol in the snapshot, because the rows below the floor are the ones
// a radar exists to find. A protocol whose token already trades is never ranked:
// it is the comparison set, shown apart at the market's own values.
//
// The implied value is anchored to the snapshot's own market, never to a constant
// I picked. For each category, the traded tokens in it give market-cap-to-TVL
// ratios; the category multiple is the median of those ratios, shrunk toward the
// global median by how many comparisons stand behind it, so a category priced by
// one or two thin comps borrows strength from the whole market instead of shouting.
// Ratios are winsorized first at the market's own 90th percentile: a traded token
// whose recorded TVL is a sliver of its market cap would otherwise price a whole
// category at hundreds of times TVL. A pre-token protocol's base value is its TVL
// times its category's multiple, then three adjustments, each printed on the page:
//
//   growth     its 7-day TVL change, clamped, moves the value by up to about half
//   maturity   the longer a protocol has run with no token, the closer it sits to
//              the full multiple; young TVL gets discounted, because most of it
//              does not stay
//   breadth    each chain past the first adds a little, to a cap: distribution is
//              surface a token launch can be priced on
//
// No protocol's name is ever special-cased. One function scores every row, and the
// dashboard recomputes each row's value from the same figures, so the page and
// board.json cannot drift apart.
//
// The farm plans are written the same way, but they read like a person wrote them
// for that one protocol, because they are built from that one protocol's record:
// its category picks the moves, its first chain prices the gas, its TVL sizes the
// capital, its age sets the hold, its 7-day change sets the cadence, and the
// snapshot's date sets the review date. The wording varies by row on purpose —
// the same move in the same words 198 times would be a form letter, not a plan.

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

/* ------------------------------------------------------------------ */
/* Farm plans: the human part.                                        */
/*                                                                     */
/* Every figure below comes from the row itself — category, first      */
/* chain, TVL, age, 7-day change, snapshot date. Nothing is written   */
/* for one named protocol; the wording is picked by the row's own      */
/* numbers, so two rows in the same category still read differently.   */
/* ------------------------------------------------------------------ */

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

/** Deterministic pick from a list, seeded by a string — same row, same words, every run. */
function pick<T>(options: T[], seed: string): T {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) % 1_000_003;
  return options[h % options.length]!;
}

/** One decimal with a sign, for a 7-day change a reader can feel. */
function pct1(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}

type Playbook = { first: string; deepen: string; watchFor: string };

/**
 * The category's two moves, written the way someone who actually uses that kind of
 * protocol would say them. A lending position is not a DEX position with the nouns
 * swapped: the risks, the second move and the thing to watch are all different.
 */
function actionsFor(p: SnapshotProtocol, capital: number, chain: string): Playbook {
  const c = (p.category ?? '').toLowerCase();
  const n = p.name;
  const third = Math.round(capital / 3);
  const quarter = Math.round(capital / 4);
  if (c.includes('risk curator') || c.includes('curator') || c.includes('onchain capital') || c.includes('allocator')) {
    return {
      first: `Put $${capital} into a ${n} vault on ${chain} — you are trusting the curator's picks, so read which vaults it actually runs before you pick one, and keep the vault shares in the wallet that deposited`,
      deepen: `After two weeks, add about $${quarter} more to the same ${n} vault, and only then look at whether a different vault of theirs fits better; one vault, topped up, reads as a real user`,
      watchFor: `which vaults ${n} is actually allocating to, and whether its allocation changes without warning`,
    };
  }
  if (c.includes('lending') || c.includes('cdp') || c.includes('collateral')) {
    return {
      first: `Lend $${capital} of USDC on ${n} on ${chain} — start as a lender, not a borrower, so the wallet has a clean supply history first`,
      deepen: `Borrow about $${third} against that supply and lend it out again once, keeping the health factor above 2 the whole time; if the borrow rate jumps, pay it back and stop there`,
      watchFor: `the borrow rate and your health factor on ${n} — a loan that looked cheap on day one can turn expensive fast`,
    };
  }
  if (c.includes('yield aggregator') || c.includes('yield')) {
    return {
      first: `Drop $${capital} into the ${n} strategy on ${chain} that has held the most TVL the longest, not the one flashing the highest number this week, and leave it to compound`,
      deepen: `Harvest once when the rewards are worth more than the gas to claim them, then put the harvest straight back into the same ${n} strategy instead of cashing it out`,
      watchFor: `whether ${n}'s headline yield is real or just a new pool's first-week bribe that fades`,
    };
  }
  if (c.includes('dex') || c.includes('liquidity manager')) {
    return {
      first: `Swap about $${quarter} through ${n} on ${chain} first, so the wallet has a trade on record, then put the rest in as liquidity in its busiest pool — the one people actually trade against`,
      deepen: `Leave the position alone and collect the pool fees once a week; a liquidity position that is opened, closed and reopened every day looks like a bot, not a user`,
      watchFor: `whether the pool you picked on ${n} is still the busy one, or volume has quietly moved elsewhere`,
    };
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options') || c.includes('basis trading') || c.includes('leveraged')) {
    return {
      first: `Put $${capital} of USDC up as margin on ${n} and open one small hedged trade — long and short in equal size — so the account shows volume without betting on direction`,
      deepen: `Roll the hedge once a week on ${n} and keep the position small; the moment you start sizing up because it feels easy is the moment to stop`,
      watchFor: `funding rates on ${n} — a hedge that pays funding every eight hours quietly eats the position`,
    };
  }
  if (c.includes('prediction')) {
    return {
      first: `Fund $${capital} on ${n} and buy into its most liquid market with less than a fifth of it — the market with real volume, not the one with the loudest headline`,
      deepen: `Once that market settles, take a second position in a different market on ${n}; two settled markets tell a better story than ten open ones`,
      watchFor: `whether the market you bought on ${n} actually has anyone on the other side when you want out`,
    };
  }
  if (c.includes('rwa')) {
    return {
      first: `Finish ${n}'s onboarding check first — it is the slow part — then mint $${capital} of its yield asset on ${chain} and hold it; do not skip the check and do not rush it`,
      deepen: `Let one full yield period run on ${n} before you touch anything, then mint a second, smaller tranche so the account shows someone coming back, not passing through`,
      watchFor: `the yield ${n} actually pays out versus the yield it advertises, and any change to its terms`,
    };
  }
  if (c.includes('staking') || c.includes('restak') || c.includes('staking pool')) {
    return {
      first: `Stake $${capital} of the chain's staking asset through ${n} on ${chain} and keep the staking receipt in the same wallet — the receipt is the record`,
      deepen: `If ${n} offers restaking or delegation, do it once with the receipt and then leave both positions alone while they season; restaked positions reward patience, not fiddling`,
      watchFor: `the unbonding wait on ${n} — know how long your money is locked before you need it, not after`,
    };
  }
  if (c.includes('bridge') || c.includes('canonical')) {
    return {
      first: `Bridge $${capital} of USDC from Ethereum to ${chain} through ${n} and leave the bridged balance on the far side for a while — a bridge used once and reversed the same day is noise`,
      deepen: `Spend part of the bridged funds in one real app on ${chain}, then bridge a smaller amount back through ${n} a week later so the round trip has a reason`,
      watchFor: `the bridge fee and the wait on ${n} — a cheap bridge that takes a day can cost more in missed moves than a dear one`,
    };
  }
  if (c.includes('stable') || c.includes('synthetic') || c.includes('stablecoin')) {
    return {
      first: `Mint or deposit $${capital} of the stable asset through ${n} on ${chain} and hold the minted balance where it earns, instead of letting it sit in the wallet doing nothing`,
      deepen: `Move half the minted balance into ${n}'s own savings option if it has one, and keep both halves where they are — splitting the balance shows you actually use the thing`,
      watchFor: `whether ${n}'s stable asset still holds its peg when the market gets rough, not just when it is calm`,
    };
  }
  if (c.includes('insurance')) {
    return {
      first: `Buy $${capital} of cover from ${n} on ${chain} for the longest term it offers, and read what the cover actually excludes before you pay — the exclusions are the product`,
      deepen: `Renew or extend the ${n} policy once before it lapses so the cover history is unbroken; a gap in cover is a gap in the story`,
      watchFor: `what ${n} has actually paid out on in the past, and what it has refused`,
    };
  }
  if (c.includes('launchpad') || c.includes('ido')) {
    return {
      first: `Stake or deposit the $${capital} ${n} asks for on ${chain} and finish its participation step in full — half-finished signups do not count for anything`,
      deepen: `Join one live round on ${n} at the smallest tier so the wallet carries a completed participation, then stop; launchpads reward the one who showed up, not the one who went biggest`,
      watchFor: `whether ${n}'s rounds are actually open to wallets your size, or only to the top tier`,
    };
  }
  if (c.includes('chain')) {
    return {
      first: `Bridge $${capital} onto ${n} on ${chain} and use its main app the same week — a new chain with no activity on it is just a wallet with money in it`,
      deepen: `Come back the next week and do one different thing on ${n}: a second app, a second transaction type, so the history shows a user exploring, not a script repeating`,
      watchFor: `whether anyone else is actually using ${n} yet, or the chain is still mostly its own team`,
    };
  }
  return {
    first: `Put $${capital} of USDC to work in ${n} on ${chain} — deposit it, use the thing properly once, and keep the position open instead of pulling it straight back out`,
    deepen: `Add about $${quarter} more to the same ${n} position after two weeks, so the history shows someone returning rather than someone who visited once`,
    watchFor: `whether ${n} is still the same product in a month, or it has quietly changed what it does`,
  };
}

/**
 * A protocol's farm plan: seven steps, each an action with what it costs and how long it takes.
 * The plan's shape is the same every time — set up, open, deepen, keep going, hold, check,
 * log — but the words, the numbers and the warnings follow this row's own record.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, asOf: string): FarmStep[] {
  const chain = chainOf(p);
  const gas = gasText(chain);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const review = dateAfter(asOf, hold);
  const play = actionsFor(p, capital, chain);
  const growth = finite(p.change_7d, 0);
  const multiChain = p.chains.length > 1;

  const wallet = pick(
    [
      `Open a fresh wallet just for ${p.name} — one protocol, one wallet, so nothing else in your history muddies it — fund it from your main wallet and write the seed phrase down offline, on paper, not in a screenshot`,
      `Give ${p.name} its own wallet. Fund it once from your main wallet, keep the seed phrase off any screen, and do not use this wallet for anything else`,
      `Start with a clean wallet for ${p.name} alone, funded from your main wallet. If this wallet ever gets drained or spammed, you lose one farm, not your whole history`,
    ],
    p.slug,
  );
  const walletCost = chain.toLowerCase() === 'ethereum'
    ? `${gas} of gas for the funding transaction — on Ethereum, do it once and do it properly`
    : `${gas} of gas for the funding transaction`;

  const cadence: FarmStep =
    growth >= 10
      ? {
          text: `While ${p.name}'s TVL is up ${pct1(growth)} in seven days, show up twice a week: repeat the smaller of the two moves above, alternating them. The rising number is a reason to be present, not a reason to add fresh capital — the crowd arriving now is the same crowd that leaves first`,
          cost: `${gas} of gas a visit`,
          time: '10 minutes twice a week',
        }
      : growth < -5
        ? {
            text: `TVL is down ${pct1(growth)} in a week, so slow down: touch ${p.name} once a fortnight, keep the position, and add no new capital until the bleeding stops — farming a shrinking pool with fresh money is how people lose twice`,
            cost: `${gas} of gas a visit`,
            time: '10 minutes every two weeks',
          }
        : {
            text: `Once a week is enough for ${p.name}: repeat the smaller of the two moves above so each week adds one dated transaction, and let the weeks stack up — airdrops are won by the boring middle, not the first day`,
            cost: `${gas} of gas a visit`,
            time: '10 minutes a week',
          };

  const holdText =
    age === null
      ? `Hold the position at least ${hold} days, until ${review}, and treat that date as real: a position closed early leaves no history worth snapshotting`
      : age < 180
        ? `Hold at least ${hold} days, until ${review} — ${p.name} is young, so it needs the longer window to prove the activity is not a one-week stunt`
        : age >= 730
          ? `Hold at least ${hold} days, until ${review}; ${p.name} has been around a while, so a month of steady use is enough to look like a regular, not a tourist`
          : `Hold the position at least ${hold} days, until ${review}, so the activity spans more than one weekly snapshot of ${p.name}`;
  const holdCost = multiChain
    ? `the $${capital} stays put until then, across ${p.chains.length} chains — do not split it chasing a second chain`
    : `the $${capital} stays in the position until then`;

  const check = pick(
    [
      `On ${review}, open ${p.name}'s own site and look for a points, rewards or governance page — a claim or snapshot announcement, if there is one, will be there. Only follow links that site itself publishes`,
      `Come back on ${review} and check ${p.name}'s own site for any points or claim page. If a stranger's link promises you a claim, it is not a claim, it is a trap`,
      `On the review date, go to ${p.name}'s own site — not a search result, not a reply in your mentions — and see whether it has published anything about points, a snapshot or a claim`,
    ],
    `${p.slug}-check`,
  );

  const log = pick(
    [
      `Keep a farm log: the wallet, every date, every transaction hash. And unwind the position if ${p.name}'s TVL falls by a third in a week or its terms change — a plan that never exits is not a plan`,
      `Write it all down — wallet, dates, hashes — in a farm log you can actually find in three months. If ${p.name}'s TVL drops by a third in a week, or the terms move, close the position and walk away`,
      `Log the wallet, each date and each hash, and decide the exit now, while you are calm: if ${p.name}'s TVL falls by a third in a week or its terms change, you unwind, no second thoughts`,
    ],
    `${p.slug}-log`,
  );

  return [
    { text: wallet, cost: walletCost, time: '10 minutes' },
    { text: play.first, cost: `$${capital} of capital and ${gas} of gas`, time: '15 minutes to set up' },
    { text: play.deepen, cost: `${gas} of gas, no new capital beyond the first position`, time: '10 minutes' },
    cadence,
    { text: holdText, cost: holdCost, time: `${hold} days` },
    { text: `${check}. Watch for ${play.watchFor}.`, cost: 'nothing to check; never pay a fee to claim', time: '10 minutes' },
    { text: log, cost: 'nothing but the log', time: '5 minutes a week' },
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
