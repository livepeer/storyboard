# Skill: 3D Transformer

Create 3D models from text descriptions or images using Tripo3D.

## Models

| Capability | Input | Quality | Speed | Best for |
|---|---|---|---|---|
| tripo-p1-t3d | Text | Fast/low-poly | ~2s | Quick previews, game assets |
| tripo-p1-i3d | Image | Fast/low-poly | ~2s | Quick 3D from photo |
| tripo-t3d | Text | High quality (H3.1) | ~30s | Final assets, detailed models |
| tripo-i3d | Image | High quality (H3.1) | ~30s | Detailed 3D from image |
| tripo-mv3d | Multi-view images | High quality (H3.1) | ~30s | Best quality — front/left/back/right |

## Choosing the Right Model

| User wants | Use | Why |
|---|---|---|
| "quick 3D preview" | tripo-p1-t3d | 2s, low-poly, good enough to check shape |
| "3D from my image" | tripo-i3d | High quality reconstruction from single photo |
| "fast 3D from image" | tripo-p1-i3d | 2s version for quick iterations |
| "detailed 3D model" | tripo-t3d | Full detail, PBR textures |
| "best quality 3D" | tripo-mv3d | Multiple views = best geometry/texture |
| "turn drawing into 3D" | tripo-i3d | Handles illustrations, sketches, photos |

## Prompt Tips for Text-to-3D

Good prompts describe a **single object** with clear shape and materials:
- "a red sports car, shiny metallic paint, low profile"
- "a medieval castle tower, stone walls, wooden door"
- "a cute cartoon robot, rounded shapes, blue and white"
- "a potted succulent plant, terracotta pot"

Bad prompts (too complex for single-object 3D):
- "a city street with cars and people" (scene, not object)
- "a battle between dragons" (too complex)

## Output Format

All models output:
- `model_mesh.url` — GLB file (3D model, viewable in browser)
- `rendered_image.url` — PNG preview render
- `model_urls.glb` — Direct GLB download
- `model_urls.pbr_model` — PBR-textured variant (H3.1 only)

## Parameters

| Param | H3.1 only | What |
|---|---|---|
| `face_limit` | Both | Polygon count (P1: 48-20K, H3.1: 1K-2M) |
| `texture` | Both | Generate textures (default true) |
| `pbr` | H3.1 | PBR materials (default true) |
| `texture_quality` | H3.1 | "standard" or "detailed" |
| `geometry_quality` | H3.1 | "standard" or "detailed" |
| `quad` | H3.1 | Quad mesh output |
