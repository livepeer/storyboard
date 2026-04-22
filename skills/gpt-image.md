# Skill: GPT Image 2

OpenAI's GPT Image 2 model for high-quality image generation and editing.

## Capabilities

| Capability | Model ID | Best For |
|---|---|---|
| `gpt-image` | openai/gpt-image-2 | Text-to-image: product briefings, text overlays, infographics, logos, UI mockups |
| `gpt-image-edit` | openai/gpt-image-2/edit | Image editing: add/remove elements, change backgrounds, enhance details |

## When to Use GPT Image 2

GPT Image 2 excels at things other image models struggle with:

- **Text in images** — renders readable text, labels, captions, logos accurately
- **Product briefings** — clean product shots with annotations, callouts, specs
- **Infographics** — charts, diagrams, data visualizations with clear text labels
- **UI/UX mockups** — app screens, dashboards, website layouts
- **Marketing assets** — social media cards, banners with text overlay
- **Technical diagrams** — architecture diagrams, flowcharts, wireframes
- **Brand assets** — logos, icons, brand guidelines

## When NOT to Use

- Photorealistic scenes → use `flux-dev` or `seedream-5-lite`
- Artistic/painterly styles → use `recraft-v4`
- Video generation → use `seedance-i2v` or `ltx-i2v`

## Usage in Tools

### Text-to-Image
```json
{
  "capability": "gpt-image",
  "prompt": "A clean product briefing card for wireless earbuds, white background, product photo center, specs listed on the right: 40hr battery, ANC, Bluetooth 5.3, price $149",
  "params": { "size": "1024x1024" }
}
```

### Image Editing
```json
{
  "capability": "gpt-image-edit",
  "prompt": "Add a price tag showing $99.99 to the bottom right corner",
  "image_data": "<base64 or URL of source image>",
  "params": { "size": "1024x1024" }
}
```

## Context Menu Integration

Right-click any image card → **Product Briefing** → generates a professional product briefing using gpt-image-edit with the selected image as reference.

Right-click canvas → **GPT Image** → generates a new image from text prompt using gpt-image.
