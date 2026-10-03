import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SummaryCards } from "./SummaryCards";
import type { LocalSummary, SiteSummary } from "../types";

afterEach(() => cleanup());

const localSummary: LocalSummary = {
  trackedPages: 10,
  trackedOrigins: 3,
  totalViews: 500,
  todayViews: 50,
  weekViews: 200,
  uniqueSessions: 120,
  avgTimeOnPage: 180,
  bounceRate: 35,
  totalClicks: 80,
  avgScrollDepth: 65,
  totalInteractions: 200,
  totalJsErrors: 2,
};

const siteSummary: SiteSummary = {
  trackedSites: 5,
  totalViews: 10000,
  totalHits: 15000,
  deltaViews: 250,
  deltaHits: 300,
};

describe("SummaryCards", () => {
  it("renders all card labels", () => {
    render(<SummaryCards localSummary={localSummary} siteSummary={siteSummary} />);
    expect(screen.getByText("Tracked pages")).toBeInTheDocument();
    expect(screen.getByText("Site identities")).toBeInTheDocument();
    expect(screen.getByText("Page views")).toBeInTheDocument();
    expect(screen.getByText("Sessions")).toBeInTheDocument();
    expect(screen.getByText("Orbit views")).toBeInTheDocument();
  });

  it("renders formatted values", () => {
    render(<SummaryCards localSummary={localSummary} siteSummary={siteSummary} />);
    expect(screen.getByText("Bounce rate")).toBeInTheDocument();
    expect(screen.getByText("Avg scroll")).toBeInTheDocument();
  });

  it("renders orbit delta with sign", () => {
    const { container } = render(<SummaryCards localSummary={localSummary} siteSummary={siteSummary} />);
    expect(container.textContent).toContain("+250");
  });
});
