import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ErrorBoundary } from "./ErrorBoundary";

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => undefined); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function ThrowOnRender({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error("Test explosion");
  return <div data-testid="child">Content</div>;
}

describe("ErrorBoundary", () => {
  it("renders children when no error", () => {
    render(
      <ErrorBoundary label="TestPanel">
        <ThrowOnRender shouldThrow={false} />
      </ErrorBoundary>
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("renders fallback UI on error", () => {
    render(
      <ErrorBoundary label="TestPanel">
        <ThrowOnRender shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText("TestPanel crashed")).toBeInTheDocument();
    expect(screen.getByText("Test explosion")).toBeInTheDocument();
  });

  it("recovers when reload button is clicked", () => {
    const { rerender } = render(
      <ErrorBoundary label="TestPanel">
        <ThrowOnRender shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText("TestPanel crashed")).toBeInTheDocument();
    rerender(
      <ErrorBoundary label="TestPanel">
        <ThrowOnRender shouldThrow={false} />
      </ErrorBoundary>
    );
    fireEvent.click(screen.getByText("Reload panel"));
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });
});
