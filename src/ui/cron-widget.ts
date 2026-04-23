/**
 * CronWidget — shows scheduled cronjobs above the editor.
 */

import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { CronjobStateManager } from "../state-manager";
import { describeCron } from "../cron-parser";

const WIDGET_ID = "cronjobs";

export const STATUS_ICONS: Record<string, string> = {
  "active": "⏰",
  "paused": "⏸",
  "completed": "✓",
};

function formatTime(ts: number | null): string {
  if (!ts) return "N/A";
  const d = new Date(ts);
  const now = new Date();
  const diff = ts - now.getTime();

  if (diff < 60000) return "in <1m";
  if (diff < 3600000) return `in ${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `in ${Math.floor(diff / 3600000)}h`;
  return d.toLocaleDateString();
}

/**
 * Update the cronjobs widget.
 */
export function updateWidget(state: CronjobStateManager, ctx: ExtensionContext): void {
  const cronjobs = state.read();
  const stats = state.getStats();

  // Widget is disabled via toggle
  if (!state.isWidgetEnabled()) {
    ctx.ui.setWidget(WIDGET_ID, undefined);
    return;
  }

  // Only show widget if there are active cronjobs
  if (cronjobs.length === 0 || stats.active === 0) {
    ctx.ui.setWidget(WIDGET_ID, undefined);
    return;
  }

  ctx.ui.setWidget(WIDGET_ID, (_tui, theme) => {
    const lines: string[] = [];
    const stats = state.getStats();

    // Header
    const header = theme.fg("accent", " Cronjobs ") +
      theme.fg("muted", `— ${stats.active} active`);
    lines.push(header);

    // Each cronjob
    for (const cj of cronjobs.slice(0, 5)) {
      const icon = STATUS_ICONS[cj.status] ?? "?";
      const iconColor = cj.status === "active"
        ? theme.fg("success", icon)
        : cj.status === "paused"
          ? theme.fg("warning", icon)
          : theme.fg("dim", icon);

      const name = theme.fg("muted", cj.name.slice(0, 20));
      const schedule = theme.fg("dim", describeCron(cj.cronExpression));

      let info: string;
      if (cj.status === "active" && cj.nextTrigger) {
        info = theme.fg("accent", formatTime(cj.nextTrigger));
      } else if (cj.status === "completed") {
        info = theme.fg("dim", `triggered ${cj.triggerCount}x`);
      } else {
        info = theme.fg("warning", cj.status);
      }

      lines.push(`  ${iconColor} ${name} ${schedule} ${info}`);
    }

    if (cronjobs.length > 5) {
      lines.push(theme.fg("dim", `  ... and ${cronjobs.length - 5} more`));
    }

    return { render: () => lines, invalidate: () => {} };
  });
}

/** Clear the widget */
export function clearWidget(ctx: ExtensionContext): void {
  ctx.ui.setWidget(WIDGET_ID, undefined);
}

export { describeCron };
