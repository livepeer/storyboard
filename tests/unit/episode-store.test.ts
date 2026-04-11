import { describe, it, expect, beforeEach } from "vitest";
import { useEpisodeStore } from "@/lib/episodes/store";

describe("EpisodeStore", () => {
  beforeEach(() => {
    useEpisodeStore.setState({ episodes: [], activeEpisodeId: null });
  });

  it("creates an episode with name and cardIds", () => {
    const ep = useEpisodeStore.getState().createEpisode("Night Chase", ["1", "2", "3"]);
    expect(ep.name).toBe("Night Chase");
    expect(ep.cardIds).toEqual(["1", "2", "3"]);
    expect(ep.id).toMatch(/^ep_/);
    expect(ep.color).toBeTruthy();
    expect(useEpisodeStore.getState().episodes).toHaveLength(1);
  });

  it("creates episode with context override", () => {
    const ep = useEpisodeStore.getState().createEpisode("Dark Alley", ["4"], { mood: "tense", setting: "city alley" });
    expect(ep.context.mood).toBe("tense");
    expect(ep.context.setting).toBe("city alley");
    expect(ep.context.style).toBeUndefined();
  });

  it("assigns different colors to different episodes", () => {
    const ep1 = useEpisodeStore.getState().createEpisode("Ep1", ["1"]);
    const ep2 = useEpisodeStore.getState().createEpisode("Ep2", ["2"]);
    expect(ep1.color).not.toBe(ep2.color);
  });

  it("activates and deactivates episode", () => {
    const ep = useEpisodeStore.getState().createEpisode("Test", ["1"]);
    useEpisodeStore.getState().activateEpisode(ep.id);
    expect(useEpisodeStore.getState().activeEpisodeId).toBe(ep.id);
    useEpisodeStore.getState().activateEpisode(null);
    expect(useEpisodeStore.getState().activeEpisodeId).toBeNull();
  });

  it("updates episode name and context", () => {
    const ep = useEpisodeStore.getState().createEpisode("Old", ["1"]);
    useEpisodeStore.getState().updateEpisode(ep.id, { name: "New", context: { mood: "joyful" } });
    const updated = useEpisodeStore.getState().getEpisode(ep.id);
    expect(updated?.name).toBe("New");
    expect(updated?.context.mood).toBe("joyful");
  });

  it("adds and removes cards", () => {
    const ep = useEpisodeStore.getState().createEpisode("Test", ["1", "2"]);
    useEpisodeStore.getState().addCards(ep.id, ["3", "4"]);
    expect(useEpisodeStore.getState().getEpisode(ep.id)?.cardIds).toEqual(["1", "2", "3", "4"]);
    useEpisodeStore.getState().removeCards(ep.id, ["2"]);
    expect(useEpisodeStore.getState().getEpisode(ep.id)?.cardIds).toEqual(["1", "3", "4"]);
  });

  it("removes episode and clears activeEpisodeId if active", () => {
    const ep = useEpisodeStore.getState().createEpisode("Test", ["1"]);
    useEpisodeStore.getState().activateEpisode(ep.id);
    useEpisodeStore.getState().removeEpisode(ep.id);
    expect(useEpisodeStore.getState().episodes).toHaveLength(0);
    expect(useEpisodeStore.getState().activeEpisodeId).toBeNull();
  });

  it("getEpisodeForCard finds correct episode", () => {
    useEpisodeStore.getState().createEpisode("A", ["1", "2"]);
    useEpisodeStore.getState().createEpisode("B", ["3", "4"]);
    expect(useEpisodeStore.getState().getEpisodeForCard("3")?.name).toBe("B");
    expect(useEpisodeStore.getState().getEpisodeForCard("99")).toBeUndefined();
  });

  it("getEffectiveContext merges episode over storyboard", () => {
    const ep = useEpisodeStore.getState().createEpisode("Test", ["1"], { mood: "dark" });
    const effective = useEpisodeStore.getState().getEffectiveContext(ep.id, {
      style: "Ghibli", palette: "warm", characters: "girl", setting: "village", rules: "", mood: "joyful",
    });
    expect(effective?.mood).toBe("dark");
    expect(effective?.style).toBe("Ghibli");
    expect(effective?.palette).toBe("warm");
  });

  it("getEffectiveContext returns storyboard when no overrides", () => {
    const ep = useEpisodeStore.getState().createEpisode("Empty", ["1"]);
    const effective = useEpisodeStore.getState().getEffectiveContext(ep.id, {
      style: "Ghibli", palette: "warm", characters: "girl", setting: "village", rules: "", mood: "joyful",
    });
    expect(effective?.mood).toBe("joyful");
  });

  it("deduplicates card IDs on addCards", () => {
    const ep = useEpisodeStore.getState().createEpisode("Test", ["1", "2"]);
    useEpisodeStore.getState().addCards(ep.id, ["2", "3"]);
    expect(useEpisodeStore.getState().getEpisode(ep.id)?.cardIds).toEqual(["1", "2", "3"]);
  });
});
