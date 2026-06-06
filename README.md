[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/steimerbyte)

> ⭐ If you find this useful, consider [supporting me on Ko-fi](https://ko-fi.com/steimerbyte)!

<img src="https://storage.ko-fi.com/cdn/generated/fhfuc7slzawvi/2026-04-23_rest-162bec27f642a562eb8401eb0ceb3940-onjpojl8.jpg" width="250" alt="steimerbyte" style="border-radius: 5%; margin: 16px 0; max-width: 100%;"/>

# pi-cronjobs

Schedule cronjobs that inject prompts into your **active** pi session.

## Features

- **CLI-style tool** — Single `crontab` command with intuitive syntax
- **Interval shortcuts** — `5m`, `1h`, `1d` instead of complex cron expressions
- **Active chat injection** — Triggers directly into the current chat
- **Widget display** — See active cronjobs above the editor
- **Session persistence** — Survives restarts via JSON storage

## Installation

Place in `~/.pi/agent/extensions/pi-cronjobs/` and run `/reload`.

## Usage

### crontab Tool

```
crontab --add --name "Reminder" --every "5m" -- "Your prompt"
crontab --list
crontab --delete <id>
crontab --pause <id>
crontab --resume <id>
crontab --clear
```

### Examples

```bash
# Every 5 minutes
crontab --add --every "5m" -- "Check system status"

# Daily at 9 AM
crontab --add --name "Standup" --every "1d" -- "Daily standup reminder"

# Every 15 minutes with max triggers
crontab --add --every "15m" --max-triggers 10 -- "Temporary reminder"

# Use custom cron expression
crontab --add --every "*/10 * * * *" -- "Every 10 minutes"
```

### Interval Shortcuts

| Shortcut | Cron Expression | Description |
|----------|----------------|-------------|
| `5m` | `*/5 * * * *` | Every 5 minutes |
| `10m` | `*/10 * * * *` | Every 10 minutes |
| `15m` | `*/15 * * * *` | Every 15 minutes |
| `30m` | `*/30 * * * *` | Every 30 minutes |
| `1h` | `0 * * * *` | Every hour (at :00) |
| `2h` | `0 */2 * * *` | Every 2 hours |
| `1d` | `0 9 * * *` | Daily at 9 AM |
| `1w` | `0 9 * * 1` | Weekly on Monday at 9 AM |

### Commands

- `/cronjobs` — Show cronjob status
- `/cronjobs clear` — Clear all cronjobs

## How Triggers Work

When a cronjob triggers:
1. The cron engine checks every 30 seconds
2. Due jobs have their prompt injected into the **active chat**
3. The message appears as a user message, causing the agent to respond
4. The job's trigger count is incremented

## License

MIT

---

## Hinweis zur KI-Unterstützung

Bei der Entwicklung dieses Projekts wurden teilweise oder vollständig KI-gestützte Tools und Technologien eingesetzt.