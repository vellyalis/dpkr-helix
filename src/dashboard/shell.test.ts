import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DASHBOARD_DESTINATIONS,
  dashboardDestinationFromHash,
  dashboardDestinationHref,
  dashboardThemeLabel,
  nextDashboardTheme,
} from "./shell.js";

assert.deepEqual(
  DASHBOARD_DESTINATIONS.map(({ id, label }) => [id, label]),
  [
    ["projects", "Projects"],
    ["runs", "Runs"],
    ["agents", "Agents"],
    ["system", "System"],
  ],
);

assert.equal(dashboardDestinationFromHash(""), "projects");
assert.equal(dashboardDestinationFromHash("#/projects/project_123"), "projects");
assert.equal(dashboardDestinationFromHash("#/RUNS/run_123"), "runs");
assert.equal(dashboardDestinationFromHash("#/agents"), "agents");
assert.equal(dashboardDestinationFromHash("#/system"), "system");
assert.equal(dashboardDestinationFromHash("#/unknown"), "projects");
assert.equal(dashboardDestinationHref("runs"), "#/runs");

assert.equal(nextDashboardTheme("system"), "light");
assert.equal(nextDashboardTheme("light"), "dark");
assert.equal(nextDashboardTheme("dark"), "system");
assert.equal(dashboardThemeLabel("system"), "Theme: system");
assert.equal(dashboardThemeLabel("dark"), "Theme: dark");

const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
const runsView = readFileSync(new URL("./runs-view.tsx", import.meta.url), "utf8");
const dashboardView = readFileSync(new URL("./main.tsx", import.meta.url), "utf8");
const dashboardHtml = readFileSync(new URL("../ui/dashboard.html", import.meta.url), "utf8");
const brandIcon = readFileSync(new URL("../ui/dpkr-helix-icon.png", import.meta.url));
const brandIconLight = readFileSync(new URL("../ui/dpkr-helix-icon-light.png", import.meta.url));
assert.match(dashboardView, /<strong>dpkr helix<\/strong>/);
assert.match(dashboardView, /dpkr-helix-icon\.png/);
assert.match(dashboardView, /dpkr-helix-icon-light\.png/);
assert.match(dashboardHtml, /<title>dpkr helix Control Center<\/title>/);
assert.match(dashboardHtml, /href="\.\/dpkr-helix-icon-light\.png" media="\(prefers-color-scheme: light\)"/);
assert.match(dashboardHtml, /href="\.\/dpkr-helix-icon\.png" media="\(prefers-color-scheme: dark\)"/);
assert.deepEqual([...brandIcon.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
assert.deepEqual([...brandIconLight.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
assert.match(styles, /\.product-mark[\s\S]*?object-fit: cover/);
assert.match(styles, /:root\[data-theme="dark"\] \.product-mark-dark[\s\S]*?display: block/);
for (const token of [
  "--ds-bg-canvas",
  "--ds-bg-surface",
  "--ds-text-primary",
  "--ds-accent",
  "--ds-signal",
  "--ds-success",
  "--ds-warning",
  "--ds-danger",
  "--ds-focus",
]) {
  assert.match(styles, new RegExp(`${token}:`));
}
assert.match(styles, /:root\[data-theme="dark"\]/);
assert.match(styles, /prefers-color-scheme: dark/);
assert.match(styles, /@media \(max-width: 759px\)/);
assert.match(styles, /prefers-reduced-motion: reduce/);
assert.match(styles, /\.runs-cockpit/);
assert.match(styles, /grid-template-columns: 248px minmax\(540px, 1fr\)/);
assert.match(styles, /\.terminal-live-label/);
assert.match(runsView, />Live output</);
assert.doesNotMatch(runsView, /Evidence checklist/);
assert.match(
  runsView,
  /if \(!selectedRun\) return;\s+setActiveTab\(defaultRunTab\(selectedRun\)\);\s+\}, \[selectedRun\?\.id\]\);/,
);
assert.match(styles, /--ds-radius-stage: 2px/);
assert.match(styles, /--ds-accent: #ff8a1f/);
assert.match(styles, /border-top: 2px solid var\(--ds-accent\)/);
assert.doesNotMatch(styles, /--ds-shadow-stage/);
assert.doesNotMatch(styles, /truthful-live-pulse/);
assert.doesNotMatch(styles, /radial-gradient/);
assert.doesNotMatch(styles, /linear-gradient/);
assert.doesNotMatch(styles, /animation:[^;]*infinite/);
assert.match(styles, /\.run-filter select[\s\S]*?min-height: 32px/);
assert.match(styles, /\.run-tabs button[\s\S]*?min-width: 32px;[\s\S]*?min-height: 32px/);
assert.match(styles, /\.terminal-toolbar input[\s\S]*?min-height: 32px/);
assert.match(styles, /\.agent-table \.mono-link \{[\s\S]*?min-height: 32px/);
assert.match(styles, /\.run-filter select,[\s\S]*?\.compact-control \{[\s\S]*?min-height: 40px/);
assert.match(
  styles,
  /@media \(max-width: 759px\) \{[\s\S]*?\.agent-table \.mono-link \{[\s\S]*?min-height: 40px/,
);

for (const [foreground, background, label] of [
  ["#626b76", "#f8f9fa", "light tertiary text on surface"],
  ["#626b76", "#eceff2", "light tertiary text on canvas"],
  ["#a94b00", "#f8f9fa", "light accent text on surface"],
  ["#ffffff", "#a94b00", "light primary button text"],
  ["#8a3d00", "#f8f9fa", "light focus indicator"],
  ["#78818b", "#0d1013", "dark tertiary text on surface"],
] as const) {
  assert.ok(
    contrastRatio(foreground, background) >= 4.5,
    `${label} must meet WCAG AA contrast`,
  );
}

console.log("dashboard shell tests passed");

function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(hex: string): number {
  const channels = hex.slice(1).match(/.{2}/g)!.map((value) => Number.parseInt(value, 16) / 255);
  const [red, green, blue] = channels.map((channel) => (
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  ));
  return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
}
