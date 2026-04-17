# Daily Briefing Skill

Create a personalized daily briefing as a 6-slide visual deck from your email inbox.

## Format: Slide Deck (6 cards)

| Slide | Content | Visual Style |
|---|---|---|
| 1 — Title | "Daily Briefing — [date]", total email count, top themes | Dark bg, centered white text, minimalist corporate |
| 2-6 — Emails | One email per slide: sender, subject, 1-2 sentence summary | Color-coded by urgency, abstract geometric, keynote aesthetic |

**Urgency color coding:**
- Red/orange: urgent or time-sensitive
- Blue: normal importance
- Green: FYI / newsletter / low priority

## Workflow (requires Gmail MCP connection)

1. **Fetch**: gmail_list or gmail_search for last 24 hours
2. **Analyze**: pick top 5 most important by urgency, sender weight, subject keywords
3. **Generate**: call create_media with EXACTLY 6 steps (1 title + 5 email slides)
4. **Organize**: canvas_organize in narrative mode (left-to-right row)
5. **Present**: tell user the deck is ready with sender/subject in each card title

## Adaptation Rules

- **Busy inbox (>20 emails)**: focus on top 5, mention total count in title slide
- **Light inbox (<5 emails)**: expand summaries, fill remaining slides with "Inbox clear" visuals
- **Time of day**: morning = "Good morning" tone; evening = "End of day wrap-up"
- **User feedback**: "shorter" → 3 slides; "more detail" → expand to 8 slides

## Other Data Sources (same deck pattern)

- **Calendar**: "What's my day?" → 6 slides of upcoming meetings/events
- **Slack**: "What happened in #engineering?" → 6 slides of key messages
- **News/RSS**: "Tech news briefing" → 6 slides of top headlines
- **GitHub**: "What PRs need review?" → 6 slides of pending PRs

## Pattern

Always: **fetch → rank top 5 → title slide + 5 content slides → organize → present**.

Card titles MUST reference real content (sender + subject for email, event name for calendar, etc.). Never generic placeholders.

## When MCP is Not Connected

"I'd need Gmail access to fetch your emails. Go to Settings → Connected Tools → Gmail (Local) → Connect. Then try again."
