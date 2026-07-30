# UI Visual Design System

## Status

This document is the canonical visual and interaction system for the loopback-only DevSpace Control Center.

It governs the local dashboard. MCP App cards remain compact host-embedded tool-result surfaces and reuse only compatible tokens and components.

## Design intent

DevSpace Control Center is a professional developer operations surface.

It should feel like a precise local cockpit: calm when nothing is wrong, information-dense while work is active, and unmistakably clear when an operation is blocked, failed, unverified, or dangerous.

The interface must not resemble a marketing page, generic admin template, or decorative AI-generated dashboard.

## Core principles

### Hierarchy before decoration

The user must see project, run state, current action, and evidence before secondary metadata. Decoration never competes with operational state.

### Dense, not cramped

Desktop space is used efficiently. Rows and panels carry meaningful information, but labels, grouping, and spacing preserve scanability.

### One state, one meaning

The same state uses the same text, icon, and color role everywhere. Color never changes meaning between screens.

### Text remains authoritative

Icons and colors support status but do not replace explicit labels such as `Running`, `Blocked`, `Verification pending`, or `Failed`.

### Motion represents reality

Animation indicates a real live transition, reconnect, or active process. There is no fake progress, decorative shimmer loop, or timer-generated activity.

### Instrument clarity over AI atmosphere

Use one action-and-selection accent, one tightly scoped live-state accent, neutral surfaces, and explicit pane chrome. Hierarchy comes from density, typography, thin separators, and a selected edge—not from large radii, glow, gradients, or an oversized stage.

The Runs workspace borrows the discipline of a modern professional terminal without copying another product's branding or retro color wall. Time, state, evidence, and current action are the visual heroes. Motion represents a newly observed transition only; a connected or running state is otherwise steady.

## Theme strategy

- Follow the operating-system theme by default.
- Support explicit light and dark modes without separate component logic.
- Store visual roles as CSS custom properties.
- Do not hard-code status colors directly inside components.
- Do not require a new design-system dependency for the first implementation.

## Color tokens

### Light theme

```css
:root {
  --ds-bg-canvas: #eceff2;
  --ds-bg-surface: #f8f9fa;
  --ds-bg-subtle: #eef1f3;
  --ds-bg-elevated: #ffffff;
  --ds-bg-selected: #fff1df;
  --ds-bg-hover: #f2f4f5;

  --ds-border-default: #c5cbd1;
  --ds-border-strong: #858d98;
  --ds-border-subtle: #dfe3e7;

  --ds-text-primary: #11151a;
  --ds-text-secondary: #4e5661;
  --ds-text-tertiary: #626b76;
  --ds-text-inverse: #ffffff;

  --ds-accent: #a94b00;
  --ds-accent-hover: #873c00;
  --ds-accent-subtle: #fff0dd;
  --ds-signal: #087a57;
  --ds-signal-subtle: #ddf5eb;
  --ds-focus: #8a3d00;

  --ds-success: #19734b;
  --ds-success-subtle: #e7f6ee;
  --ds-warning: #946200;
  --ds-warning-subtle: #fff4d6;
  --ds-danger: #b42318;
  --ds-danger-subtle: #fff0ee;
  --ds-info: #2563b9;
  --ds-info-subtle: #eaf2ff;

  --ds-terminal-bg: #0e1117;
  --ds-terminal-text: #dce3ed;
  --ds-diff-add-bg: #e8f7ee;
  --ds-diff-add-text: #17643e;
  --ds-diff-remove-bg: #fff0ee;
  --ds-diff-remove-text: #9f241b;
}
```

### Dark theme

```css
:root[data-theme="dark"] {
  --ds-bg-canvas: #07090b;
  --ds-bg-surface: #0d1013;
  --ds-bg-subtle: #11151a;
  --ds-bg-elevated: #0d1013;
  --ds-bg-selected: #24170b;
  --ds-bg-hover: #151a20;

  --ds-border-default: #252b32;
  --ds-border-strong: #525a64;
  --ds-border-subtle: #191e24;

  --ds-text-primary: #f2f3f5;
  --ds-text-secondary: #adb3ba;
  --ds-text-tertiary: #78818b;
  --ds-text-inverse: #11151a;

  --ds-accent: #ff8a1f;
  --ds-accent-hover: #ffad61;
  --ds-accent-subtle: #2a190b;
  --ds-signal: #56d6a1;
  --ds-signal-subtle: #0d2b21;
  --ds-focus: #ff9f43;

  --ds-success: #55c78e;
  --ds-success-subtle: #153426;
  --ds-warning: #e6b85c;
  --ds-warning-subtle: #3a2d13;
  --ds-danger: #ff8278;
  --ds-danger-subtle: #3c1d1b;
  --ds-info: #78a9ff;
  --ds-info-subtle: #172c4b;

  --ds-terminal-bg: #080a0f;
  --ds-terminal-text: #dce3ed;
  --ds-diff-add-bg: #143222;
  --ds-diff-add-text: #72d6a3;
  --ds-diff-remove-bg: #3a1c1a;
  --ds-diff-remove-text: #ff948a;
}
```

### Status mapping

| Meaning | Color role | Required label examples |
|---|---|---|
| active / informational | info or accent | Running, Connecting, Verifying |
| successful | success | Passed, Verified, Available |
| attention | warning | Blocked, Verification pending, Partial results |
| failure / destructive | danger | Failed, Not allowed, Stop run |
| neutral / inactive | tertiary | Not run, Completed, Unavailable |

`Completed` is neutral unless the assurance stage is separately `Verified`.

## Typography

### Font families

```css
--ds-font-sans: "Segoe UI Variable", "Segoe UI", Inter, ui-sans-serif, system-ui, sans-serif;
--ds-font-mono: "Cascadia Mono", "Cascadia Code", "SFMono-Regular", Consolas, monospace;
```

Do not download a font as a runtime requirement. Use locally available fonts and stable fallbacks.

### Type scale

| Token | Size / line-height | Use |
|---|---|---|
| `caption` | 12 / 16 | timestamps, helper metadata |
| `label` | 13 / 18 | controls, compact row labels |
| `body` | 14 / 20 | default content |
| `body-strong` | 14 / 20, 600 | row titles, key values |
| `section` | 16 / 22, 600 | panel headings |
| `page` | 20 / 28, 650 | screen heading |
| `display` | 24 / 32, 650 | rare empty or onboarding state |
| `stage` | 22 / 28, 650 | selected operation title inside a dense workspace |
| `mono` | 13 / 19 | paths, commands, IDs, terminal-adjacent data |

Operational screens do not use marketing hero typography. The `stage` scale stays close to the page scale so the selected operation shares the first viewport with its current action, timestamps, and evidence.

## Spacing and sizing

Use a four-pixel base grid.

```css
--ds-space-1: 4px;
--ds-space-2: 8px;
--ds-space-3: 12px;
--ds-space-4: 16px;
--ds-space-5: 20px;
--ds-space-6: 24px;
--ds-space-8: 32px;
--ds-space-10: 40px;
```

Default control height is 32px. Primary form controls may use 36px. Dense data rows target 44-52px depending on secondary metadata.

## Shape and elevation

```css
--ds-radius-sm: 2px;
--ds-radius-md: 2px;
--ds-radius-lg: 4px;
--ds-radius-stage: 2px;
--ds-shadow-menu: 0 6px 18px rgb(0 0 0 / 0.22);
```

Rules:

- ordinary panels and the selected workspace use borders rather than floating card shadows,
- adjacent operational panes use four-pixel gutters and the same planar level,
- selection uses an accent edge plus contrast; it does not become a glowing card,
- menus, popovers, and dialogs may use one restrained shadow,
- status badges use compact rectangular treatment only when shape helps meaning,
- not every label becomes a badge,
- deep shadows, glass, and repeated rounded cards are not operational hierarchy.

### Screen depth profiles

- Projects is the calm administrative layer: a dense table, restrained selected row, and one evidence inspector.
- Runs is a contiguous professional workspace: run rail, selected activity, and evidence inspector are rectilinear peer panes, with the center identified by one accent edge and stronger data hierarchy.
- Live visual cues originate from retained operation events or stream connection state. Steady state uses a steady square or dot; continuous pulsing is not used.
- The signal accent is a live cue only. The orange accent is reserved for selection and action. Neither replaces success, warning, danger, or assurance semantics.

### Action-queue vocabulary

Runs translates canonical state into four presentation queues:

| Queue | User decision | Canonical inputs |
|---|---|---|
| `NOW` | follow work that is underway | queued, running |
| `ACTION` | intervene or inspect a failure | blocked, stopping, failed |
| `REVIEW` | inspect a result and its proof | result available, verification pending, verifying |
| `ARCHIVE` | retain settled history | stopped, verified, other completed |

Rules:

- queue membership is derived, mutually exclusive, and never persisted as a second state,
- summary, rail, and selected-run chrome use the same order and vocabulary,
- exact state and assurance text remains visible,
- `NEXT ACTION` may provide bounded derived guidance but never claims execution or verification,
- visual treatment uses queue codes, thin rules, and compact type rather than task-card or Kanban styling.

### Financial-data module rhythm

Runs uses the scan discipline of a market-data desk without borrowing another
product's identity:

- summary, filters, rail, stage, and evidence are the primary modules,
- primary modules use eight-pixel gutters and at most a four-pixel outer radius,
- rows remain rectilinear and share column baselines,
- queue totals use tabular numerals and stronger scale than their labels,
- state and updated time share a stable metadata line in the run rail,
- borders separate data groups; color is reserved for selection, live state,
  and semantic status.

This is not permission to add decorative charts, marketing cards, oversized
whitespace, or rounded containers around each data row.

## Layout system

### Application shell

Desktop target: 1280px and wider, optimized around 1440-1600px.

```text
+------------------+-----------------------------------------------+
| Primary nav      | Page header / command area                    |
| 216-232px        +-----------------------------------------------+
|                  | Main content                                  |
|                  | optional inspector 320-380px                  |
+------------------+-----------------------------------------------+
```

- primary navigation: 224px default,
- page content: fluid with practical max widths per screen,
- inspector: 336px default, collapsible,
- header: 52-56px,
- content padding: 20-24px desktop, 16px compact.

### Live run layout

- runs rail: 240-280px,
- center activity: minmax(520px, 1fr),
- evidence inspector: 300-360px,
- dividers are draggable only if the implementation can preserve keyboard access and persisted layout without a new complex dependency; otherwise use fixed responsive breakpoints.

### Responsive behavior

At widths below 1100px:

- evidence inspector becomes a toggleable side panel,
- runs rail can collapse to icons plus state markers.

At widths below 760px:

- navigation becomes a top or drawer menu,
- tables switch to structured stacked rows,
- run tabs remain available,
- destructive and state-changing actions remain explicit,
- terminal and diff keep horizontal scrolling rather than wrapping code destructively.

The product remains desktop-first; mobile is supported for inspection and essential administration, not optimized as the primary coding surface.

## Component system

### App shell

Contains:

- product identity,
- Projects, Runs, Agents, and System destinations,
- global connection state,
- optional compact command/search trigger,
- theme control in System rather than a decorative header cluster.

The shell must not duplicate per-screen actions.

### Page header

Contains:

- page title,
- one-line operational summary,
- primary action,
- secondary actions in a compact group,
- optional filters below, not mixed into title text.

### Status badge

An icon, explicit label, and optional secondary detail.

Examples:

- `Running`
- `Blocked`
- `Result available`
- `Verification pending`
- `Verified`
- `Failed`

A badge never communicates only through color.

### Buttons

Variants:

- primary: one dominant action per section,
- secondary: ordinary action,
- quiet: row or toolbar utility,
- danger: stop, forget, or irreversible local mutation.

Rules:

- icon-only buttons require an accessible name and tooltip,
- destructive actions do not use the primary accent,
- disabled buttons explain the reason nearby or in a tooltip,
- mutations wait for a server acknowledgement before presenting success.

### Inputs and filters

- labels remain visible for settings and destructive decisions,
- placeholder text is not a label,
- search may use a compact leading icon,
- filter chips are used only for active filter values, not as a substitute for form structure,
- paths and IDs use monospace styling.

### Data table

Use for projects, runs, and agents when comparison across rows matters.

- sticky header when content scrolls,
- sortable columns only where ordering is meaningful,
- selected row has accent background and border cue,
- row actions appear consistently at the end,
- secondary path/ID may sit below the primary name in the first cell,
- horizontal scroll is preferable to silently dropping essential columns.

### Inspector panel

Shows details for the selected project, run, or agent without forcing a modal for ordinary inspection.

- section headings,
- definition-list alignment,
- copy actions for IDs and paths,
- inline status and evidence,
- destructive actions at the bottom, separated by a border.

### Tabs

Use for different projections of the same selected entity:

- Activity
- Terminal
- Diff
- Agent output
- Evidence

Tabs do not replace primary application navigation.

### Activity timeline

- strict chronological order,
- timestamp column,
- state/type icon,
- concise summary,
- expandable detail,
- repeated low-value events may be grouped,
- new events append without stealing keyboard focus or scrolling a user who has moved away from the end.

A `Follow live` control restores automatic scrolling.

### Terminal viewer

- monospace,
- high-contrast fixed background,
- read-only first release,
- safe ANSI rendering,
- wrap toggle,
- search and copy selection,
- visible truncation marker,
- follow-live toggle,
- stdout and stderr may be distinguished by label or restrained tone, not unreadable saturated color.

### Diff viewer

- file tree or changed-file list,
- additions/removals summary,
- unified diff default,
- lazy-load large files,
- preserve code whitespace,
- accessible added/removed labels in addition to color,
- reuse existing review/patch rendering where possible.

### Evidence projection

Each evidence item displays:

- name,
- explicit state,
- timestamp when available,
- short result or missing requirement,
- source link/action where available.

`Result available` and `Verified` must never share the same treatment.

Evidence belongs in the explicit Evidence tab. Do not reserve a permanent
desktop side rail for the same checklist: active terminal, activity, agent
output, and diff projections own the primary stage width.

### Notices

Use the narrowest appropriate surface:

- inline validation for form errors,
- panel notice for partial or blocked state,
- global banner only for dashboard-wide connection/security failure,
- toast only for transient confirmed actions such as copied ID or saved setting.

Errors remain until resolved or dismissed. They do not disappear on a timer when the user must act.

### Dialogs and drawers

- dialog: confirmation or small bounded decision,
- drawer/inspector: project edit, scan/import, or detailed inspection,
- avoid multi-step modal flows when a persistent screen is clearer,
- focus is trapped and restored correctly,
- Escape closes only when it cannot discard an unconfirmed destructive action silently.

## Interaction states

Every interactive component defines:

- default,
- hover,
- pressed,
- selected,
- focus-visible,
- disabled,
- loading,
- error where applicable.

Focus rings are always visible for keyboard users and must not be removed for aesthetic reasons.

## Motion

- ordinary transitions: 120-180ms,
- panel open/close: at most 220ms,
- a running indicator remains steady; short motion is reserved for a newly observed transition or reconnect,
- no continuously animated gradients,
- no continuously moving background,
- no fake progress bar,
- honor `prefers-reduced-motion` by disabling non-essential motion.

## Content and labeling

Use concrete operational language.

Preferred:

- `Scan allowed roots`
- `Add project`
- `Open checkout`
- `Open worktree`
- `Result available — verification pending`
- `Stop active worker`
- `Repository files will not be deleted`

Avoid:

- vague labels such as `Go`, `Magic`, `Fix`, or `Done`,
- unexplained acronyms in primary UI,
- playful copy in warnings,
- claiming success before server or verification evidence exists.

## Accessibility

Target WCAG 2.2 AA for the local dashboard.

Required:

- full keyboard operation,
- visible focus,
- semantic headings and landmarks,
- labels for every control,
- no color-only meaning,
- sufficient text and UI contrast,
- `aria-live` only for important state changes, not every terminal line,
- screen-reader text for diff additions/removals and status icons,
- logical focus after navigation, dialogs, and async mutations,
- minimum practical target size of 32px for dense desktop controls and 40px in compact/mobile layouts.

## Keyboard behavior

First implementation uses dependency-free, discoverable shortcuts:

- `/`: focus current-screen search when not typing,
- `Escape`: close the current non-destructive overlay or clear selection,
- `Enter`: open selected row or activate focused control,
- arrow keys: navigate tabs and supported listbox controls according to ARIA patterns,
- `Ctrl/Cmd + K`: reserved for a future command palette unless implemented without compromising native browser and editor shortcuts.

Do not add hidden multi-key navigation sequences in the first release.

## Implementation rules

- use the existing React/Vite dashboard entry,
- use CSS custom properties and ordinary CSS modules/files already supported by the repository,
- avoid a new component framework unless repository evidence proves it reduces total complexity,
- prefer semantic HTML over div-only widgets,
- reuse existing safe ANSI, diff, patch, and tool-display logic where compatible,
- keep dashboard components separate from MCP App card components when their host constraints differ,
- share pure formatting/status/token helpers rather than forcing one component tree across both surfaces,
- retain the current loopback security boundary.

## Prohibited visual patterns

- decorative gradients, radial halos, glow, or deep shadows behind an operational workspace,
- glass panels or blur as the primary hierarchy mechanism,
- continuous live pulses or animated status loops,
- rounded card stacks used in place of rows or contiguous panes,
- roadmap copy inside operational tab chrome,
- giant welcome cards after onboarding,
- decorative charts with no operational decision value,
- random status colors,
- excessive rounded pills,
- icon-only project or run states,
- hidden destructive actions revealed only on hover,
- low-contrast gray-on-gray text,
- fake terminal output or fake activity,
- animation that implies work not proven by events,
- replacing information hierarchy with large empty spacing.

## Visual acceptance checklist

A screen is visually acceptable only when:

1. the primary user question is answered in the first viewport,
2. project/run/state/evidence hierarchy is clear without reading every label,
3. active, blocked, failed, result-available, and verified states are distinguishable by text and shape as well as color,
4. dense data remains scannable at 1280px,
5. the screen works in light and dark themes,
6. keyboard focus order is logical and visible,
7. empty, loading, partial, disconnected, and error states are intentionally designed,
8. no decorative element competes with operational content,
9. the design uses the defined tokens rather than one-off values,
10. screenshots show a coherent product rather than unrelated cards stacked vertically,
11. pane chrome, density, typography, and a selected edge preserve hierarchy even when gradients and shadows are removed,
12. DevSpace remains visually identifiable when operational data is removed, without borrowing another product's logo or layout literally.
