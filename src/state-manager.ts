/**
 * CronjobStateManager — manages in-memory cronjob state and validation.
 * Persists to local JSON file for self-contained storage.
 */

import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { Cronjob, CronjobDetails, ValidationResult, CronjobStats } from "./types";
import { parseExpression, isValidExpression } from "./cron-parser";
import * as fs from "fs";
import * as path from "path";

const STATE_FILE = path.join(__dirname, "..", "cronjobs.json");

export class CronjobStateManager {
  private cronjobs: Map<string, Cronjob> = new Map();
  private nextId: number = 1;
  private widgetEnabled: boolean = true; // Toggle: show widget or not

  constructor() {
    this.loadFromFile();
  }

  /** Load cronjobs from local JSON file */
  private loadFromFile(): void {
    try {
      if (fs.existsSync(STATE_FILE)) {
        const data = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
        this.cronjobs.clear();
        for (const cj of data.cronjobs || []) {
          this.cronjobs.set(cj.id, cj);
        }
        this.nextId = data.nextId || 1;
        this.widgetEnabled = data.widgetEnabled !== false; // Default true
        console.log(`[pi-cronjobs] Loaded ${this.cronjobs.size} cronjobs from ${STATE_FILE}`);
      }
    } catch (e) {
      console.error("[pi-cronjobs] Failed to load cronjobs:", e);
    }
  }

  /** Save cronjobs to local JSON file */
  private saveToFile(): void {
    try {
      const dir = path.dirname(STATE_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = {
        cronjobs: Array.from(this.cronjobs.values()),
        nextId: this.nextId,
        widgetEnabled: this.widgetEnabled,
      };
      fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2), "utf-8");
      console.log(`[pi-cronjobs] Saved ${this.cronjobs.size} cronjobs to ${STATE_FILE}`);
    } catch (e) {
      console.error("[pi-cronjobs] Failed to save cronjobs:", e);
    }
  }

  /** Return all cronjobs as array */
  read(): Cronjob[] {
    return Array.from(this.cronjobs.values());
  }

  /** Get a single cronjob by ID */
  get(id: string): Cronjob | undefined {
    return this.cronjobs.get(id);
  }

  /** Create a new cronjob */
  create(data: Omit<Cronjob, "id" | "createdAt" | "triggerCount" | "lastTriggered" | "nextTrigger">): Cronjob {
    const id = `cron_${this.nextId++}`;
    const now = Date.now();
    const nextTrigger = this.calculateNextTrigger(data.cronExpression, now);

    const cronjob: Cronjob = {
      ...data,
      id,
      createdAt: now,
      triggerCount: 0,
      lastTriggered: null,
      nextTrigger: data.status === "active" ? nextTrigger : null,
    };

    this.cronjobs.set(id, cronjob);
    this.saveToFile(); // Persist to local file
    return cronjob;
  }

  /** Update an existing cronjob */
  update(id: string, updates: Partial<Omit<Cronjob, "id" | "createdAt">>): boolean {
    const cronjob = this.cronjobs.get(id);
    if (!cronjob) return false;

    const updated = { ...cronjob, ...updates };

    if (updates.cronExpression) {
      updated.nextTrigger = updated.status === "active"
        ? this.calculateNextTrigger(updates.cronExpression, Date.now())
        : null;
    }

    this.cronjobs.set(id, updated);
    this.saveToFile(); // Persist to local file
    return true;
  }

  /** Delete a cronjob */
  delete(id: string): boolean {
    const result = this.cronjobs.delete(id);
    if (result) this.saveToFile(); // Persist to local file
    return result;
  }

  /** Pause a cronjob */
  pause(id: string): boolean {
    const cronjob = this.cronjobs.get(id);
    if (!cronjob || cronjob.status === "completed") return false;

    cronjob.status = "paused";
    cronjob.nextTrigger = null;
    this.saveToFile(); // Persist to local file
    return true;
  }

  /** Resume a cronjob */
  resume(id: string): boolean {
    const cronjob = this.cronjobs.get(id);
    if (!cronjob || cronjob.status === "completed") return false;

    cronjob.status = "active";
    cronjob.nextTrigger = this.calculateNextTrigger(cronjob.cronExpression, Date.now());
    this.saveToFile(); // Persist to local file
    return true;
  }

  /** Record a trigger */
  recordTrigger(id: string): boolean {
    const cronjob = this.cronjobs.get(id);
    if (!cronjob || cronjob.status !== "active") return false;

    const now = Date.now();
    cronjob.triggerCount++;
    cronjob.lastTriggered = now;

    if (cronjob.maxTriggers > 0 && cronjob.triggerCount >= cronjob.maxTriggers) {
      cronjob.status = "completed";
      cronjob.nextTrigger = null;
    } else {
      cronjob.nextTrigger = this.calculateNextTrigger(cronjob.cronExpression, now);
    }

    this.saveToFile(); // Persist to local file
    return true;
  }

  /** Get cronjobs that are due */
  getDue(): Cronjob[] {
    const now = Date.now();
    return this.read().filter(cj =>
      cj.status === "active" &&
      cj.nextTrigger !== null &&
      cj.nextTrigger <= now
    );
  }

  /** Clear all cronjobs */
  clear(): void {
    this.cronjobs.clear();
    this.saveToFile(); // Persist to local file
  }

  /** Toggle widget visibility */
  setWidgetEnabled(enabled: boolean): void {
    this.widgetEnabled = enabled;
    this.saveToFile();
  }

  /** Check if widget is enabled */
  isWidgetEnabled(): boolean {
    return this.widgetEnabled;
  }

  /** Get next ID without incrementing */
  getNextId(): number {
    return this.nextId;
  }

  /** Get stats */
  getStats(): CronjobStats {
    const cronjobs = this.read();
    return {
      total: cronjobs.length,
      active: cronjobs.filter(c => c.status === "active").length,
      paused: cronjobs.filter(c => c.status === "paused").length,
      completed: cronjobs.filter(c => c.status === "completed").length,
    };
  }

  /** Validate cronjob data */
  validate(data: Partial<Cronjob>, isNew: boolean = true): ValidationResult {
    const errors: string[] = [];

    if (isNew) {
      if (!data.name || typeof data.name !== "string") {
        errors.push("name is required");
      }
      if (!data.cronExpression || typeof data.cronExpression !== "string") {
        errors.push("cronExpression is required");
      } else if (!isValidExpression(data.cronExpression)) {
        errors.push(`Invalid cron expression: ${data.cronExpression}`);
      }
      if (!data.prompt || typeof data.prompt !== "string") {
        errors.push("prompt is required");
      }
    }

    if (data.cronExpression && !isValidExpression(data.cronExpression)) {
      errors.push(`Invalid cron expression: ${data.cronExpression}`);
    }

    if (data.maxTriggers !== undefined && data.maxTriggers < -1) {
      errors.push("maxTriggers must be -1 (unlimited) or >= 0");
    }

    return { valid: errors.length === 0, errors };
  }

  /** Calculate next trigger time */
  private calculateNextTrigger(cronExpression: string, fromTime: number): number | null {
    try {
      return parseExpression(cronExpression, fromTime);
    } catch {
      return null;
    }
  }

  /** Load from session entries (fallback, prefer loadFromFile) */
  loadFromSession(ctx: ExtensionContext): void {
    // Prefer local file storage, but allow session to provide cronjobs if file is empty
    if (this.cronjobs.size > 0) return; // Already loaded from file

    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type !== "message") continue;
      const msg = entry.message;
      if (msg.role !== "toolResult" || msg.toolName !== "manage_cronjobs") continue;

      const details = msg.details as CronjobDetails | undefined;
      if (details?.cronjobs) {
        for (const cj of details.cronjobs) {
          this.cronjobs.set(cj.id, cj);
          const numId = parseInt(cj.id.replace("cron_", ""));
          if (numId >= this.nextId) this.nextId = numId + 1;
        }
      }
    }
  }
}
