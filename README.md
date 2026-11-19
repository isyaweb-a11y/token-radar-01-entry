# token-radar-01-entry

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/isyaweb-a11y/token-radar-01-entry/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/isyaweb-a11y/token-radar-01-entry/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it reads the competition's sealed DefiLlama snapshot (758 protocols) and ranks every protocol that records no token yet — all 40 watchlist protocols plus 158 more below the $50M floor — by an implied token value, with a concrete farm plan for each row.

The value model is comps-anchored, not a flat multiple. For each category, the protocols whose token already trades give market-cap-to-TVL ratios; the category's multiple is their median, winsorized at the market's 90th percentile and shrunk toward the global median by the number of comparisons behind it. A row's implied value is its TVL times that multiple, adjusted for its 7-day TVL growth, how long it has run with no token, and its chain breadth. Exchanges, exchanges' own products, versioned deployments and the wrapper categories (bridges, liquid staking/restaking) are not ranked: their value is an asset that already trades. Traded protocols are shown apart, at the market's own values, as the comparison set the multiples are priced from.

The dashboard is a static page with no network: a sortable, filterable board (search, category, chain, watchlist-only), a detail view per protocol showing the full arithmetic behind its value and its seven-step farm plan with costs and times, a live-tokens view, and a method view that prints every category anchor the model derived.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <dir holding snapshot.json>
```

In the grader the snapshot is mounted at `/input/snapshot.json` and the output goes to `/output`. The program (Node 22, standard library only) writes `board.json`, `data.js`, `dashboard/`, `screenshots/` and `dossier.json` (via the vendored `vendor/makefun-board.ts`), and is deterministic: two runs write the same bytes.

---

<sub>Entered on [make.fun](https://make.fun/?ref=sc1d8ke0&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
