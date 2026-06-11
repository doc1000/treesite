# Phase 6 - Keyboard / Joydrive Navigation

Read [00-overview.md](00-overview.md) first (state model, guardrails).

## Goal

Make the Studio fully keyboard navigable and controller-ready, without building an input-remapping system. The editor must remain fully usable with normal mouse + keyboard.

## Prerequisites

- Phases 1-5 complete (a functional editor to navigate).

## Scope

- Four focus zones: TopCommandBar, ArtifactExplorer/ManifestTree, TreemapWorkspace, RightToolPanel.
- A single intent reducer so keyboard now (and gamepad later) map to the same actions.

## Keybindings (minimum viable)

- `Tab` / `Shift+Tab` - move between focus zones.
- Arrow keys / WASD - move spatial focus within the active zone.
- `Enter` / `A` - select / activate focused element (select node, trigger action, commit field).
- `Escape` / `B` - back out (treemap zoom-out to parent, clear selection, or blur field).

## States (visual)

- `focused` - transient focus ring on the element under the cursor of navigation (per zone).
- `selected` - persistent edit target (`selectedNodeId`), highlighted in tree + treemap + minimap.
- `active` - the zone currently receiving input (subtle zone outline).

## Files to add

- `studio/src/nav/intents.js` - intent constants (`UP, DOWN, LEFT, RIGHT, SELECT, BACK, NEXT_ZONE, PREV_ZONE`).
- `studio/src/nav/useNavigation.js` - hook: maps `keydown` to intents and dispatches to the active zone's handler; manages zone order and focus rings.
- `studio/src/nav/gamepad.js` - optional stub reading `navigator.getGamepads()` and emitting the same intents (left stick/d-pad -> directions, A/B -> select/back). Behind `inputMode === "controller"`; off by default.

## Files to change

- `studio/src/components/AppShell.jsx` - install `useNavigation`; render zone outlines and focus rings; expose a per-zone `onIntent` registration.
- `TreemapWorkspace.jsx`, `ManifestTreeView.jsx`, `RightToolPanel.jsx`, `TopCommandBar.jsx` - implement `onIntent(intent)` for spatial movement and activation within each.
- `studio/src/state/studioStore.js` - `activeZone`, `inputMode` (persisted).

## Steps

1. Build the intent reducer + zone registry; wire `Tab` zone cycling with a visible active-zone outline.
2. Implement spatial arrow/WASD focus within the manifest tree and the treemap (nearest-neighbor by geometry for the treemap).
3. Wire Enter/Escape to select/activate and back-out (treemap zoom-out, clear selection).
4. Add focus rings everywhere; verify no keyboard trap and that mouse still works.
5. Add the gamepad stub (optional, off by default) mapping to the same intents.

## Done-when

- The full edit loop (pick artifact -> navigate tree/treemap -> select -> edit field -> save -> deploy) is doable with keyboard only.
- Visible focus rings and active-zone indication; `Escape` reliably backs out; `Tab` cycles zones.
- Mouse/keyboard remain fully functional; no remapping UI was built; no operational code modified.

## Out of scope

- Full controller-config UI, haptics, or complex chorded inputs. The gamepad stub only proves the intent path.
