import type { Mission } from "./types";

const MISSIONS: Mission[] = [
  {
    id: "dream-pet",
    title: "My Dream Pet",
    description: "Imagine and create your perfect fantasy pet!",
    icon: "🐾",
    difficulty: "starter",
    category: "image",
    maxStars: 3,
    steps: [
      {
        id: "describe",
        type: "text_input",
        instruction: "What does your dream pet look like? Describe its colors, size, and any magical features!",
        hint: "Think about what makes your pet special — maybe it has wings, glows in the dark, or has rainbow fur!",
      },
      {
        id: "generate",
        type: "generate",
        instruction: "Let's bring your dream pet to life!",
        hint: "The AI will paint your pet based on your description.",
        capability: "flux-dev",
        autoPromptPrefix: "cute child-friendly cartoon illustration, colorful, friendly, ",
      },
      {
        id: "review",
        type: "review",
        instruction: "Take a look at your dream pet! Do you love it?",
        hint: "You can go back and try again with a different description if you want.",
      },
      {
        id: "celebrate",
        type: "celebrate",
        instruction: "Amazing! You created your dream pet! 🎉",
      },
    ],
  },
  {
    id: "superhero",
    title: "Superhero Portrait",
    description: "Design your own superhero and give them an epic power effect!",
    icon: "🦸",
    difficulty: "starter",
    category: "image",
    maxStars: 3,
    steps: [
      {
        id: "describe",
        type: "text_input",
        instruction: "Describe your superhero! What do they look like? What's their costume like?",
        hint: "Think about colors, a cool mask, a cape, or any special details that make them unique!",
      },
      {
        id: "generate",
        type: "generate",
        instruction: "Time to create your superhero!",
        hint: "The AI will draw your hero in an epic pose.",
        capability: "flux-dev",
        autoPromptPrefix: "epic superhero portrait, child-friendly cartoon style, dynamic pose, bright colors, ",
      },
      {
        id: "transform",
        type: "transform",
        instruction: "Add an epic power effect to your superhero!",
        hint: "Try: 'add lightning bolts', 'surround with flames', 'add glowing energy aura'",
        capability: "kontext-edit",
        action: "restyle",
      },
      {
        id: "celebrate",
        type: "celebrate",
        instruction: "Your superhero is ready to save the day! 🦸‍♀️💥",
      },
    ],
  },
  {
    id: "funny-animal",
    title: "Funny Animal Moment",
    description: "Create a hilarious cartoon of an animal in a silly situation!",
    icon: "🤣",
    difficulty: "starter",
    category: "image",
    maxStars: 3,
    steps: [
      {
        id: "describe",
        type: "text_input",
        instruction: "What animal is it and what funny thing are they doing?",
        hint: "Examples: 'a cat wearing sunglasses eating pizza', 'a dog trying to drive a rocket ship', 'a frog playing a tiny guitar'",
      },
      {
        id: "generate",
        type: "generate",
        instruction: "Let's make the funniest cartoon ever!",
        hint: "The AI will draw your silly animal scene.",
        capability: "flux-dev",
        autoPromptPrefix: "hilarious cartoon, child-friendly humor, vibrant colors, exaggerated expressions, ",
      },
      {
        id: "celebrate",
        type: "celebrate",
        instruction: "Ha! That's hilarious! You're a comedy genius! 🤣🎨",
      },
    ],
  },
];

const MISSION_MAP = new Map<string, Mission>(MISSIONS.map((m) => [m.id, m]));

export function getMission(id: string): Mission | undefined {
  return MISSION_MAP.get(id);
}

export { MISSIONS };
