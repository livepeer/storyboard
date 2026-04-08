# Storyboard from a Script

## How It Works
When a user pastes a scene description or story, break it into shots and generate all media in ONE `create_media` call.

## Shot Breakdown Rules
1. Parse the text into 4-8 visual moments (shots)
2. Each shot = one `create_media` step
3. First shots are images (`generate`), key moment gets animated (`animate` with `depends_on`)
4. Add narration as TTS (`tts` step) if the text has dialogue or narration
5. Title each card with "Shot N: [brief description]"

## Step Planning Template
```
Shot 1: Establishing — wide shot of setting (generate, style_hint: "cinematic")
Shot 2: Character intro — medium shot (generate)
Shot 3: Key action — the dramatic moment (generate)
Shot 4: Reaction — close-up (generate)
Shot 5: Climax animation — animate Shot 3 (animate, depends_on: 2)
Shot 6: Narration — voice over (tts, if dialogue exists)
```

## Example
User: "A knight approaches a dragon's cave at sunset. The dragon emerges breathing fire."

```json
{
  "steps": [
    {"action": "generate", "prompt": "wide shot, a lone knight in silver armor walking toward a dark cave entrance, golden sunset sky, cinematic", "title": "Shot 1: Approach", "style_hint": "cinematic"},
    {"action": "generate", "prompt": "medium shot, knight seen from behind, massive cave entrance with dragon claw marks on rocks, warm sunset light", "title": "Shot 2: The Cave"},
    {"action": "generate", "prompt": "close-up, dragon's glowing eyes visible in cave darkness, smoke wisps, dramatic lighting", "title": "Shot 3: Dragon Awakens"},
    {"action": "generate", "prompt": "wide dramatic shot, enormous dragon emerging from cave breathing orange fire, knight raising shield, sunset silhouette", "title": "Shot 4: The Emergence"},
    {"action": "animate", "prompt": "dragon breathing fire, flames illuminating the scene, camera slowly zooms in", "title": "Shot 5: Fire Breath", "depends_on": 3},
    {"action": "tts", "prompt": "The knight stood his ground as ancient flame split the twilight sky.", "title": "Narration"}
  ]
}
```

## Token Budget
- Keep total under 3,000 tokens for the full storyboard
- Use concise prompts (under 30 words each)
- Don't describe what the user will see — the canvas shows it
