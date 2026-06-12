# Phase 6 — Interaction Traces (record + replay)

Read [tuneup-00-overview.md](tuneup-00-overview.md) first.

> **Status: net-new feature, optional / deferrable.** This is the only backlog item that is
> not a fix or simplification of existing behavior. It is the largest new surface, so it is
> sequenced last and gated behind open question #5. Do not start it until the tune-up
> (Phases 1–5) is settled.

## Goal

Record a viewer's clicks / navigation through the deployed site as a trace, then view and
play back that trace as a log.

## To-do item covered

- L3 — add click and navigation traces — viewable, playable logs.

## Why it's isolated

- It depends on the *final* navigation model (Phase 3 select/open) and the *final* card
  behavior (Phase 4), so building it earlier would mean reworking it.
- It introduces persistence questions (where do traces live? are they exported with the
  artifact? privacy?) that the rest of the tune-up does not have.

## Proposed contract (to confirm before building)

- **Capture:** the handler already centralizes navigation through `goTo` / `navigateToCard`
  in `handler/src/TreeSite.jsx`. A trace recorder can subscribe there and emit ordered events
  `{ t, type: "select"|"open"|"back"|"search", slug, fullName }` — no scattered listeners.
- **Storage (open question #5):**
  - *Local-only* (recommended first cut): keep the trace in memory / `localStorage`; a
    "Record" toggle + "Play" control in the sidebar. Nothing leaves the browser.
  - *Persisted/exportable:* write traces into the artifact (e.g. `traces/<id>.json`) via a new
    Node tool + bridge route. Heavier; only if you need to share/replay across machines.
- **Replay:** drive `navigateToCard(slug, {animate:true})` from the recorded event list with
  the existing `CARD_NAV_STEP_MS` cadence; a transport (play/pause/step/speed) in the sidebar.
- **Viewable log:** a simple list panel of the events with timestamps; clicking an entry jumps
  there.

## Files (indicative, local-only cut)

- **New** `handler/src/traceRecorder.js` — subscribe to navigation, build the event list.
- `handler/src/TreeSite.jsx` — emit events from `goTo`/`navigateToCard`; add Record/Play UI to
  the sidebar.
- (Persisted variant only) **new** `tools/node/save-trace.js` + bridge route.

## Done-when (local-only cut)

- Recording produces an ordered, timestamped event list visible in a panel.
- Play replays the path with animated navigation; pause/step work.
- No artifact/schema change in the local-only cut.

## Flags / risks

- **Scope:** this is a feature, not a fix; confirm priority before committing engineering.
- Decide local-only vs persisted (open question #5) up front — it changes whether any Node
  tool / schema work is needed.
- Honor the user rule: no speculative scope beyond "record + view + play" until asked.
