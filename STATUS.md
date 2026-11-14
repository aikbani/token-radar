# TOKEN-RADAR-01 — "Build the best token launch radar" — STATUS

## Competition (checked live 2026-11-14 ~17:35 WIB)
- Slug: token-radar-01. Sponsor: make.fun (verified). Category: Trading.
- **Opens 2026-11-14T10:00:00Z (= 17:00 WIB 14 Nov), deadline 2026-12-14T10:00:00Z.**
- **Prize $1,325 total: 1st $1,000, 2nd–5th $50, 6th–10th $25. ESCROWED** (escrow HD6as9UHeN5RwtzgmWmBWbdTaYtTXGNjfXag3Rgby8Rf, $1,325 USDC locked, open) → **submit MUST be signed --keypair**.
- submissionCount 880 at ~17:35 WIB 14 Nov (field besar, masih tumbuh).
- Quota (server): day cap 3, taken 0, left 3, resets 2026-11-15T00:00Z; hard limit 20. Description says max 5/day, 10 total — server yang berlaku.
- Kit: ~/workspace/makefun/token-radar-01-kit/ (tarball 5.446.982 byte) + token-radar-01-kit.tar.gz.
- Snapshot: as_of 2026-11-14, DefiLlama api.llama.fi/protocols fetched 2026-11-14T01:18:33Z; **758 protocols ≥ $5M TVL, watchlist 40** (TVL ≥ $50M floor, no token, not wrapped/staked/bridged); 600 no-token protocols total.

## Deliverables / gate (7 rows, all must pass)
- main.ts (Node 22, stdlib only) at repo root: reads /input/snapshot.json, writes /output/board.json (100–4.000 rows), dashboard data (data.js), copies dashboard/ + screenshots/ to /output, writes /output/dossier.json via buildDossier from vendor/makefun-board.ts.
- board.json: rows {slug, name, rank 1..N unik, implied_value_usd (non-increasing by rank, not all equal), farm_steps 3–12 strings 20–600 chars}; **semua 40 watchlist ter-cover; ≥100 rows → ≥60 di luar watchlist**.
- Dashboard: index.html + ≥1 .css + ≥1 .js, ≤400 files, ≤4 MiB, **no network URL anywhere**; **source dashboard ≤64 KB total** (dossier text cap 65.536 byte — judge baca utuh); screenshots 3–4, ≤512 KiB each, long side ≤1440, short side ≥800; **target 300–350 KB each**.
- Program runs twice, byte-identical outputs; 120s limit, no network, 1 CPU, 1024 MB.
- Repo: public, created AFTER open, OSI license (MIT), owner GitHub = aikbani (connected) → no .makefun/owner.json needed.
- Transcripts: 9-check gate; sessions post-open only; authored ≥30%; entrypoint ≥1 authored line; ≥2 revising messages; priced usage (Muse sessions via --muse-usage).

## Judge (AI pairwise, superbot, margin 1–5; criteria berurutan)
1. Working radar: cover watchlist, implied value stated, screenshots + code agree.
2. Value model from snapshot figures (TVL, 7d growth, age w/o token), NOT hardcoded names; separates token-trading vs pre-token.
3. Farm plans concrete with costs + durations.
4. Dashboard sortable/filterable, readable, detail view each protocol.
5. Looks made (palette, spacing, type).

## Starter (house anchor 2-plain, strength 0.593) — JANGAN submit mentah
- Model: implied = TVL × 0.25 × growthMult × maturityMult. Board 200 rows (40 watchlist + 160 early by TVL). Farm steps: 6 template generik.
- **Beat-the-starter plan:** (a) comps-calibrated model — median mcap/TVL multiples dari protokol live-token per kategori → implied value pre-token; growth + maturity + risk adjustments; (b) farm plans lebih kaya: category/chain-specific, biaya + waktu konkret, sampai 12 langkah; (c) dashboard lebih baik: sort semua kolom, filter (kategori/chain/watchlist/TVL/search), detail view dengan breakdown model (base/growth/maturity + comps), view live-token terpisah, desain rapi; (d) board 300–400 baris (semua rankable pre-token, bukan cuma 200).
- Screenshots: NO local Chromium/Playwright on VM (checked 2026-11-14) → build agent installs Playwright + headless Chromium (npx) OR renders via browser task; target 1440×900, 300–350 KB each.

## Repo — BLOCKED on Hendra
- **Hendra must create public empty repo `aikbani/token-radar`** (GitHub App cannot create repos). Asked 2026-11-14 ~17:37 WIB. Checked 17:37 WIB: repo NOT yet created (404).
- Once created: verify created_at > 2026-11-14T10:00:00Z + MIT LICENSE in root before first submit.

## Build
- Workdir: ~/workspace/makefun/work/token-radar/
- Build agent: post-open session, MUST name the repo path explicitly BEFORE writing any code (bundle lesson: full write + ≥2 content edits per file; repo named first so bundle carries the full write).
- Submit: signed --keypair ~/workspace/makefun/makefun-keypair.json, HTTP 202 → check status → dev grade (12 games vs house anchors, then adaptive rounds) → result watch 6h.
- Result due: after deadline 2026-12-14T10:00Z (final heat; leaderboard ≤1 day after deadline).
- Claim USDC only if places, after settle, on Hendra's explicit decision.
- Login: @aik-bani ALREADY connected — do NOT run `makefun login`, do NOT send login link (template instruction bypassed, as always).
