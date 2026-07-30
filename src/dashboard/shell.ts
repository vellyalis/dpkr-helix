export const DASHBOARD_DESTINATIONS = [
  { id: "projects", label: "Projects" },
  { id: "runs", label: "Runs" },
  { id: "agents", label: "Agents" },
  { id: "system", label: "System" },
] as const;

export type DashboardDestination = (typeof DASHBOARD_DESTINATIONS)[number]["id"];
export type DashboardTheme = "system" | "light" | "dark";

export function dashboardDestinationFromHash(hash: string): DashboardDestination {
  const segment = hash.replace(/^#\/?/, "").split("/")[0]?.toLowerCase();
  return DASHBOARD_DESTINATIONS.some((destination) => destination.id === segment)
    ? segment as DashboardDestination
    : "projects";
}

export function dashboardDestinationHref(destination: DashboardDestination): string {
  return `#/${destination}`;
}

export function nextDashboardTheme(theme: DashboardTheme): DashboardTheme {
  if (theme === "system") return "light";
  if (theme === "light") return "dark";
  return "system";
}

export function dashboardThemeLabel(theme: DashboardTheme): string {
  return theme === "system"
    ? "Theme: system"
    : `Theme: ${theme}`;
}
