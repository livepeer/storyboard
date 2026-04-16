import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { Splash } from "../../../src/cli/splash.js";

describe("Splash", () => {
  it("renders the livepeer wordmark and version", () => {
    const { lastFrame } = render(<Splash version="1.0.0" />);
    expect(lastFrame()).toContain("livepeer");
    expect(lastFrame()).toContain("1.0.0");
  });
});
