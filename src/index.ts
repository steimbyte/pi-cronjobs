/**
 * pi-cronjobs — Schedule cronjobs that inject prompts into the ACTIVE session.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { CronjobStateManager } from "./state-manager";
import { createCrontabTool } from "./tool";
import { updateWidget, STATUS_ICONS } from "./ui/cron-widget";

export default function (pi: ExtensionAPI) {
  const state = new CronjobStateManager();

  // Cron engine interval (check every 30 seconds)
  let cronInterval: NodeJS.Timeout | null = null;

  /** Start the cron engine */
  function startCronEngine() {
    if (cronInterval) return;

    cronInterval = setInterval(() => {
      const due = state.getDue();

      for (const cj of due) {
        console.log(`[pi-cronjobs] Triggering: ${cj.name} (${cj.id})`);

        // Record the trigger
        state.recordTrigger(cj.id);

        // Inject the prompt into the ACTIVE chat
        pi.sendUserMessage(cj.prompt, { 
          deliverAs: "steer",
          triggerTurn: true 
        });

        // Update widget
        if (currentCtx) {
          updateWidget(state, currentCtx);
        }
      }
    }, 30000); // Check every 30 seconds
  }

  /** Stop the cron engine */
  function stopCronEngine() {
    if (cronInterval) {
      clearInterval(cronInterval);
      cronInterval = null;
    }
  }

  /** Callback after cronjob updates */
  let currentCtx: ExtensionContext | undefined;

  const onCronjobUpdate = () => {
    if (currentCtx) {
      updateWidget(state, currentCtx);
    }
  };

  // --- Reconstruct state from session on load/switch/fork/tree ---

  const reconstructState = (ctx: ExtensionContext) => {
    currentCtx = ctx;
    state.loadFromSession(ctx);
    updateWidget(state, ctx);

    // Start cron engine
    startCronEngine();
  };

  // Session events
  pi.on("session_start", async (_event, ctx) => {
    reconstructState(ctx);
  });

  pi.on("turn_start", async (_event, ctx) => {
    currentCtx = ctx;
  });

  pi.on("turn_end", async (_event, ctx) => {
    currentCtx = ctx;
    updateWidget(state, ctx);
  });

  pi.on("session_shutdown", async () => {
    stopCronEngine();
  });

  // --- Register the crontab tool (CLI-style) ---

  const tool = createCrontabTool(state, onCronjobUpdate);
  pi.registerTool(tool);

  // --- Register /cronjobs command ---

  pi.registerCommand("cronjobs", {
    description: "Manage cronjobs: /cronjobs list|clear",
    handler: async (args, ctx) => {
      currentCtx = ctx;
      const arg = args?.trim().toLowerCase() || "list";

      if (arg === "clear") {
        state.clear();
        updateWidget(state, ctx);
        ctx.ui.notify("All cronjobs cleared.", "info");
        return;
      }

      // list (default)
      const cronjobs = state.read();
      const stats = state.getStats();
      
      if (cronjobs.length === 0) {
        ctx.ui.notify("No cronjobs scheduled.", "info");
      } else {
        ctx.ui.notify(`${stats.active}/${stats.total} active`, "info");
      }
    },
  });
}
