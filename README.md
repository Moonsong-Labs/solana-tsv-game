# Gatekeeper

A playable demo of the Solana TSV venue, for people who don't read code. One
isometric town holds every actor, every service, the chain and the contract;
the player is the pool's gatekeeper for one venue day. Visitors arrive with a
trade, the player asks for their papers ("Entrance is restricted. Show me your
KYC."), reads them against the rulebook, and stamps Approve or Refuse with a
finding. The gate then runs the pool's real check order and shows whether the
pool agrees.

Everything is simulated in the browser: no wallet, no chain, no real market
data. The venue's programs and services live in
[solana-tsv](https://github.com/Moonsong-Labs/solana-tsv); this repository
holds only the game. Every chapter, scene and place says where it stands
there: live on its main branch, in review in one of its pull requests, or
planned.

```sh
mise install       # the pinned Node
mise run deps
mise run dev       # http://127.0.0.1:3105
```

`mise run build` writes a static site to `out/`; any static host can serve
it.

## The day

| Chapter | What the player learns | Standing |
| --- | --- | --- |
| Prologue · Open the venue | The split setup: create the stock, create the pool, set the trade policy, the issuer thaws the vault, fund | Live on main |
| 1 · Show me your KYC | Frozen accounts (7000), credentials (7001), jurisdictions (7000), KYC age (7001); freezing alone is not enough | Live on main |
| 2 · Brokers and exits | Delegates need the owner's approval and the policy's listing; a withdrawal drops only the expiry and KYC-age tests, so an expired credential may still exit and a revoked one is held | Live on main |
| 3 · When the market stops | A primary-market halt (7004), stale evidence (7007); withdrawals never read halts | In review, [solana-tsv#101](https://github.com/Moonsong-Labs/solana-tsv/pull/101) |
| 4 · The venue's own brakes | The emergency pause (which stops swaps, not exits), an out-of-balance vault (7009), the daily share budget (7008) | Planned |

Nineteen visitors come through the gate. The first failing check decides the
code, as in the pool.

## Playing

- **Start the day** plays from the prologue; **Watch it play** runs the whole
  day on autoplay, for a projector. The title screen also starts at any
  chapter.
- At the desk: `1`, `2`, `3` ask for one paper and `Space` for all of them
  ("Papers, please"), `A` approves once every paper is down, `R` opens the
  refusal findings, `H` shows a hint. After the stamp, `Space` or `Enter`
  hurries the gate and moves on. `P` toggles autoplay, `M` mutes.
- A click anywhere finishes the line being spoken.
- Point at a building for its name; click it for what it is in the real
  system.
- Address options: `?chapter=setup|eligibility|exits|halts|brakes`,
  `?autoplay=1`, `?speed=1.6`, `?mute=1`, `?quality=low|medium|high`.

## How it is built

```
src/game/
  sim/        the venue's rules and the day's script: pure TypeScript, tested with node --test
  scene/      three.js: the modelling kit, the stage (camera, light through the day, post effects)
  world/      the island, the places, the townsfolk, effects
  core/       the director: runs the day, waits for the player, grades against the pool
  audio/      every sound and the music, synthesized with Web Audio
  ui/         the React interface: desk, papers, rulebook, cards
  content/    what each place stands for in the real system
  lab/        a modelling lab: ?lab=<place>[,<place>] shows places alone; ?lab=audio auditions the sound
```

No art or sound files ship: every model is sculpted in code from primitives
and merged into a few meshes per place, and every sound is synthesized.

`src/game/sim/rules.ts` holds the check order and the refusal codes. The codes
mirror `crates/tsv-errors` in solana-tsv; the order follows the knowledge
base's check-order decision. `src/game/sim/campaign.test.ts` replays the whole day and checks
every visitor's outcome, that a refusal writes nothing, what a withdrawal
does and does not check, and the pool's math (the 12.40 opening price, about
0.80 TSA for 10 USDC).

```sh
mise run check     # typecheck, then the tests
```

## Keeping it true

The game copies the venue's rules; nothing ties it to solana-tsv's code. When
the venue changes there (a pull request merges, a check or a code is added),
update `src/game/sim/rules.ts`, the standing tags in `src/game/sim/` and
`src/game/content/places.ts`, the table above, and the tests.

## What is simplified

- Numbers are plain JavaScript numbers, not the program's integer math.
- The clock, the primary market and the halt poster are scripted.
- Governance thresholds (2 of 3), the time lock and the 6-share daily budget
  are demo values; production values are an operator decision.
- Which refusal code a venue pause carries is not settled (the knowledge
  base's code list has none; the halts pull request reuses 7004); the game
  says so.
- The emergency pause in the script pauses swaps. A withdrawal passes any
  halt or pause (the controlled-exit decision): one visitor's case in
  chapter 4 turns on it. Only an out-of-balance vault stops exits too.
- The halts design also adds a price band (7011). The game does not model it:
  the simulated exchange quotes what the pool trades at, and a test keeps
  every scripted trade that reaches pricing within five percent of that quote.
- The public feed board shows fills only, as the design says, and is marked
  planned; the Record panel is what the indexer keeps (fills, liquidity moves
  and refusals).
- On main the wallet that creates the pool is the only one that can fund it,
  so Yuki does both; pool creation by a venue role is planned.
