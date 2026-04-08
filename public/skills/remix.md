# Remix Canvas

Combine multiple canvas cards into composite outputs.

## How It Works
1. Use `canvas_get` to find the cards the user references
2. Use `create_media` with `restyle` action, passing the source image URL and a prompt that describes the combination
3. Create edges from BOTH source cards to the new composite

## Combination Patterns

### Merge Two Images
"Combine the dragon with the city background"
1. canvas_get → find dragon card URL and city card URL
2. create_media: restyle step with dragon URL as input, prompt: "dragon flying over the city, composite"
3. Result has edges from both source cards

### Style Transfer
"Apply the style of card A to card B"
1. canvas_get → find both cards
2. create_media: restyle step with card B URL as input, prompt describing card A's style

### Composite Storyboard
"Create a poster combining shots 1, 3, and 5"
1. canvas_get to find all three cards
2. create_media: generate step with prompt describing the poster layout referencing all shots

## Rules
- Always use canvas_get first to find card URLs — don't guess
- The `restyle` action with kontext-edit works best for combining two images
- For more than 2 cards, describe the composition in the prompt
- Title the result "Remix: [brief description]"
- Create edges from all source cards to show provenance
