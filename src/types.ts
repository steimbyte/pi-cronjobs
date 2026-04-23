/**
 * Core types for the pi-cronjobs extension.
 */

export type CronStatus = "active" | "paused" | "completed";

export interface Cronjob {
  id: string;
  name: string;
  cronExpression: string;
  prompt: string;
  status: CronStatus;
  maxTriggers: number;
  triggerCount: number;
  createdAt: number;
  lastTriggered: number | null;
  nextTrigger: number | null;
}

export interface CronjobDetails {
  operation: "list" | "create" | "update" | "delete" | "pause" | "resume";
  cronjobs: Cronjob[];
  error?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface CronjobStats {
  total: number;
  active: number;
  paused: number;
  completed: number;
}
