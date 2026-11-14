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

## ✅ BUILD DONE 2026-11-14 ~18:57 WIB — pushed to GitHub
- **Repo: aikbani/token-radar (public, created 2026-11-14T10:39:14Z, after open ✓). Head commit `b8a4900d78ec1d8429b1f276e7a1bb8d15c2ea46`** (v2; v1 `eeca4df319fb52f47ca7436591f473ba9a4e8832` = code only). Verified blob-for-blob on GitHub (LICENSE, main.ts, lib/model.ts, dashboard/app.js, 3× .b64).
- **Model radar-2 (comps-calibrated, fresh):** multiple = median mcap/TVL dari protokol live-token per kategori (n≥4, else overall median 0.186x on 133 live tokens), winsorized 0.03–0.75x; growth clamp [-50,+100] weight 0.5; maturity 0.6 + min(age,1095)/1095×0.4. **Rankable rule = house watchlist rule:** pre-token + NOT wrapped/staked/bridged (kategori Bridge/Canonical Bridge/Liquid Staking/Liquid Restaking/Restaked BTC/CEX, nama mengandung wrapped/staked/staking, prefix nama exchange, versioned). WBTC/USDT0/Binance-staked-ETH/Base Bridge DIKELUARKAN dari board (mereka sempat #1–#3 sebelum exclusion — jebakan starter).
- **Board: 198 rows (40 watchlist + 158 early), semua implied value unik + monotonik. Top 10:** #1 steakhouse-financial $403.911.115, #2 sentora-curator $388.016.741, #3 gauntlet $240.559.663, #4 veda $231.280.483, #5 usdd $159.170.750, #6 upshift $82.975.548, #7 bitfi-basis $81.914.550, #8 bittensor-dtao $77.272.598, #9 onre $66.090.736, #10 polymarket-international $59.152.719. **Catatan: 198 BUKAN 300+ — itu maksimum jujur dengan exclusion rule (289 tanpa exclusion, tapi board-nya tercemar wrapped products).**
- **Farm plans:** 8 langkah/row, category+chain-specific, tiap langkah bawa cost + time (capital $50–$250 by TVL tier, gas total $15–$19/plan).
- **Dashboard:** dark theme (amber accent), sort semua kolom, filter (search, category+counts, chain, watchlist-only, TVL min), detail drawer dengan breakdown model (multiple + source + n comps, growth/maturity multipliers, recompute check) + farm plan, live-token view, comps table. **Source total 41.660 byte < 65.536 — judge baca utuh.** No network URLs.
- **Gate: 7/7 PASS** (dashboard_files, board_file, sorted_by_value, coverage 40/40, farm_steps, screenshots, dossier_matches — dossier 809.945 byte, text 41.926 byte). **main.ts 2× run byte-identik** (diff -r out1 out2). Page-vs-board check (Playwright, 5 sample rows): impliedMatch true + all 8 farm steps identik.
- **Screenshots (real PNGs, rendered headless Chromium via Playwright):** 1-board.png 158.722 B 1440×900, 2-detail.png 270.145 B 1280×1024 (all 8 farm steps visible), 3-filtered.png 146.204 B 1440×900 (Dexs, 21 rows).
- **⚠️ Push constraint:** `github push-files` MENOLAK file biner (PNG "not UTF-8") — screenshots disimpan sebagai `screenshots/*.png.b64` (teks base64) dan main.ts men-decode jadi PNG asli di /output (decodeScreenshots, validasi magic bytes PNG). Decode terverifikasi: PNG hasil decode identik sha256 dengan aslinya.
- **Build session id (untuk transcript bundle): `ab90116c-700b-40fe-aab4-80a6240d3a07`** — session file `/home/hatch/agents/agent-ab90116c-700b-40fe-aab4-80a6240d3a07/sessions/ab90116c-700b-40fe-aab4-80a6240d3a07.jsonl`.
- **NOT submitted** — submit = parent (signed --keypair, escrow). Kuota saat cek: 3/hari, taken 0.

## Repo — DONE (was blocked on Hendra)
- **Hendra must create public empty repo `aikbani/token-radar`** (GitHub App cannot create repos). Asked 2026-11-14 ~17:37 WIB. Checked 17:37 WIB: repo NOT yet created (404).
- Once created: verify created_at > 2026-11-14T10:00:00Z + MIT LICENSE in root before first submit.

## Build
- Workdir: ~/workspace/makefun/work/token-radar/
- Build agent: post-open session, MUST name the repo path explicitly BEFORE writing any code (bundle lesson: full write + ≥2 content edits per file; repo named first so bundle carries the full write).
- Submit: signed --keypair ~/workspace/makefun/makefun-keypair.json, HTTP 202 → check status → dev grade (12 games vs house anchors, then adaptive rounds) → result watch 6h.
- Result due: after deadline 2026-12-14T10:00Z (final heat; leaderboard ≤1 day after deadline).
- Claim USDC only if places, after settle, on Hendra's explicit decision.
- Login: @aik-bani ALREADY connected — do NOT run `makefun login`, do NOT send login link (template instruction bypassed, as always).
