# Iterative Refinement

Generate, evaluate, improve, upscale. Creates a visible iteration trail on the canvas.

## Loop
1. **Generate** — create_media with initial prompt
2. **Check** — canvas_get to confirm the card was created with media
3. **Evaluate** — look at the result URL. If the user asked for "professional" quality, consider if it needs improvement
4. **Re-generate** — if quality could improve, create a new step with a refined prompt (more specific, better keywords)
5. **Upscale** — upscale the best result as the final step

## Prompt Refinement Strategy
- Iteration 1: User's prompt + basic quality keywords
- Iteration 2: Add specific details (lighting, composition, medium)
- Iteration 3: Fine-tune based on what typically works best for this subject

## Example
User: "Create a professional product photo of headphones"

Step 1: generate "professional product photo of wireless headphones, white background, studio lighting"
Step 2: generate "premium wireless headphones floating on pure white background, soft shadows, commercial photography, DSLR 85mm lens, f/2.8" style_hint: "professional"
Step 3: upscale step 2 (depends_on: 1)

## Rules
- Maximum 3 generation attempts (don't loop forever)
- Each iteration should have a DIFFERENT prompt (not the same one)
- Title cards: "v1: [subject]", "v2: [subject]", "Final: [subject]"
- The upscaled version should always be the last step
- Use depends_on to create edges showing the refinement trail
