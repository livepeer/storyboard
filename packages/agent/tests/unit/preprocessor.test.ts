import { describe, it, expect } from "vitest";
import { extractProjects } from "../../src/preprocessor/multi-project.js";

const SINGLE_6_SCENE = `
SCENE 1 — TWO WORLDS, ONE LANE
Golden morning. The village wakes slowly.
Visual language: warm saffron light

SCENE 2 — THE FIRST INSULT
Midday. Tank crosses a bridge.
Visual language: dappled noon

SCENE 3 — THE STORM
Evening arrives wrong, sky like a bruise.
Visual language: blue-black palette

SCENE 4 — THE MORNING AFTER
Dawn after the storm.
Visual language: pale gold

SCENE 5 — THE SEASONS PASS
A four-season montage.

SCENE 6 — THE EVENING THEY ALWAYS RETURN TO
Years later, the village at dusk.
`;

const TWO_PROJECTS = SINGLE_6_SCENE + `

SCENE 1 — THE HIGH: The Rooftop Garden
Midsummer. The rooftop garden above the fish market.
Colour: saturated gold

SCENE 2 — THE LOW: The Rain Fight
A cold grey Tuesday. The iron bridge.
Colour: cold blue-grey

SCENE 3 — THE RESOLUTION
Midnight. Luna's apartment.
Colour: warm amber
`;

describe("preprocessor", () => {
  it("single 6-scene brief returns one project with 6 scenes", () => {
    const projects = extractProjects(SINGLE_6_SCENE);
    expect(projects).toHaveLength(1);
    expect(projects[0].scenes).toHaveLength(6);
  });

  it("combined 6+3 brief returns two projects", () => {
    const projects = extractProjects(TWO_PROJECTS);
    expect(projects).toHaveLength(2);
    expect(projects[0].scenes).toHaveLength(6);
    expect(projects[1].scenes).toHaveLength(3);
  });

  it("each project's subText only contains its own scenes", () => {
    const projects = extractProjects(TWO_PROJECTS);
    expect(projects[0].subText).toContain("TWO WORLDS");
    expect(projects[0].subText).not.toContain("Rooftop Garden");
    expect(projects[1].subText).toContain("Rooftop Garden");
    expect(projects[1].subText).not.toContain("TWO WORLDS");
  });

  it("scene prompts skip metadata lines and pick the first content sentence", () => {
    const projects = extractProjects(SINGLE_6_SCENE);
    expect(projects[0].scenes[0].prompt).toContain("Golden morning");
    expect(projects[0].scenes[0].prompt).not.toContain("Visual language");
  });

  it("returns empty array when no scenes detected", () => {
    expect(extractProjects("just plain text, no scenes")).toEqual([]);
  });
});
