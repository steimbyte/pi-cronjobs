/**
 * Simple cron expression parser for basic patterns.
 * Supports: * * * * * (minute hour day month weekday)
 */

export function isValidExpression(expr: string): boolean {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  for (const part of parts) {
    if (!isValidField(part)) return false;
  }
  return true;
}

function isValidField(field: string): boolean {
  if (field === "*") return true;

  // */n pattern
  if (field.startsWith("*/")) {
    const n = parseInt(field.slice(2));
    return !isNaN(n) && n > 0;
  }

  // Range with step: n-m/s
  if (field.includes("/")) {
    const [range, step] = field.split("/");
    const stepNum = parseInt(step);
    if (isNaN(stepNum) || stepNum <= 0) return false;
    if (range === "*") return true;
    if (range.includes("-")) {
      const [start, end] = range.split("-").map(Number);
      return !isNaN(start) && !isNaN(end) && start <= end;
    }
    return false;
  }

  // Range: n-m
  if (field.includes("-")) {
    const [start, end] = field.split("-").map(Number);
    return !isNaN(start) && !isNaN(end) && start <= end;
  }

  // List: n,m,o
  if (field.includes(",")) {
    return field.split(",").every(v => {
      const n = parseInt(v.trim());
      return !isNaN(n) && n >= 0;
    });
  }

  // Single number
  const n = parseInt(field);
  return !isNaN(n) && n >= 0;
}

export function parseExpression(expr: string, fromTime: number = Date.now()): number {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error("Invalid cron expression: must have 5 fields");
  }

  const [minuteExpr, hourExpr, dayExpr, monthExpr, weekdayExpr] = parts;
  const date = new Date(fromTime);

  // Move to next minute
  date.setSeconds(0, 0);
  date.setMinutes(date.getMinutes() + 1);

  const maxIterations = 525600; // ~1 year of minutes
  for (let i = 0; i < maxIterations; i++) {
    if (
      matches(date.getMinutes(), minuteExpr, 0, 59) &&
      matches(date.getHours(), hourExpr, 0, 23) &&
      matches(date.getDate(), dayExpr, 1, 31) &&
      matches(date.getMonth() + 1, monthExpr, 1, 12) &&
      matches(date.getDay(), weekdayExpr, 0, 6)
    ) {
      return date.getTime();
    }
    date.setMinutes(date.getMinutes() + 1);
  }

  throw new Error("Could not find next trigger within 1 year");
}

function matches(value: number, expr: string, min: number, max: number): boolean {
  if (expr === "*") return true;

  // */n pattern
  if (expr.startsWith("*/")) {
    const step = parseInt(expr.slice(2));
    return value % step === 0;
  }

  // Range with step: n-m/s
  if (expr.includes("/")) {
    const [range, step] = expr.split("/");
    const stepNum = parseInt(step);
    if (range === "*") {
      return value % stepNum === 0;
    }
    if (range.includes("-")) {
      const [start, end] = range.split("-").map(Number);
      return value >= start && value <= end && value % stepNum === 0;
    }
    return false;
  }

  // Range: n-m
  if (expr.includes("-")) {
    const [start, end] = expr.split("-").map(Number);
    return value >= start && value <= end;
  }

  // List: n,m,o
  if (expr.includes(",")) {
    return expr.split(",").map(v => parseInt(v.trim())).includes(value);
  }

  // Single value
  return parseInt(expr) === value;
}

export function describeCron(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return expr;

  const [minute, hour, day, month, weekday] = parts;

  // Common patterns
  if (minute.startsWith("*/")) {
    const mins = parseInt(minute.slice(2));
    if (hour === "*" && day === "*" && month === "*" && weekday === "*") {
      return `Every ${mins} minute${mins > 1 ? "s" : ""}`;
    }
  }

  if (minute.match(/^\d+$/) && hour.match(/^\d+$/)) {
    const m = parseInt(minute);
    const h = parseInt(hour);
    const timeStr = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
    if (day === "*" && month === "*" && weekday === "*") {
      return `Daily at ${timeStr}`;
    }
    if (weekday !== "*" && day === "*") {
      const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const dayList = weekday.split(",").map(d => days[parseInt(d)]).join(", ");
      return `Every ${dayList} at ${timeStr}`;
    }
  }

  return expr;
}
