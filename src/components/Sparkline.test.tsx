import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { Sparkline } from "./Sparkline";

afterEach(() => cleanup());

describe("Sparkline", () => {
  it("renders empty svg for no values", () => {
    const { container } = render(<Sparkline values={[]} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    expect(svg?.querySelector("path")).toBeNull();
  });

  it("renders path for single value", () => {
    const { container } = render(<Sparkline values={[5]} />);
    const paths = container.querySelectorAll("path");
    expect(paths.length).toBeGreaterThanOrEqual(1);
  });

  it("renders line and area for multiple values", () => {
    const { container } = render(<Sparkline values={[1, 5, 3, 8, 2]} />);
    const paths = container.querySelectorAll("path");
    expect(paths.length).toBeGreaterThanOrEqual(2);
  });

  it("applies custom color", () => {
    const { container } = render(<Sparkline values={[1, 2, 3]} color="#ff0000" />);
    const linePath = container.querySelector("path[stroke]");
    expect(linePath?.getAttribute("stroke")).toBe("#ff0000");
  });
});
