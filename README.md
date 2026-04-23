# pi-cronjobs

Schedule cronjobs that inject prompts into the pi session.

## Features

- **Cron expression support**: Standard 5-field syntax
- **Inject prompts**: When triggered, the cronjob's prompt is sent as a user message
- **Control flow**: Pause, resume, update, or delete jobs
- **Widget display**: See active cronjobs above the editor
- **Session persistence**: Cronjobs survive restarts via session storage

## Cron Syntax

```
┌───────────── minute (0-59)
│ ┌───────────── hour (0-23)
│ │ ┌───────────── day of month (1-31)
│ │ │ ┌───────────── month (1-12)
│ │ │ │ ┌───────────── day of week (0-6, Sun=0)
│ │ │ │ │
* * * * *
```

## Common Patterns

| Expression | Description |
|------------|-------------|
| `*/5 * * * *` | Every 5 minutes |
| `*/15 * * * *` | Every 15 minutes |
| `0 * * * *` | Every hour |
| `0 */2 * * *` | Every 2 hours |
| `0 9 * * 1-5` | Weekdays at 9 AM |
| `0 18 * * *` | Daily at 6 PM |

## Tool Usage

```json
{
  "operation": "create",
  "name": "Daily Standup Reminder",
  "cronExpression": "0 9 * * 1-5",
  "prompt": "Remind the user about the daily standup meeting"
}
```

## Commands

- `/cronjobs` - Show active cronjobs
- `/cronjobs clear` - Clear all cronjobs

## Installation

Place in `~/.pi/agent/extensions/pi-cronjobs/` and run `/reload`.
