import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { DateRangeSelector, ChartToolbar } from "./ChartToolbar";
import type { DateRangeKey } from "../utils";

afterEach(() => cleanup());

describe("DateRangeSelector", () => {
  it("renders all range options", () => {
    render(<DateRangeSelector value="all" onChange={() => {}} />);
    expect(screen.getByText("7d")).toBeInTheDocument();
    expect(screen.getByText("30d")).toBeInTheDocument();
    expect(screen.getByText("90d")).toBeInTheDocument();
    expect(screen.getByText("All")).toBeInTheDocument();
  });

  it("marks active option with aria-pressed", () => {
    render(<DateRangeSelector value="30d" onChange={() => {}} />);
    const active = screen.getByText("30d");
    expect(active).toHaveAttribute("aria-pressed", "true");
  });

  it("calls onChange when clicked", () => {
    let value: DateRangeKey = "all";
    render(<DateRangeSelector value={value} onChange={(v) => { value = v; }} />);
    fireEvent.click(screen.getByText("7d"));
    expect(value).toBe("7d");
  });
});

describe("ChartToolbar", () => {
  it("renders both date range and chart type controls", () => {
    render(
      <ChartToolbar
        dateRange="all"
        onDateRangeChange={() => {}}
        chartType="line"
        onChartTypeChange={() => {}}
      />
    );
    expect(screen.getByText("All")).toBeInTheDocument();
    expect(screen.getByLabelText("Line chart")).toBeInTheDocument();
    expect(screen.getByLabelText("Area chart")).toBeInTheDocument();
  });
});
