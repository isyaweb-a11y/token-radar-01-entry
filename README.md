# token-radar-01-entry

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/isyaweb-a11y/token-radar-01-entry/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/isyaweb-a11y/token-radar-01-entry/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

## What this is

A radar for the question every airdrop farmer actually asks at the start of the month: **of all the protocols with no token yet, which one is worth my evenings?**

It reads one frozen snapshot of the protocol universe — 758 protocols from DefiLlama, 14 November 2026 — and ranks 198 of them that record no token. Every row gets an implied value and a farm plan written for that row alone. Open the dashboard, start at the top, and work down.

## How to read it in 30 seconds

1. **Start here.** The top five rows each get one honest sentence: how much money is locked in it, whether that money is arriving or leaving, how long it has gone without a token, and — when it matters — that its price is built on very little evidence.
2. **Click a row.** You get a plain-words take on that protocol, the arithmetic behind its number, and a seven-step farm plan with real costs and dates.
3. **Check the caveat before the money.** Some categories are priced off a single traded token. The page says so on the row. A number built on one comparison is a direction, not a price.

## How the number is built

No flat multiple, no favourite names. For each category, the traded tokens in it give market-cap-to-TVL ratios; the category's multiple is the median of those ratios, winsorized at the market's 90th percentile and shrunk toward the global median by how many comparisons stand behind it. A row's implied value is its TVL times that multiple, adjusted for its 7-day TVL growth, how long it has run with no token, and how many chains it runs on.

Exchanges, exchanges' own products, versioned deployments and the wrapper categories (bridges, liquid staking and restaking) are not ranked — their value is an asset that already trades. Traded protocols are shown apart, at the market's own values, as the comparison set the multiples are priced from. All 40 watchlist protocols are in, plus 158 more below the $50M floor: the early rows are the point of a radar. The model is labelled comps-2 on the dashboard, so anyone can check which version of the arithmetic they are reading.

## What it will not do

- It will not tell you a token is coming. A protocol on this board may never issue one, and the board would still be right about what it is worth today.
- It will not tell you to buy, sell or hold anything. Implied values are this dashboard's own claims about a hypothetical token, not prices and not advice.
- It will not send you to a claim link. Every farm plan ends the same way: check the protocol's own site, follow only links that site itself publishes, and never pay a fee to claim.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <dir holding snapshot.json>
```

In the grader the snapshot is mounted at `/input/snapshot.json` and the output goes to `/output`. The program (Node 22, standard library only) writes `board.json`, `data.js`, `dashboard/`, `screenshots/` and `dossier.json` (via the vendored `vendor/makefun-board.ts`), and is deterministic: two runs write the same bytes.

---

<sub>Entered on [make.fun](https://make.fun/?ref=sc1d8ke0&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
