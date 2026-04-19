import type { Mission, StyleOption } from "./types";

// Reusable style options — kids pick before generating
const STYLES: StyleOption[] = [
  { id: "cartoon", label: "Cartoon", icon: "🎨", promptPrefix: "colorful cartoon illustration, bold outlines, vibrant, child-friendly, " },
  { id: "anime", label: "Anime", icon: "✨", promptPrefix: "anime style, big expressive eyes, vibrant colors, Studio Ghibli inspired, " },
  { id: "watercolor", label: "Watercolor", icon: "🖌️", promptPrefix: "beautiful watercolor painting, soft colors, artistic, dreamy, " },
  { id: "pixel", label: "Pixel Art", icon: "👾", promptPrefix: "pixel art style, retro game aesthetic, 16-bit, colorful sprites, " },
  { id: "3d", label: "3D Render", icon: "🧊", promptPrefix: "3D rendered, Pixar style, smooth shading, vibrant lighting, cute, " },
  { id: "comic", label: "Comic Book", icon: "💥", promptPrefix: "comic book style, bold ink lines, halftone dots, dynamic composition, " },
];

const MISSIONS: Mission[] = [
  // ── STARTER (age 8-10) ──────────────────────────────────────
  {
    id: "dream-pet",
    title: "My Dream Pet",
    description: "Design a magical pet that doesn't exist — then watch it come to life!",
    icon: "🐾",
    difficulty: "starter",
    category: "mixed",
    maxStars: 3,
    steps: [
      {
        id: "spark",
        type: "spark_pick",
        instruction: "What kind of dream pet would you create? Pick one or make up your own!",
        sparks: [
          { label: "🐲 Dragon with rainbow wings", prompt: "a small friendly dragon with shimmering rainbow wings and big curious eyes" },
          { label: "🦄 Unicorn kitten", prompt: "a fluffy kitten with a tiny golden unicorn horn and starry eyes" },
          { label: "🐙 Flying octopus", prompt: "a cheerful octopus with tiny butterfly wings floating through clouds" },
          { label: "🦊 Crystal fox", prompt: "a magical fox made of glowing crystals, leaving sparkle trails" },
          { label: "🐸 Cloud frog", prompt: "a chubby frog sitting on a fluffy cloud, wearing a tiny crown" },
          { label: "✏️ I have my own idea!", prompt: "" },
        ],
      },
      {
        id: "style",
        type: "style_pick",
        instruction: "How should your pet look? Pick an art style!",
        styles: STYLES,
      },
      {
        id: "generate",
        type: "generate",
        instruction: "Let's bring your dream pet to life! ✨",
        capability: "flux-dev",
      },
      {
        id: "remix",
        type: "remix",
        instruction: "Love it? Try some fun variations! Each one is unique.",
        hint: "Tap a remix to create a new version — collect your favorites!",
        remixCount: 3,
        capability: "flux-dev",
      },
      {
        id: "animate",
        type: "animate",
        instruction: "Now let's make your pet MOVE! 🎬",
        hint: "The AI will animate your pet — watch it come to life!",
        capability: "seedance-i2v",
        autoPromptPrefix: "gentle movement, cute animation, the character moves naturally, ",
      },
      {
        id: "celebrate",
        type: "celebrate",
        instruction: "Your dream pet is alive! 🎉",
      },
    ],
  },

  {
    id: "superhero",
    title: "Superhero Origin Story",
    description: "Create a superhero and tell their origin story in 4 scenes!",
    icon: "🦸",
    difficulty: "starter",
    category: "story",
    maxStars: 3,
    steps: [
      {
        id: "spark",
        type: "spark_pick",
        instruction: "Every hero needs a story! Pick a superhero concept:",
        sparks: [
          { label: "⚡ Kid who found a magic glove", prompt: "a young kid discovering a glowing magical glove in an old attic" },
          { label: "🌊 Ocean guardian with wave powers", prompt: "a brave young hero controlling ocean waves near a lighthouse" },
          { label: "🌿 Plant whisperer growing giant flowers", prompt: "a gentle hero making enormous colorful flowers grow from the ground" },
          { label: "🔥 Fire dancer performing in a volcano", prompt: "a fearless dancer surrounded by beautiful swirling fire patterns" },
          { label: "✏️ My own superhero!", prompt: "" },
        ],
      },
      {
        id: "style",
        type: "style_pick",
        instruction: "What style for your superhero comic?",
        styles: STYLES,
      },
      {
        id: "story",
        type: "story_gen",
        instruction: "Let's create your superhero's origin story — 4 epic scenes!",
        hint: "The AI will write and illustrate 4 scenes showing how your hero gets their powers.",
        capability: "flux-dev",
      },
      {
        id: "celebrate",
        type: "celebrate",
        instruction: "Your superhero origin story is complete! 🦸‍♂️💥",
      },
    ],
  },

  {
    id: "funny-animal",
    title: "LOL Animals",
    description: "Create the funniest animal picture and remix it into chaos!",
    icon: "🤣",
    difficulty: "starter",
    category: "image",
    maxStars: 3,
    steps: [
      {
        id: "spark",
        type: "spark_pick",
        instruction: "Pick a silly animal situation or invent your own!",
        sparks: [
          { label: "🍕 Cat ordering pizza on the phone", prompt: "a serious-looking cat talking on a phone ordering pizza, sitting at a tiny desk" },
          { label: "🚀 Dog astronaut on the moon", prompt: "a golden retriever in a space suit planting a bone flag on the moon" },
          { label: "🎸 Penguin playing electric guitar", prompt: "a penguin shredding an electric guitar on stage with dramatic lighting" },
          { label: "🏄 Hamster surfing a giant wave", prompt: "a tiny hamster riding a surfboard on a huge ocean wave, looking determined" },
          { label: "👨‍🍳 Frog chef cooking in a fancy restaurant", prompt: "a frog wearing a chef hat cooking in a gourmet kitchen, very focused" },
          { label: "✏️ My silly idea!", prompt: "" },
        ],
      },
      {
        id: "generate",
        type: "generate",
        instruction: "Let's make the funniest picture ever! 😂",
        capability: "flux-dev",
        autoPromptPrefix: "hilarious cartoon, extremely funny, exaggerated expressions, vibrant colors, child-friendly humor, ",
      },
      {
        id: "remix",
        type: "remix",
        instruction: "These are hilarious! Want to see more versions? 🎲",
        remixCount: 4,
        capability: "flux-dev",
      },
      {
        id: "celebrate",
        type: "celebrate",
        instruction: "You're a comedy genius! 🤣🏆",
      },
    ],
  },

  // ── EXPLORER (age 10-13) ────────────────────────────────────
  {
    id: "comic-strip",
    title: "Comic Strip Creator",
    description: "Write and illustrate a 4-panel comic strip with your own characters!",
    icon: "💬",
    difficulty: "explorer",
    category: "story",
    maxStars: 3,
    unlockAfter: ["dream-pet", "superhero", "funny-animal"],
    steps: [
      {
        id: "concept",
        type: "text_input",
        instruction: "What's your comic about? Describe the characters and situation!",
        hint: "Example: Two robot best friends trying to bake a cake but everything goes wrong",
        sparks: [
          { label: "🤖 Robot cooking disaster", prompt: "two clumsy robots trying to bake a birthday cake in a messy kitchen" },
          { label: "🐱 Cat vs laser pointer", prompt: "a dramatic cat chasing a mysterious red dot through an entire house" },
          { label: "👽 Alien's first day at school", prompt: "a friendly green alien confused by everything on their first day at a human school" },
          { label: "✏️ My own comic!", prompt: "" },
        ],
      },
      {
        id: "style",
        type: "style_pick",
        instruction: "Choose your comic art style!",
        styles: STYLES,
      },
      {
        id: "story",
        type: "story_gen",
        instruction: "Creating your 4-panel comic strip! Each panel tells the next part of the story.",
        capability: "flux-dev",
      },
      {
        id: "celebrate",
        type: "celebrate",
        instruction: "Your comic strip is ready to share! 💬✨",
      },
    ],
  },

  {
    id: "music-video",
    title: "Music Video Director",
    description: "Create a scene, animate it, and add a soundtrack — you're the director!",
    icon: "🎵",
    difficulty: "explorer",
    category: "mixed",
    unlockAfter: ["dream-pet", "superhero", "funny-animal"],
    maxStars: 3,
    steps: [
      {
        id: "spark",
        type: "spark_pick",
        instruction: "What's your music video about?",
        sparks: [
          { label: "🌅 Sunset beach party", prompt: "colorful beach party at sunset with dancing silhouettes and palm trees" },
          { label: "🏙️ Neon city at night", prompt: "futuristic neon-lit city street at night with flying cars and holograms" },
          { label: "🌌 Space dance", prompt: "astronauts dancing in zero gravity among colorful nebulas and stars" },
          { label: "🌿 Enchanted forest rave", prompt: "magical forest with glowing mushrooms and fairy lights, mystical atmosphere" },
          { label: "✏️ My own scene!", prompt: "" },
        ],
      },
      {
        id: "style",
        type: "style_pick",
        instruction: "Pick the visual vibe!",
        styles: STYLES,
      },
      {
        id: "generate",
        type: "generate",
        instruction: "Creating your music video key frame! 🎬",
        capability: "flux-dev",
      },
      {
        id: "animate",
        type: "animate",
        instruction: "Now let's animate it into a real music video! 🎵",
        capability: "seedance-i2v",
        autoPromptPrefix: "cinematic camera movement, dynamic, music video style, smooth motion, ",
      },
      {
        id: "celebrate",
        type: "celebrate",
        instruction: "Your music video is a hit! 🎵🌟",
      },
    ],
  },

  // ── CREATOR (age 13-16) ─────────────────────────────────────
  {
    id: "short-film",
    title: "Short Film Director",
    description: "Direct a 4-shot short film with real camera directions!",
    icon: "🎬",
    difficulty: "creator",
    category: "video",
    unlockAfter: ["comic-strip", "music-video"],
    maxStars: 3,
    steps: [
      {
        id: "concept",
        type: "text_input",
        instruction: "What's your film about? Describe the story in one sentence.",
        hint: "Think about: Who's the main character? What happens? What's the twist?",
        sparks: [
          { label: "🕵️ Mystery in an old library", prompt: "a detective discovers a glowing book in a dark abandoned library" },
          { label: "🚂 Last train at midnight", prompt: "a lonely traveler on the last train discovers the other passengers are ghosts" },
          { label: "🌊 Message in a bottle", prompt: "a kid finds a bottle on the beach with a map to a hidden island" },
          { label: "✏️ My own film!", prompt: "" },
        ],
      },
      {
        id: "film",
        type: "film_gen",
        instruction: "Generating your 4-shot film with camera directions! 🎬",
        hint: "Each shot gets a specific camera angle — wide, close-up, tracking, reveal.",
        capability: "flux-dev",
      },
      {
        id: "celebrate",
        type: "celebrate",
        instruction: "That's a wrap! Your short film is complete! 🎬🏆",
      },
    ],
  },

  {
    id: "talking-character",
    title: "Voice Actor Studio",
    description: "Create a character and make them talk with YOUR voice!",
    icon: "🗣️",
    difficulty: "creator",
    category: "mixed",
    unlockAfter: ["comic-strip", "music-video"],
    maxStars: 3,
    steps: [
      {
        id: "spark",
        type: "spark_pick",
        instruction: "Who will you bring to life?",
        sparks: [
          { label: "🧙 Wise old wizard", prompt: "a kind elderly wizard with a long white beard, twinkling eyes, and star-covered robes" },
          { label: "🤖 Friendly robot", prompt: "a cute rounded robot with LED eyes and antenna, looking helpful and cheerful" },
          { label: "🧚 Tiny fairy", prompt: "a tiny glowing fairy with translucent wings sitting on a mushroom" },
          { label: "✏️ My own character!", prompt: "" },
        ],
      },
      {
        id: "style",
        type: "style_pick",
        instruction: "Choose the art style for your character!",
        styles: STYLES,
      },
      {
        id: "generate",
        type: "generate",
        instruction: "Creating your character! 🎨",
        capability: "flux-dev",
      },
      {
        id: "narrate",
        type: "narrate",
        instruction: "Now type what your character says — we'll make them talk! 🗣️",
        hint: "Type a short speech (1-2 sentences) — the AI will generate the voice and animate the face!",
        capability: "chatterbox-tts",
      },
      {
        id: "celebrate",
        type: "celebrate",
        instruction: "Your character is alive and talking! 🗣️🎉",
      },
    ],
  },
];

const MISSION_MAP = new Map<string, Mission>(MISSIONS.map((m) => [m.id, m]));

export function getMission(id: string): Mission | undefined {
  return MISSION_MAP.get(id);
}

export { MISSIONS, STYLES };
