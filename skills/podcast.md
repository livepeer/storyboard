# Skill: Podcast Generator

Turn any topic, text, or email briefing into a conversational podcast audio.

## Styles

| Style | Hosts | Voice feel |
|-------|-------|-----------|
| `duo` (default) | Host A + Host B | Two distinct voices, conversational banter |
| `solo` | Single narrator | Polished, authoritative monologue |
| `interview` | Interviewer + Guest | Q&A format, curious + expert dynamic |

## Usage

```
/podcast <topic>                    Duo podcast about a topic
/podcast <topic> --style solo       Single narrator
/podcast <topic> --style interview  Interview format
/podcast daily briefing             Podcast from today's email summary
```

## How It Works

1. **Script generation** — Gemini writes a natural conversation script (2-4 minutes)
2. **Voice synthesis** — Each host's lines are generated with a different TTS voice
3. **Audio cards** — Each segment placed on canvas, linked sequentially

## Script Prompt Rules

- Natural, conversational — not scripted-sounding
- Include reactions: "Oh interesting!", "Right, exactly", "Wait, really?"
- Duo: hosts build on each other's points, light disagreement is good
- Solo: vary pace — questions, pauses, emphasis
- Interview: interviewer asks follow-ups based on answers
- 6-10 exchanges for duo/interview, 4-6 paragraphs for solo
- Each segment: 1-3 sentences (keeps TTS natural)

## Voice Assignment

| Style | Host A | Host B |
|-------|--------|--------|
| duo | chatterbox-tts (default voice) | gemini-tts (Puck voice) |
| solo | gemini-tts (Kore voice) | — |
| interview | chatterbox-tts (interviewer) | gemini-tts (Enceladus voice) |
