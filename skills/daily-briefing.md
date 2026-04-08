# Daily Briefing Skill

Create personalized daily briefing videos from any data source.

## Email Briefing (requires Gmail MCP connection)
When the user asks for an email briefing or daily summary:

1. **Fetch emails**: Use gmail search tool for last 24h inbox
2. **Analyze & prioritize**: Identify urgent, important, and FYI emails
3. **Write narration script** (~150 words for 15s, ~300 words for 30s):
   - Open with "Good morning, here's your briefing for [date]"
   - Group by priority: urgent items first, then important, then FYI
   - Close with "That's your update. Have a productive day."
4. **Generate visuals**: Create 3-5 thematic background images using create_media
   - Match visual tone to content (urgent=bold red/orange, calm=blue/green)
   - Use abstract/artistic styles, not literal email screenshots
5. **Generate narration**: Use TTS step in create_media
6. **Present on canvas**: All cards laid out in sequence

## Adaptation Rules
- **Busy inbox (>20 emails)**: Focus on top 5-7 most important, mention count of others
- **Light inbox (<5 emails)**: Expand each email summary, add more detail
- **Time of day**: Morning = full briefing; evening = "end of day wrap-up" tone
- **User preference signals**: If user says "shorter" → reduce to 3 images; "more detail" → expand to 6+

## Other Data Sources (adapt the same pattern)
- **Calendar**: "What's my day look like?" → fetch calendar events → narrate schedule
- **Slack**: "What happened in #engineering?" → fetch channel history → summarize
- **News/RSS**: "Tech news briefing" → fetch headlines → narrate top stories
- **GitHub**: "What PRs need my review?" → fetch notifications → narrate

## Pattern
Always: **fetch → analyze → script → visuals → narrate → present**.
Adapt the visual style, narration tone, and length to the content and user preferences.

## When MCP is Not Connected
If the user asks for an email briefing but Gmail is not connected:
"I'd need Gmail access to fetch your emails. Go to Settings → Connected Tools → Gmail → Connect."
