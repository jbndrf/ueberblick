# Modeling Work — A Toolbox of Ideas

> A reference / idea collection for whenever we model a real-world process in Überblick
> (and in general). **Not rules.** Most sections offer several options and trade-offs rather than
> one prescribed answer. Part A is engine-agnostic (how to model work at all); Part B maps the
> ideas onto Überblick's current engine, framed as building blocks and trade-offs.
>
> Working note from a June 2026 design session (CMMN question, Baumkataster as the running
> example). Treat code/field claims as *as-of-then* — verify against current code before relying
> on them.

---

# Part A — Modeling as a discipline (engine-agnostic)

## A1. How to use this

This is a **toolbox**, not a checklist. When a process needs modeling, the value is usually less
in knowing the "right" diagram and more in:

- asking the right questions about the *real world*, and
- recognizing which **shape** and which **vocabulary** the answers point to.

Pick ideas as they fit. Most of the time several options are defensible; the document tries to name
them so the choice is conscious.

## A2. Mindset: an interviewer, not an architect

Most people cannot model their own work from a blank canvas — and neither can an agent staring at
one. Modeling-from-nothing is the wrong skill; **elicitation** is the right one. A good consultant
doesn't arrive knowing your business — they carry a small set of question patterns that pull the
structure out of you. The model is a *byproduct* of good questions.

> The agent is an **interviewer with an ontology in its back pocket** — not an architect.

A useful self-constraint: **don't invent structure the user didn't confirm in their own words.**
Every edge, every "this is final," ideally traces back to a sentence about their actual world.
Ask about reality, not the diagram:

| Instead of (about the diagram) | Ask (about reality) |
|---|---|
| "Should this transition be reversible?" | "If a damage was marked resolved but it's still broken — does it reopen, or do you file a new report?" |
| "Is this state terminal?" | "Once a tree is felled, is that the end of it, or does anything ever happen to that record again?" |
| "Do these run in parallel?" | "Can a yearly inspection be going on *while* you're also handling a fresh storm-damage report on the same tree?" |

This is a stance, not a law — sometimes proposing a structure and asking "does this match?" is faster.
But defaulting to reality-questions keeps the model honest.

## A3. Two fundamental shapes

Two example entities expose the core split:

- **Damage report** — appears, gets handled, disappears. A lifecycle *with an end*: born → states → dies.
- **Tree** — always exists, gets inspected on a cycle, never "completes." A *standing entity* with
  recurring obligations.

A handful of reality-questions and what they tend to decide structurally:

| Reality question | Tends to decide |
|---|---|
| Does it ever finish and vanish, or go on forever? | end state vs. standing entity |
| Can a "done" thing become "not done"? | back-edges / reopen |
| Must B follow A, or any order? | sequence vs. declarative availability |
| Who decides the move — a rule, a clock, or a person? | gateway vs. timer vs. human task |
| Can two things be true at once? | parallel vs. exclusive |
| What makes work re-appear on a thing that never ends? | recurrence trigger |

The single orienting question: **does this thing reach an end and disappear, or persist and need
tending?** Both shapes are first-class; many real entities are a *hybrid* (a tree that can also be
"removed" has a standing core plus one terminal exit).

## A4. Vocabulary toolbox

**Atoms**

- **Activity / Task** — a unit of work.
- **Stage / sub-process** — a container grouping work (can act like a mini-process).
- **State** — a named condition the entity sits in.
- **Event** — something that happens (often from outside).
- **Sequence flow** — an edge between elements.
- **Gateway** — a branch/merge point.
- **Token** — the marker showing *where you are now*; movement = the token sliding along an edge.
  (State machines / BPMN have exactly one token per instance; CMMN has none — see A8.)

**The four connectors**

| Connector | Meaning |
|---|---|
| **Sequence** | plain steps in a row (A → B → C) |
| **Exclusive (XOR)** | one path; an either/or |
| **Parallel (AND)** | all paths at once, then wait for all (a *synchronization* join) |
| **Inclusive (OR)** | some paths, one-or-more |

**Named patterns** (a few of the most reusable from the workflow-patterns canon)

- **Loop / rework loop** — going back to redo (the "feedback loop").
- **Milestone** — a gate in time/state; opens or closes what's allowed.
- **Interleaved routing** — any order, but only one at a time.
- **Deferred / discretionary choice** — the branch is chosen as late as possible, by the
  environment/worker, not by a data rule decided up front.
- **Cancel** — an escape hatch to a terminal state.

**CMMN words** (for standing entities / case work)

- **Sentry** — a condition that activates (or terminates) the element it's attached to.
- **Stage** — behaves like a sub-process.
- **Entry / exit criterion** — what makes a stage start vs. end.
- **Milestone (CMMN)** — an achievement marker that can itself trigger other things.

Canonical reference for the full pattern catalog: the van der Aalst / Russell / ter Hofstede
**Workflow Patterns** (workflowpatterns.com).

## A5. Lifecycle topologies (a catalog of shapes)

Lifecycles tend to fall into a small set of recognizable shapes. Treat these as a palette:

- **Linear / pipeline** — no going back (rarer in reality than in diagrams).
- **Rework loop** — branches into "good → move on" / "not good → go back."
- **Self-loop / retry** — a state points back to itself.
- **Reopen / resurrection** — a terminal-looking state comes back to life.
- **Escape hatch / cancel** — any state → a "killed" dead-end.
- **Pause / resume (suspend)** — active ⇄ on-hold (frozen, not rewound).
- **Fork + join** — simultaneous tracks that must all finish.
- **Escalation / timeout** — a time-driven jump, not a decision.

A rework loop, sketched:

```
To be checked → Currently being checked → Checked & fine
      ↑                    │
      └──── Needs work ◄────┘
```

## A6. The five causes of a transition

A practical lens: every transition is caused by exactly one of —

1. **Decision** — someone chooses (pass vs. fail).
2. **Completion** — the work in that state finished.
3. **Event** — something arrived from outside (re-report → reopen).
4. **Timer** — time passed (→ escalate).
5. **Guard** — a condition became true (all parts in → resume).

To model any lifecycle, you can go state by state and ask: *"What are the exits here, and for each,
what causes it — decision, completion, event, timer, or guard?"* The topologies in A5 mostly fall
out of this; you generate patterns rather than memorize them.

This also answers *"how do we know going back is valid?"*:

> A back-edge is worth drawing **when you can name its cause.** No nameable cause, no edge.

- "Needs work → to be checked" is valid: a real *completion* (repair done) genuinely means it needs
  re-checking.
- "Checked & fine" does **not** loop back to checking — nothing makes a fine tree need checking
  *right now*. Only the yearly *timer* eventually re-triggers it, and that's a fresh cycle, not a
  backward edge. (This distinction matters: see A7.)

## A7. Cause × Scope

A transition has two independent properties — and naming both avoids a lot of confusion:

- **Cause** = decision / completion / event / timer / guard (A6).
- **Scope** = *state-scoped* (exits one specific state) vs. *entity-scoped / global* (applies
  anywhere the entity is alive).

| What you mean | Name | Notes |
|---|---|---|
| Changes by automation, not a person | automatic transition | cause ≠ person |
| Caused by time | timer event / temporal trigger | |
| Time on a schedule | recurring / cyclic timer | |
| Applies from any state | global / cross-cutting transition on a superstate | scope = global |
| Re-opens a recurring obligation | recurrence trigger / CMMN entry sentry with timer | the tree's "yearly check" |

"1 year passed, from any stage" = **timer cause + global scope**. In statechart terms: a
self-transition on a composite/superstate wrapping all inner states. In CMMN: an entry sentry
watching a yearly timer — independent of which state the entity is in. A good interview adds *scope*
to the question: not just *what causes this move*, but *does it apply from one state or all of them?*

## A8. The spectrum: CMMN ↔ state machine ↔ BPMN

CMMN allows **multiple stages active at once** because it's built on **availability, not position**.
There's no single token — each stage independently watches its own entry sentry, and any number can
be open simultaneously (e.g. annual inspection *and* storm-damage handling in parallel). It's
declarative: stages don't know about each other.

Constrain CMMN to *one* active stage (mutual exclusion) and you re-derive a state machine:

| Model | Rule | What it is |
|---|---|---|
| CMMN | many stages active | declarative case, availability-based |
| CMMN with "max one active" | mutual exclusion | a state machine |
| BPMN | one token along a path | state machine + imposed sequence |

> A state machine is just CMMN with a "max one active" rule. BPMN is a state machine that also pins
> down the order. Same family, increasing constraint.

The deciding question, in plain language (the user never needs the words "CMMN" or "mutual
exclusion"):

> "Can two things happen to the same tree at once — a yearly inspection *while* handling a fresh
> damage report? Or must one finish before the other starts?"

- **"Together"** → leans CMMN: multiple stages, sentries.
- **"One at a time"** → constrain to one active stage → a state machine (BPMN / statechart).

So the whole model-family choice often reduces to: *do obligations on this entity overlap, or
queue?*

## A9. Runtime / execution note

An idea worth keeping even outside Überblick: **don't let an LLM hold the current stage in its
head** — it drifts. Let an **external engine hold the state**; the LLM only *proposes* transitions,
and the engine validates against the allowed moves and commits. That's exactly what a
human-in-a-process does: the system tells you the current task and your legal next moves.

A minimal loop:

1. External state store holds current stage + case data.
2. An *available-transitions* function computes the legal moves from here.
3. The LLM gets `(current stage, data, menu of legal transitions)` → picks one, with a reason.
4. A validator checks the pick is in the legal set.
5. The engine commits, logs, loops.

Tooling worth knowing: **LangGraph** (state graph, conditional edges), **Flowable** (a real
BPMN/CMMN engine with AI-agent tasks). Pattern reference: **workflowpatterns.com**.

---

# Part B — Mapping the ideas onto Überblick

Überblick today is, in the spectrum above, a **single-token state machine** (one
`current_stage_id` per instance) that borrows CMMN's word "sentry" for data-guards on transitions.
That's a deliberate constraint, not a deficiency — it covers a lot. Below: what maps cleanly, and
where the edges are, each with options rather than a verdict.

## B1. Vocabulary mapping (CMMN → Überblick)

| CMMN idea | Überblick today | Notes |
|---|---|---|
| Case | `workflow_instance` | one token |
| Case Plan Model | `workflow` | |
| Case File / Case File Items | `workflow_field_values` (append-only event log) | strong fit |
| Stage | `workflow_stage` | flat (no nesting); exactly one active |
| Entry criterion / ifPart | `workflow_connections.sentry` | data-guards, client-side eval |
| onPart (event trigger in a sentry) | the automation engine (separate subsystem) | not inside sentries |
| Event listener (timer) | `scheduled` automation (cron, `inactive_days`) | server-side |
| Event listener (user) | a connection button tap | |
| Repetition / loops | back-edges & self-loops | no cycle check |
| AutoComplete / auto-advance | automation `set_stage` / `set_instance_status` | server-side |
| Human task | a tool (form / edit / protocol) on a stage/connection | not a first-class item with its own lifecycle |
| Exit criterion | — | approximated via guards/automation |
| Milestone | `stage_type='end'` (rough) | no standalone milestone |
| Discretionary task / planning table | — | |

Two of CMMN's hardest ingredients are already here: an **event-sourced case file** and a
**rule/event engine**. The piece that isn't is the **declarative, concurrent runtime**.

## B2. Building blocks that work well today

Things you can lean on (ideas, not obligations):

- Cyclic, never-ending workflows (Baseline → Inspect → Decide → branch → back).
- Sentry-routing on field values, including **multi-clause** (AND-ed) guards.
- **Protocols** = immutable, hashed snapshots per event, mixing *case fields* (also written to the
  shared value log) and *local fields* (snapshot-only).
- Conditional logic (`show_if`), smart dropdowns (options depend on another field), field-tags
  (map/data filters).
- Computed fields + condition-scaled escalation intervals.
- Data-tabs + per-field `view_roles` for information architecture.
- "Buttons that do a task, routing as automation" (see B4) via buttonless router stages.

## B3. Process patterns → Überblick options

| Pattern (A4/A5) | One way to do it today | Alternative(s) |
|---|---|---|
| Sequence | connections in a row | — |
| Guard / data precondition | `sentry` (ifPart on field values) | — |
| Rework loop | back-edge + sentry | manual button vs. auto via automation |
| Milestone / continuation | end-stage or a status field + automation | a dedicated "achieved" boolean field that guards later steps |
| Timer / auto-advance | `scheduled` automation | client "due" highlight + manual start (works offline) |
| Escalation | computed interval + routing automation | shorter re-inspection interval; or a priority field surfaced on the map |
| Parallel split | (not single-token-native — see B4 concurrency) | model parallel tracks as separate instances / sub-entities |
| Deferred / discretionary choice | (no planning table) | offer several always-available stage tools and let the worker pick |

## B4. Trade-offs & alternative concepts

Each limitation below is a real edge of the single-token engine — and each has more than one way
forward. None of these is "you can't"; they're "here are the options and their costs."

### Concurrency (multiple things active at once)
Single-token means one `current_stage_id`; native parallel stages aren't there. Options:

- **Separate instances / sub-entities** — model each concurrent obligation as its *own* workflow
  instance (e.g. a tree's "annual inspection case" and "storm-damage case" as two instances linked
  by a shared key). Cheap; works today; the cost is that "the tree" is now several records.
- **Encode parallel tracks as fields** — keep one instance, track each track's status in its own
  field, and gate work with sentries. Works for a small fixed number of tracks; gets awkward as
  tracks grow.
- **True `active_stages[]`** — the big change: an instance holds a *set* of active stages, with a
  track-card participant UI. Most faithful to CMMN; largest build. Worth it only if obligations
  genuinely overlap (the A8 question answers "together").

### Offline routing (the important practical one)
**Downside:** automations run **only server-side** (`pb_hooks/automation.js` + `main.pb.js`);
`src/lib/automation/` is just cron-text helpers for the admin UI. So *any* automation — routing,
computed fields, "due" nags — fires only when queued writes replay online. What *does* work offline:
optimistic writes (fields/protocols/transitions → IndexedDB queue) and **client-side sentries**
(`sentry.ts` evaluates *local* field values, so sentry-gated buttons show/hide correctly offline).

So a workflow whose routing is "automation into a buttonless router stage" will, offline, leave the
instance sitting in that router until sync. Options:

- **Run the routing step manually in the client** — turn the router into **sentry-gated buttons**
  instead of a server automation. The client evaluates the same guard locally and the worker taps
  the (single matching) button; the transition is optimistic and replays on sync. This is itself a
  generally useful modeling concept: *a "decision" that must work offline lives as a client-evaluated
  guard, not a server rule.* Cost: it reintroduces a button (mitigated by only the matching one
  showing, one tap).
- **Hybrid by urgency** — keep server automation for things that can be eventually-consistent
  (next-due dates, escalation timers, nags) and use client sentry-buttons only for routing the field
  worker needs *in the field, offline*. Often the cleanest: in many real flows (e.g. tree
  inspection) the inspector records offline and a *different* crew does the follow-up later, so
  server-routing-on-sync is perfectly fine — then the only polish is labeling the buttonless router
  stage so it reads as "pending sync" rather than a dead end.
- **Client auto-advance engine (build-out)** — evaluate routing rules locally and optimistically
  set `current_stage`, reconciling on sync. This is the only way to get *both* "no routing buttons"
  *and* offline auto-routing. It's real work in `participant-state/`, but conceptually it's the
  natural endgame: the routing rules already exist; they'd just also run client-side.

> The underlying tension: **"routing = server automation" and "offline-first" pull apart unless the
> routing also runs client-side.** Naming that tension up front makes the per-workflow choice easy.

### "Button = task" vs. offline
A nice principle is *a button should cost the user a task (capture data / assert real-world work);
pure data-derived routing can be an automation.* It pairs with: *a stage earns its keep only if the
instance meaningfully **waits** there*; pure router stages can be buttonless and auto-advanced; and
high-stakes/irreversible steps (felling) can stay an explicit human button *as* the authorization
task. This is a strong default — with the offline caveat above: where the worker is offline, the
"automation" half of the principle may need to fall back to a client sentry-button. Treat
"button = task" as a guiding idea, not a hard rule.

### Exit criteria / milestones / discretionary work
Not native, but approximable:

- **Exit criterion** (terminate when a condition holds) → a sentry-gated transition to an end/router
  stage, or an automation that flips status.
- **Milestone** → a boolean/marker field set when achieved, then used in later sentries; or an
  end-stage if it's truly terminal.
- **Discretionary tasks** → expose several always-available stage tools and let the worker choose
  (a poor-man's planning table). Full deferred-choice semantics would need engine work.

## B5. Write modes & protocol-vs-entity (a decision aid)

"Where does a field live?" — two questions: its **write mode** and (if it's a recurring report)
**case field vs. protocol-local**.

| If the field is… | write mode | typically captured by | example |
|---|---|---|---|
| Master data, set once, rarely changes | `singleton` | creation form | species, planting year |
| Current state *now*, overwritten, drives guards/display | `singleton` | inspection protocol (case field) / edit tool | current condition, traffic-safety |
| A measurement you'll trend/aggregate | `observation` | protocol case field / stage form | trunk circumference (growth) |
| The frozen record of one event (many fields, legal proof) | — (snapshot) | protocol **`local_fields`** | inspector, weather, photos, raw notes |
| Derived from other fields | `computed` | automation expression | next-due date, days-overdue |

A useful test for protocol-local vs. case field:

> **Does anyone downstream need this value as *live state* (a later worker, a sentry, an automation,
> the map)?** Yes → case field (in the entity). No, it's only the frozen record → protocol-local.

And a payoff worth internalizing: **a `singleton` case field holds the *current/open* value; the
protocol snapshots preserve *every past* value.** So you often don't need `observation` for history
when the history is a series of *reports* — the snapshots *are* the history. Use `observation` when
the history unit is a single number over time (something you'll chart or aggregate).

## B6. Information architecture (for "lots of data per entity")

- **Data-tabs** (`display_config.tab`) group the participant "Data" view; tabs are emergent (the
  distinct `tab` values). E.g. Master data · Condition & Inspection · Action & Sign-off · Growth.
- **Form pages** (`set_form_pages`) split big forms (Findings / Damage / Docs).
- **`view_roles`** per field-def is the field-level read gate (there's no stage-level visibility).
- **Conditional logic** (`show_if`) reveals fields in context (damage fields only when condition ≠ ok).
- **Smart dropdowns** make options depend on an upstream field (damage type ← damage area).

## B7. Gotchas (observed; verify against current code)

- **Umlaut comparison.** Server-side `equals` can silently fail on `ä/ö/ü/ß` values (NFC/NFD
  normalization). A robust workaround: compare with `contains` on an ASCII prefix (`Gesch`, `Auff`,
  `Akut`). Applies to automation conditions *and* sentry clauses.
- **Protocol field write order.** A protocol writes its fields *sequentially*; an `on_field_change`
  trigger fires mid-batch and can't see fields written after it. For multi-field routing, trigger on
  `on_transition` *into a buttonless router stage* (all fields committed by then). Single-field
  routing on `on_field_change` is fine.
- **Sim vs. sentries.** The `participant_*` simulation tools don't evaluate sentries (those are
  client-side) — they return *all* outgoing connections. Verify gating in the real PWA.
- **Linear progress is a poor fit for cyclic assets.** There is dead/orphaned `progressPercentage`
  code; a current-state chip suits never-ending entities better than a `start→end` bar.
- **UX lint.** `preview_workflow_ux` flags buttonless intermediate stages as "dead-end" — for
  intentional `on_transition` auto-routers that warning is expected/benign.

## B8. Reference example: Baumkataster – Vollmodell

A realistic tree-inspection case (FLL-style) exercising most of the above:

- **Tasks (buttons):** record tree · inspection protocol · work record · sign-off assessment ·
  immediate-securing · *authorize felling* (human).
- **Routing (invisible automations):** findings → measure line / immediate / felling-proposed /
  back; sign-off → monitoring / rework line / felling; immediate-securing → line by damage area.
- **Data:** `singleton` (condition, recommendation), `observation` (trunk circumference), `computed`
  (next-due, days-overdue); a protocol with case + local fields, conditional damage page, smart-
  dropdown damage type; four data-tabs.
- It demonstrates: cyclic standing-entity shape, multi-clause sentries, protocol case/local split,
  "button = task / routing = automation," computed escalation — and, by extension, the offline
  trade-off in B4 (its routing is server-side; offline it would wait for sync, or be swapped for
  client sentry-buttons).

## B9. Further reading

- **Workflow Patterns** — the canonical catalog of control-flow / resource / data patterns:
  workflowpatterns.com (van der Aalst, Russell, ter Hofstede).
- **LangGraph** — state-graph orchestration with conditional edges (good fit for the A9 runtime loop).
- **Flowable** — an open-source BPMN/CMMN engine, including AI-agent tasks.
