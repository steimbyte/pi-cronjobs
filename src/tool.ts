/**
 * manage_cronjobs tool — create, list, update, delete cronjobs.
 */

import { StringEnum } from "@mariozechner/pi-ai";
import type {
  Theme,
  ExtensionContext,
  AgentToolResult,
  ToolRenderResultOptions,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type, type Static } from "@sinclair/typebox";
import type { Cronjob, CronjobDetails } from "./types";
import type { CronjobStateManager } from "./state-manager";
import { STATUS_ICONS, describeCron } from "./ui/cron-widget";

// --- Schema ---

export const CronjobInputSchema = Type.Object({
  operation: StringEnum(["create", "list", "update", "delete", "pause", "resume"] as const, {
    description: "create: Create new cronjob. list: List all cronjobs. update: Update cronjob. delete: Remove cronjob. pause: Pause active job. resume: Resume paused job.",
  }),
  id: Type.Optional(Type.String({ description: "Cronjob ID (required for update/delete/pause/resume)" })),
  name: Type.Optional(Type.String({ description: "Name for the cronjob (required for create)" })),
  cronExpression: Type.Optional(Type.String({ description: "Cron expression: min hour day month weekday. Examples: '*/5 * * * *' = every 5 min, '0 * * * *' = hourly, '0 9 * * 1-5' = 9am weekdays" })),
  prompt: Type.Optional(Type.String({ description: "Prompt to inject when cronjob triggers (required for create)" })),
  status: Type.Optional(StringEnum(["active", "paused", "completed"] as const, { description: "Job status" })),
  maxTriggers: Type.Optional(Type.Number({ description: "Max times to trigger (-1 = infinite). Default: -1" })),
});

export type ManageCronjobsInput = Static<typeof CronjobInputSchema>;

// --- Tool Description ---

export const TOOL_DESCRIPTION = `Manage scheduled cronjobs that inject prompts into the session.

When to use this tool:
- Automate recurring tasks or reminders
- Schedule periodic checks or updates
- Create timed notifications or actions
- Set up monitoring workflows

CRON SYNTAX (5 fields):
  ┌───────────── minute (0-59)
  │ ┌───────────── hour (0-23)
  │ │ ┌───────────── day of month (1-31)
  │ │ │ ┌───────────── month (1-12)
  │ │ │ │ ┌───────────── day of week (0-6, Sun=0)
  │ │ │ │ │
  * * * * *

COMMON PATTERNS:
  */5 * * * *    Every 5 minutes
  */15 * * * *   Every 15 minutes
  0 * * * *      Every hour (at :00)
  0 */2 * * *    Every 2 hours
  0 9 * * *      Daily at 9:00 AM
  0 9 * * 1-5    Weekdays at 9:00 AM
  0 18 * * *     Daily at 6:00 PM
  0 0 * * 0      Every Sunday at midnight

FIELD MODIFIERS:
  *       Any value
  */n     Every n units (e.g., */10 = every 10)
  n-m     Range (e.g., 1-5 = Mon-Fri)
  n,m     List (e.g., 1,15 = 1st and 15th)
  n-m/s   Range with step

EXAMPLES:
- Create: Every 5 min reminder
- List: See all scheduled jobs
- Update: Change schedule or prompt
- Delete: Remove a scheduled job

IMPORTANT: When triggered, the cronjob's prompt is injected as a user message, causing the agent to respond.`;

// --- Tool Factory ---

export function createManageCronjobsTool(state: CronjobStateManager, onUpdate: () => void) {
  return {
    name: "manage_cronjobs",
    label: "Cronjobs",
    description: TOOL_DESCRIPTION,
    parameters: CronjobInputSchema,

    async execute(
      toolCallId: string,
      params: ManageCronjobsInput,
      _signal: AbortSignal | undefined,
      _onStreamUpdate: any,
      _ctx: ExtensionContext
    ) {
      switch (params.operation) {
        case "list":
          return handleList(state);

        case "create":
          return handleCreate(state, params, onUpdate);

        case "update":
          return handleUpdate(state, params, onUpdate);

        case "delete":
          return handleDelete(state, params, onUpdate);

        case "pause":
          return handlePause(state, params, onUpdate);

        case "resume":
          return handleResume(state, params, onUpdate);

        default:
          return {
            content: [{ type: "text" as const, text: "Unknown operation" }],
            details: { operation: params.operation, cronjobs: state.read(), error: "Unknown operation" } as CronjobDetails,
            isError: true,
          };
      }
    },

    renderCall(args: ManageCronjobsInput, theme: Theme) {
      let text = theme.fg("toolTitle", theme.bold("manage_cronjobs "));
      text += theme.fg("muted", args.operation);

      if (args.operation === "create" && args.name) {
        text += theme.fg("dim", ` (${args.name})`);
      }
      if (args.id) {
        text += theme.fg("dim", ` [${args.id}]`);
      }

      return new Text(text, 0, 0);
    },

    renderResult(
      result: AgentToolResult<CronjobDetails | undefined>,
      { expanded }: ToolRenderResultOptions,
      theme: Theme
    ) {
      const details = result.details;
      if (!details) {
        const first = result.content[0];
        return new Text(first && "text" in first ? first.text : "", 0, 0);
      }

      if (details.error) {
        return new Text(theme.fg("error", `✗ ${details.error}`), 0, 0);
      }

      const cronjobs = details.cronjobs;
      const stats = state.getStats();

      if (details.operation === "list") {
        let text = theme.fg("success", "✓ ") + theme.fg("muted", `${stats.active} active, ${stats.paused} paused`);

        if (expanded && cronjobs.length > 0) {
          for (const cj of cronjobs) {
            const icon = STATUS_ICONS[cj.status] ?? "?";
            const iconColor = cj.status === "active"
              ? theme.fg("success", icon)
              : cj.status === "paused"
                ? theme.fg("warning", icon)
                : theme.fg("dim", icon);

            const name = theme.fg("accent", cj.name);
            const schedule = theme.fg("muted", describeCron(cj.cronExpression));
            const next = cj.nextTrigger
              ? theme.fg("dim", `next: ${new Date(cj.nextTrigger).toLocaleTimeString()}`)
              : "";

            text += `\n  ${iconColor} ${name} ${schedule} ${next}`;
          }
        }

        return new Text(text, 0, 0);
      }

      // Create/update/delete/pause/resume
      return new Text(
        theme.fg("success", `✓ ${details.operation} completed`) +
        theme.fg("dim", ` (${stats.total} total)`),
        0, 0
      );
    },
  };
}

function handleList(state: CronjobStateManager) {
  const cronjobs = state.read();
  return {
    content: [{ type: "text" as const, text: formatCronjobs(cronjobs) }],
    details: { operation: "list", cronjobs } as CronjobDetails,
  };
}

function handleCreate(state: CronjobStateManager, params: ManageCronjobsInput, onUpdate: () => void) {
  const validation = state.validate({
    name: params.name,
    cronExpression: params.cronExpression,
    prompt: params.prompt,
    maxTriggers: params.maxTriggers ?? -1,
  }, true);

  if (!validation.valid) {
    return {
      content: [{ type: "text" as const, text: `Validation failed:\n${validation.errors.join("\n")}` }],
      details: { operation: "create", cronjobs: state.read(), error: validation.errors.join("; ") } as CronjobDetails,
      isError: true,
    };
  }

  const cronjob = state.create({
    name: params.name!,
    cronExpression: params.cronExpression!,
    prompt: params.prompt!,
    status: params.status ?? "active",
    maxTriggers: params.maxTriggers ?? -1,
  });

  onUpdate();

  return {
    content: [{
      type: "text" as const,
      text: `Cronjob created: ${cronjob.name} (${cronjob.id})\nSchedule: ${describeCron(cronjob.cronExpression)}`,
    }],
    details: { operation: "create", cronjobs: state.read() } as CronjobDetails,
  };
}

function handleUpdate(state: CronjobStateManager, params: ManageCronjobsInput, onUpdate: () => void) {
  if (!params.id) {
    return {
      content: [{ type: "text" as const, text: "ID required for update" }],
      details: { operation: "update", cronjobs: state.read(), error: "ID required" } as CronjobDetails,
      isError: true,
    };
  }

  const updates: Partial<Cronjob> = {};
  if (params.name) updates.name = params.name;
  if (params.cronExpression) updates.cronExpression = params.cronExpression;
  if (params.prompt) updates.prompt = params.prompt;
  if (params.status) updates.status = params.status;
  if (params.maxTriggers !== undefined) updates.maxTriggers = params.maxTriggers;

  const validation = state.validate({ cronExpression: params.cronExpression, maxTriggers: params.maxTriggers }, false);
  if (!validation.valid) {
    return {
      content: [{ type: "text" as const, text: `Validation failed:\n${validation.errors.join("\n")}` }],
      details: { operation: "update", cronjobs: state.read(), error: validation.errors.join("; ") } as CronjobDetails,
      isError: true,
    };
  }

  const success = state.update(params.id, updates);
  if (!success) {
    return {
      content: [{ type: "text" as const, text: `Cronjob not found: ${params.id}` }],
      details: { operation: "update", cronjobs: state.read(), error: "Not found" } as CronjobDetails,
      isError: true,
    };
  }

  onUpdate();

  return {
    content: [{ type: "text" as const, text: `Cronjob updated: ${params.id}` }],
    details: { operation: "update", cronjobs: state.read() } as CronjobDetails,
  };
}

function handleDelete(state: CronjobStateManager, params: ManageCronjobsInput, onUpdate: () => void) {
  if (!params.id) {
    return {
      content: [{ type: "text" as const, text: "ID required for delete" }],
      details: { operation: "delete", cronjobs: state.read(), error: "ID required" } as CronjobDetails,
      isError: true,
    };
  }

  const success = state.delete(params.id);
  if (!success) {
    return {
      content: [{ type: "text" as const, text: `Cronjob not found: ${params.id}` }],
      details: { operation: "delete", cronjobs: state.read(), error: "Not found" } as CronjobDetails,
      isError: true,
    };
  }

  onUpdate();

  return {
    content: [{ type: "text" as const, text: `Cronjob deleted: ${params.id}` }],
    details: { operation: "delete", cronjobs: state.read() } as CronjobDetails,
  };
}

function handlePause(state: CronjobStateManager, params: ManageCronjobsInput, onUpdate: () => void) {
  if (!params.id) {
    return {
      content: [{ type: "text" as const, text: "ID required for pause" }],
      details: { operation: "pause", cronjobs: state.read(), error: "ID required" } as CronjobDetails,
      isError: true,
    };
  }

  const success = state.pause(params.id);
  if (!success) {
    return {
      content: [{ type: "text" as const, text: `Cannot pause: ${params.id}` }],
      details: { operation: "pause", cronjobs: state.read(), error: "Cannot pause" } as CronjobDetails,
      isError: true,
    };
  }

  onUpdate();

  return {
    content: [{ type: "text" as const, text: `Cronjob paused: ${params.id}` }],
    details: { operation: "pause", cronjobs: state.read() } as CronjobDetails,
  };
}

function handleResume(state: CronjobStateManager, params: ManageCronjobsInput, onUpdate: () => void) {
  if (!params.id) {
    return {
      content: [{ type: "text" as const, text: "ID required for resume" }],
      details: { operation: "resume", cronjobs: state.read(), error: "ID required" } as CronjobDetails,
      isError: true,
    };
  }

  const success = state.resume(params.id);
  if (!success) {
    return {
      content: [{ type: "text" as const, text: `Cannot resume: ${params.id}` }],
      details: { operation: "resume", cronjobs: state.read(), error: "Cannot resume" } as CronjobDetails,
      isError: true,
    };
  }

  onUpdate();

  return {
    content: [{ type: "text" as const, text: `Cronjob resumed: ${params.id}` }],
    details: { operation: "resume", cronjobs: state.read() } as CronjobDetails,
  };
}

function formatCronjobs(cronjobs: Cronjob[]): string {
  if (cronjobs.length === 0) {
    return "No cronjobs scheduled.";
  }

  const lines = [`${cronjobs.length} cronjob(s):`];
  for (const cj of cronjobs) {
    const next = cj.nextTrigger ? new Date(cj.nextTrigger).toLocaleString() : "N/A";
    lines.push(`- ${cj.name} (${cj.id})`);
    lines.push(`  Schedule: ${describeCron(cj.cronExpression)}`);
    lines.push(`  Status: ${cj.status} | Next: ${next}`);
    lines.push(`  Prompt: ${cj.prompt.slice(0, 50)}${cj.prompt.length > 50 ? "..." : ""}`);
  }

  return lines.join("\n");
}
