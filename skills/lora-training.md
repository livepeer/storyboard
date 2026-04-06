# LoRA Training Guide

## What is LoRA?
LoRA (Low-Rank Adaptation) fine-tunes a model to recognize a specific subject, style, or concept using your images.

## Requirements
- **Images:** 5-20 high-quality images of the subject
- **Format:** JPG, PNG, or a ZIP file containing images
- **Trigger word:** A unique word (e.g., "xyz_person", "sks_style") that activates the LoRA
- **Steps:** 500-2000 (default 1000). More steps = better quality but longer training

## Guidelines
| Image count | Steps | Quality |
|-------------|-------|---------|
| 5-10 | 500-800 | Good for styles |
| 10-20 | 800-1500 | Good for faces/subjects |
| 20+ | 1000-2000 | Best quality |

## Tips
- Use consistent lighting and angles for face/person training
- For style training, use diverse subjects with the same artistic style
- Trigger word should be unique — don't use real words
- Training takes 5-30 minutes depending on steps

## Using a Trained LoRA
After training completes, include the trigger word in your prompts:
- "A portrait of xyz_person in a garden"
- "A landscape in sks_style with mountains"
