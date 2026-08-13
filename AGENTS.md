# AGENTS.md — How Chlk Bots Update Their Card Status

This document is for Chlk specialist bots (design, growth, eng, ops, etc.) that need to
move their own ticket on the founder dashboard.

---

## The API endpoint

```
PATCH http://localhost:3000/api/tickets/<ticketId>
Content-Type: application/json
```

`ticketId` is the agent's own ID (e.g. the Cursor cloud agent `bcId`, or any stable
string identifier the bot uses for itself).

### Request body

All fields are optional — supply only the ones you want to change.

| Field | Type | Description |
|---|---|---|
| `owner` | `string` | Human-readable name of the bot / agent that owns this card. |
| `chlkStatus` | `"to_do" \| "in_progress" \| "blocked" \| "done"` | The card's Chlk status. |
| `blockerReason` | `string` | **Required when `chlkStatus` is `"blocked"`**. Describe what is blocking progress. Automatically cleared when status moves off `"blocked"`. |
| `needsFounderDecision` | `boolean` | Set `true` to surface this card in the Founder Strip's "Needs Rashad" list. |
| `founderDecisionNote` | `string` | Context for Rashad about the decision needed. |
| `isPriorityOne` | `boolean` | Set `true` to mark this as the single #1 priority. Any previously marked card is automatically demoted. |

### Response

`200 OK` — the full updated `ChlkTicketMeta` object:

```json
{
  "agentId": "bot-design",
  "owner": "design-bot",
  "chlkStatus": "blocked",
  "blockerReason": "Waiting for brand color decision from Rashad",
  "isPriorityOne": false,
  "needsFounderDecision": true,
  "founderDecisionNote": "Need final approval on brand palette before generating assets",
  "updatedAt": "2026-08-13T01:00:00.000Z"
}
```

---

## Usage examples

### Move to "In Progress"

```bash
curl -X PATCH http://localhost:3000/api/tickets/bot-design \
  -H "Content-Type: application/json" \
  -d '{"owner":"design-bot","chlkStatus":"in_progress"}'
```

### Block with a reason and flag for founder

```bash
curl -X PATCH http://localhost:3000/api/tickets/bot-design \
  -H "Content-Type: application/json" \
  -d '{
    "chlkStatus": "blocked",
    "blockerReason": "Waiting for brand color decision",
    "needsFounderDecision": true,
    "founderDecisionNote": "Need final call on brand palette before generating assets"
  }'
```

### Mark Done and clear the founder-decision flag

```bash
curl -X PATCH http://localhost:3000/api/tickets/bot-design \
  -H "Content-Type: application/json" \
  -d '{"chlkStatus":"done","needsFounderDecision":false}'
```

### Python snippet (e.g. inside a Chlk agent)

```python
import httplib2, json

def update_ticket(ticket_id: str, **kwargs) -> dict:
    h = httplib2.Http()
    body = json.dumps(kwargs).encode()
    _resp, content = h.request(
        f"http://localhost:3000/api/tickets/{ticket_id}",
        method="PATCH",
        headers={"Content-Type": "application/json"},
        body=body,
    )
    return json.loads(content)

# Example
update_ticket(
    "bot-growth",
    owner="growth-bot",
    chlkStatus="in_progress",
)
```

---

## Status enum

| Value | Display | Meaning |
|---|---|---|
| `to_do` | To Do | Work not yet started |
| `in_progress` | In Progress | Actively being worked on |
| `blocked` | Blocked | Paused — requires `blockerReason` |
| `done` | Done | Completed |

---

## Founder Strip

The persistent strip at the top of the board displays:

- **#1 Priority** — the single manually-labeled ticket Rashad cares most about right now.
  Set via `PATCH /api/tickets/<id>` with `{ "isPriorityOne": true }`, or by clicking the ★
  icon on any card in the UI. Exactly one ticket can be #1 at a time; setting another
  automatically demotes the previous one.
- **Needs Rashad** — count of tickets where `needsFounderDecision: true`. Click the ⚠ icon
  on a card to toggle, or pass `{ "needsFounderDecision": true }` in a PATCH.

---

## Persistence

Ticket metadata is stored in `~/.agent-kanban/chlk-tickets.json` on the machine running
the dashboard. It is separate from the Cursor API key settings and survives server restarts.
