/**
 * crontab - CLI-style cronjob management for pi.
 * 
 * Usage:
 *   crontab --add --name "Reminder" --every "5m" -- "Your prompt here"
 *   crontab --list
 *   crontab --delete <id>
 *   crontab --pause <id>
 *   crontab --resume <id>
 *   crontab --clear
 * 
 * Interval shortcuts:
 *   5m  = every 5 minutes
 *   15m = every 15 minutes  
 *   1h  = every hour
 *   2h  = every 2 hours
 *   1d  = daily at 9:00 AM
 *   1w  = weekly on Monday at 9:00 AM
 */

import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import type { Cronjob, CronjobDetails } from "./types";
import type { CronjobStateManager } from "./state-manager";

// --- CLI Parser ---

export interface CronToolInput {
  // Action flags (one required)
  add?: boolean;
  list?: boolean;
  delete?: boolean;
  pause?: boolean;
  resume?: boolean;
  clear?: boolean;
  
  // Options for --add
  name?: string;
  every?: string;      // 5m, 15m, 1h, 2h, 1d, 1w or cron expression
  "max-triggers"?: number;
  
  // Target for delete/pause/resume
  id?: string;
  
  // Trailing argument (the prompt)
  prompt?: string;
}

function parseEvery(every: string): string {
  // Shortcut intervals
  const shortcuts: Record<string, string> = {
    "5m":  "*/5 * * * *",
    "10m": "*/10 * * * *",
    "15m": "*/15 * * * *",
    "30m": "*/30 * * * *",
    "1h":  "0 * * * *",
    "2h":  "0 */2 * * *",
    "3h":  "0 */3 * * *",
    "6h":  "0 */6 * * *",
    "12h": "0 */12 * * *",
    "1d":  "0 9 * * *",
    "2d":  "0 9 */2 * *",
    "1w":  "0 9 * * 1",
    "1mo": "0 9 1 * *",
  };
  
  const normalized = every.toLowerCase().trim();
  return shortcuts[normalized] || every;
}

function formatEvery(cron: string): string {
  const shortcuts: Record<string, string> = {
    "*/5 * * * *":  "5m",
    "*/10 * * * *": "10m",
    "*/15 * * * *": "15m",
    "*/30 * * * *": "30m",
    "0 * * * *":    "1h",
    "0 */2 * * *":  "2h",
    "0 */3 * * *":  "3h",
    "0 */6 * * *":  "6h",
    "0 */12 * * *": "12h",
    "0 9 * * *":    "1d",
    "0 9 */2 * *":  "2d",
    "0 9 * * 1":    "1w",
    "0 9 1 * *":    "1mo",
  };
  
  return shortcuts[cron] || cron;
}

export function createCrontabTool(state: CronjobStateManager, onUpdate: () => void) {
  return {
    name: "crontab",
    label: "Crontab",
    description: `CLI-style cronjob management.

Usage:
  crontab --add --name "Reminder" --every "5m" -- "Your prompt here"
  crontab --list
  crontab --delete <id>
  crontab --pause <id>
  crontab --resume <id>
  crontab --clear

Interval shortcuts:
  5m  = every 5 minutes
  10m = every 10 minutes
  15m = every 15 minutes
  30m = every 30 minutes
  1h  = every hour (at :00)
  2h  = every 2 hours
  1d  = daily at 9:00 AM
  1w  = weekly on Monday at 9:00 AM

Examples:
  crontab --add --every "5m" -- "Check system status"
  crontab --add --name "Daily" --every "1d" -- "Standup reminder"
  crontab --add --every "*/15 * * * *" -- "Custom cron expression"
`,

    async execute(
      toolCallId: string,
      params: CronToolInput,
      _signal: AbortSignal | undefined,
      _onStreamUpdate: any,
      ctx: ExtensionContext
    ) {
      // --list
      if (params.list || (!params.add && !params.delete && !params.pause && !params.resume && !params.clear)) {
        return handleList(state);
      }
      
      // --clear
      if (params.clear) {
        return handleClear(state, onUpdate);
      }
      
      // --add
      if (params.add) {
        return handleAdd(state, params, onUpdate);
      }
      
      // --delete
      if (params.delete) {
        return handleDelete(state, params.id!, onUpdate);
      }
      
      // --pause
      if (params.pause) {
        return handlePause(state, params.id!, onUpdate);
      }
      
      // --resume
      if (params.resume) {
        return handleResume(state, params.id!, onUpdate);
      }
      
      return {
        content: [{ type: "text" as const, text: "Unknown operation" }],
        isError: true,
      };
    },

    renderCall(args: CronToolInput, theme: any) {
      let text = theme.fg("toolTitle", theme.bold("crontab "));
      
      if (args.add) text += theme.fg("accent", "+ ");
      else if (args.delete) text += theme.fg("error", "x ");
      else if (args.list) text += theme.fg("muted", "ls");
      else if (args.clear) text += theme.fg("error", "rm *");
      else text += theme.fg("muted", "ls");
      
      if (args.name) text += theme.fg("dim", ` "${args.name}"`);
      if (args.every) text += theme.fg("dim", ` @${args.every}`);
      if (args.id) text += theme.fg("dim", ` #${args.id}`);
      
      return new Text(text, 0, 0);
    },

    renderResult(result: any, options: any, theme: any) {
      if (result.isError) {
        return new Text(theme.fg("error", result.content?.[0]?.text || "Error"), 0, 0);
      }
      return new Text(result.content?.[0]?.text || "OK", 0, 0);
    },
  };
}

// --- Handlers ---

function handleList(state: CronjobStateManager) {
  const cronjobs = state.read();
  const stats = state.getStats();
  
  if (cronjobs.length === 0) {
    return {
      content: [{ type: "text" as const, text: "No cronjobs scheduled. Use --add to create one." }],
      details: { operation: "list", cronjobs } as CronjobDetails,
    };
  }
  
  let text = `${stats.active} active, ${stats.paused} paused, ${stats.completed} completed\n`;
  text += "─".repeat(50) + "\n";
  
  for (const cj of cronjobs) {
    const statusIcon = cj.status === "active" ? "●" : cj.status === "paused" ? "○" : "✓";
    const statusColor = cj.status === "active" ? "\x1b[32m" : cj.status === "paused" ? "\x1b[33m" : "\x1b[90m";
    const interval = formatEvery(cj.cronExpression);
    const next = cj.nextTrigger ? new Date(cj.nextTrigger).toLocaleTimeString() : "-";
    
    text += `${statusIcon} [${cj.id}] ${cj.name}\n`;
    text += `    ${interval} → next: ${next}\n`;
    text += `    "${cj.prompt.slice(0, 60)}${cj.prompt.length > 60 ? "..." : ""}"\n`;
    text += "\n";
  }
  
  return {
    content: [{ type: "text" as const, text: text.trim() }],
    details: { operation: "list", cronjobs } as CronjobDetails,
  };
}

function handleAdd(state: CronjobStateManager, params: CronToolInput, onUpdate: () => void) {
  if (!params.prompt) {
    return {
      content: [{ type: "text" as const, text: "Error: --add requires a prompt argument" }],
      isError: true,
    };
  }
  
  const name = params.name || `Job #${state.getNextId()}`;
  const cronExpr = params.every ? parseEvery(params.every) : "*/5 * * * *";
  
  // Validate cron expression
  const validation = state.validate({ 
    name, 
    cronExpression: cronExpr, 
    prompt: params.prompt,
    maxTriggers: params["max-triggers"] ?? -1,
  }, true);
  
  if (!validation.valid) {
    return {
      content: [{ type: "text" as const, text: `Validation failed:\n${validation.errors.join("\n")}` }],
      isError: true,
    };
  }
  
  const cronjob = state.create({
    name,
    cronExpression: cronExpr,
    prompt: params.prompt,
    status: "active",
    maxTriggers: params["max-triggers"] ?? -1,
  });
  
  onUpdate();
  
  const interval = formatEvery(cronExpr);
  return {
    content: [{
      type: "text" as const,
      text: `Created ${cronjob.id} "${cronjob.name}" @${interval}\nNext trigger: ${cronjob.nextTrigger ? new Date(cronjob.nextTrigger).toLocaleTimeString() : "N/A"}`,
    }],
    details: { operation: "create", cronjobs: state.read() } as CronjobDetails,
  };
}

function handleDelete(state: CronjobStateManager, id: string, onUpdate: () => void) {
  if (!id) {
    return { content: [{ type: "text" as const, text: "Error: --delete requires an ID" }], isError: true };
  }
  
  const success = state.delete(id);
  if (!success) {
    return { content: [{ type: "text" as const, text: `Cronjob not found: ${id}` }], isError: true };
  }
  
  onUpdate();
  return { content: [{ type: "text" as const, text: `Deleted ${id}` }] };
}

function handlePause(state: CronjobStateManager, id: string, onUpdate: () => void) {
  if (!id) {
    return { content: [{ type: "text" as const, text: "Error: --pause requires an ID" }], isError: true };
  }
  
  const success = state.pause(id);
  if (!success) {
    return { content: [{ type: "text" as const, text: `Cannot pause ${id}` }], isError: true };
  }
  
  onUpdate();
  return { content: [{ type: "text" as const, text: `Paused ${id}` }] };
}

function handleResume(state: CronjobStateManager, id: string, onUpdate: () => void) {
  if (!id) {
    return { content: [{ type: "text" as const, text: "Error: --resume requires an ID" }], isError: true };
  }
  
  const success = state.resume(id);
  if (!success) {
    return { content: [{ type: "text" as const, text: `Cannot resume ${id}` }], isError: true };
  }
  
  onUpdate();
  return { content: [{ type: "text" as const, text: `Resumed ${id}` }] };
}

function handleClear(state: CronjobStateManager, onUpdate: () => void) {
  state.clear();
  onUpdate();
  return { content: [{ type: "text" as const, text: "All cronjobs cleared" }] };
}
