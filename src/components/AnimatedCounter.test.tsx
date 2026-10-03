import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { AnimatedCounter } from "./AnimatedCounter";

afterEach(() => cleanup());

describe("AnimatedCounter", () => {
  it("renders string value as-is", () => {
    render(<AnimatedCounter value="100%" />);
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("applies className", () => {
    render(<AnimatedCounter value={5} className="text-pink-300" />);
    const el = screen.getByText("0");
    expect(el).toHaveClass("text-pink-300");
  });

  it("uses custom formatFn", () => {
    render(<AnimatedCounter value={1000} formatFn={(n) => `${n} views`} />);
    expect(screen.getByText("0 views")).toBeInTheDocument();
  });
});
