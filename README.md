# Gatekeeper

A playable demo of the Solana TSV venue, for people who don't read code. One
isometric town holds every actor, every service, the chain and the contract;
the player is the pool's gatekeeper for one venue day. Visitors arrive with a
trade, the player asks for their papers ("Entrance is restricted. Show me your
KYC."), reads them against the rulebook, and stamps Approve or Refuse with a
finding. The gate then runs the pool's real check order and shows whether the
pool agrees.

A second way to play, **Run the venue**, turns the player into the venue's
manager: up to four pools (TSA, TSB, TSC and TSD) and a town of buildings,
each with a menu of actions. A scenario sets the venue in a state and gives
an order ("the SEC suspended Test Stock B: stop it, and only it"); the
player works out which buildings to ask, and the same check order judges
whether the venue now behaves as ordered.

Everything is simulated in the browser: no wallet, no chain, no real market
data. The venue's programs and services live in
[solana-tsv](https://github.com/Moonsong-Labs/solana-tsv); this repository
holds only the game. Every chapter, scene, place and manager action says
where it stands there: live on its main branch, in review in one of its pull
requests, or planned.

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

## Running the venue

In manager mode the player no longer judges trades: the pool does, with the
same checks and codes. The player sets the venue's state by asking the right
party: the credential bureau issues, renews and revokes credentials; the
mint house (the issuer) creates stocks and thaws vaults and accounts; owners
approve brokers from their own wallets; the gate holds each pool's versioned
trade policy; the council hall's roles pause, hold and lift; the halt board's
poster can be restored. Three of the pools stand on a second island, the
market quarter, which only this mode shows.

Each scenario lists objectives: trades that must fill or be refused, and
guard rails that hold at the start and must keep holding. The panel shows
what the pool would decide on each one right now, code included. A scenario
is won when all of them hold and their trades go through the gate one last
time: one star for solving it, one for doing it in the fewest moves, one for
never breaking a guard rail on the way.

| Scenario | What the player learns | Standing |
| --- | --- | --- |
| 1 · No KYC, no trade | Nobody can waive KYC: the bureau verifies, and the credential lets the holder thaw the account; the issuer thawing it by hand is not enough | Live on main |
| 2 · Germany, on one pool | Each pool reads its own trade policy; one credential serves every pool; renew a stale KYC check rather than loosen the policy | Live on main |
| 3 · A broker for Hana | The owner's approval, the pool's list and the broker's own credential come from three different parties | Live on main |
| 4 · Grand opening: Test Stock D | The split setup for a new stock, from the mint to the first trade | Live on main |
| 5 · The feed goes quiet | Stale evidence fails closed everywhere (7007); restoring the poster reopens only what the exchange trades | Planned: the poster service; the halts and the fresh-evidence check are in review, [solana-tsv#101](https://github.com/Moonsong-Labs/solana-tsv/pull/101) |
| 6 · The SEC suspends Test Stock B | Stopping one stock: a regulatory venue hold (7004) stops swaps and new liquidity, leaves exits open and puts the reason on record; a policy change is not the tool | In review, [solana-tsv#101](https://github.com/Moonsong-Labs/solana-tsv/pull/101); the role multisigs are planned |
| 7 · The wrong account | A short vault stops everything (7009); only the issuer can make it whole, then operations lifts the flag | Planned |
| Free play | Four pools, every rule switched on, any trade through the gate | Each action says |

`src/game/sim/manager.test.ts` replays each scenario's reference solution,
checks that it is unsolved at the start, that no step can be dropped and that
no two moves solve a longer one, that each scenario's standing is the least
built of what it needs, and that the tempting wrong moves fail the way the
lessons say.

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
- **Run the venue** on the title screen lists the scenarios and free play.
  After the briefing (`Space` takes charge), click a building or its name tag:
  a small card opens beside it, as a tower's menu does in a tower game, with a
  few big buttons. Each leads one short step at a time (whose account, which
  reason) to the action's last step, which says who really acts, how long it
  takes and where it stands; **Do it** sets it in motion. `1` to `9` pick the
  numbered choice, `Enter` does an action's last step, `Backspace` goes back,
  and `Escape` goes back or closes; a click on open ground closes the card
  too. **Try it** sends one objective's trade through the gate; **Finish**
  lights up once every objective holds.
- Address options: `?chapter=setup|eligibility|exits|halts|brakes`,
  `?manager=no-kyc|germany|broker|grand-opening|feed-quiet|sec-suspension|wrong-account|free`,
  `?autoplay=1`, `?speed=1.6`, `?mute=1`, `?quality=low|medium|high`.

## How it is built

```
src/game/
  sim/        the venue's rules, the day's script, and manager mode's venue, actions and
              scenarios: pure TypeScript, tested with node --test
  scene/      three.js: the modelling kit, the stage (camera, light through the day, post effects)
  world/      the island and the market quarter, the places, the townsfolk, effects
  core/       the directors: the day (game.ts) and manager mode (manager.ts)
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

Manager mode keeps `rules.ts` as it is. `src/game/sim/park.ts` holds the
venue with several pools (one credential per wallet, one stock account per
wallet per stock, one trade policy, halt record and budget per stock) and
builds, for each pool, the single-pool view that `judge` and `settle` read.
`src/game/sim/actions.ts` lists every action with who really takes it, what
stops it and where it stands; `src/game/sim/scenarios.ts` holds the
scenarios.

```sh
mise run check     # typecheck, then the tests
```

## Keeping it true

The game copies the venue's rules; nothing ties it to solana-tsv's code. When
the venue changes there (a pull request merges, a check or a code is added),
update `src/game/sim/rules.ts`, the standing tags in `src/game/sim/` (the
day's chapters and scenes, manager actions in `actions.ts` and scenarios in
`scenarios.ts`) and `src/game/content/places.ts`, the tables above, and the
tests.

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

In manager mode:

- The market quarter is a second island the game adds to fit three more
  pools. Yuki creates and funds every pool there too.
- Most actions belong to someone other than the venue: the bureau's, the
  issuer's, an owner's, a council role's. Each menu says who acts. The
  issuer's holding policy accepts every credential the bureau writes here
  (the United States and Germany); the venue's trade policy decides who may
  trade.
- Live today, one admin key can switch each pool's swap, deposit and
  withdraw bits (pool error 6000), withdrawals included. The council's menu
  says so, but offers the planned role-based pause, which the gate's check
  order models. The planned restriction flags hold one bit per operation; the
  game models the swap bit only. Whether that pause applies per pool or per
  stock, and whether it may hold exits, are still open decisions; here it is
  per pool and leaves exits open.
- Venue holds follow the halts pull request (#101): any hold refuses swaps
  and deposits with 7004, withdrawals pass, and only operations lifts one.
  Three halts pull requests are open (#31, #101 and #131), so the shape may
  still change. In the knowledge base the emergency role halts a stock;
  operations imposing a hold too is #101's design.
- The SEC scenario's premise, a halt feed that misses a regulatory
  suspension, is a risk the delivery estimate names; its backup is a manual
  halt by an operator role, which is what the player uses.
- Thresholds (2 of 3) and the operations time lock (10 minutes) are demo
  values; every action takes a few venue minutes so the clock moves.
- Sora's credential cannot be issued again: her file is under review at the
  bureau, a KYC provider's call that the game scripts.
- Trades the player composes are kept small enough that none moves its pool
  more than five percent, since the price band is not modelled. A broker
  trades swaps only: on main only the owner signs a deposit or a withdrawal.
- Free play's simulated events (a halt, a silent poster, a recovery that
  takes shares from a vault, an hour passing) are the world's, not the
  manager's; each is tagged Simulated.
