# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Kanban color | Meaning                                  |
| -------------------------- | -------------------- | ------------ | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Amber        | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Blue         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Green        | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Purple       | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Red          | Will not be actioned                     |

When a skill mentions a role, use the corresponding label string from this table. In the Obsidian Kanban board, record labels as explicit metadata inside the ticket's `Implementation Data` section.

## Kanban Color Markup

Use these exact snippets for the ticket's triage line:

```html
- Triage: <span style="color: #f59e0b">needs-triage</span>
- Triage: <span style="color: #38bdf8">needs-info</span>
- Triage: <span style="color: #22c55e">ready-for-agent</span>
- Triage: <span style="color: #a78bfa">ready-for-human</span>
- Triage: <span style="color: #ef4444">wontfix</span>
```

The Kanban template and project board use inline colored spans because they render directly inside Obsidian Kanban cards without relying on global vault CSS.
