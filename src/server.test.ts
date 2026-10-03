import { describe, it, expect } from "vitest";
import { parseTracker, cleanSiteName, cleanSiteNames, isPublicIp, mapWithConcurrency } from "../server";

describe("cleanSiteName", () => {
  it("strips https:// and neocities.org", () => {
    expect(cleanSiteName("https://deffy.neocities.org")).toBe("deffy");
  });

  it("strips www. prefix", () => {
    expect(cleanSiteName("https://www.deffy.me")).toBe("deffy");
  });

  it("handles plain sitename", () => {
    expect(cleanSiteName("deffy")).toBe("deffy");
  });

  it("lowercases", () => {
    expect(cleanSiteName("https://Deffy.neocities.org")).toBe("deffy");
  });

  it("handles empty input", () => {
    expect(cleanSiteName("")).toBe("");
  });

  it("takes first subdomain of multi-part", () => {
    expect(cleanSiteName("https://blog.deffy.me")).toBe("blog");
  });
});

describe("parseTracker", () => {
  it("detects script tag with zya-imprint.js", () => {
    const html = '<script src="zya-imprint.js" defer></script>';
    const result = parseTracker(html);
    expect(result.found).toBe(true);
  });

  it("detects window.ZYA_IMPRINT config", () => {
    const html = '<script>window.ZYA_IMPRINT = { siteId: "deffy" };</script>';
    const result = parseTracker(html);
    expect(result.found).toBe(true);
    expect(result.siteId).toBe("deffy");
  });

  it("extracts data-site-id attribute", () => {
    const html = '<script src="zya-imprint.js" data-site-id="my-site" defer></script>';
    const result = parseTracker(html);
    expect(result.siteId).toBe("my-site");
  });

  it("extracts path from config", () => {
    const html = '<script>window.ZYA_IMPRINT = { siteId: "deffy", page: { path: "/about" } };</script>';
    const result = parseTracker(html);
    expect(result.path).toBe("/about");
  });

  it("extracts label from config", () => {
    const html = '<script>window.ZYA_IMPRINT = { siteId: "deffy", page: { label: "Landing" } };</script>';
    const result = parseTracker(html);
    expect(result.label).toBe("Landing");
  });

  it("detects collector in config", () => {
    const html = '<script>window.ZYA_IMPRINT = { collector: "https://example.com/api" };</script>';
    const result = parseTracker(html);
    expect(result.collector).toBe(true);
  });

  it("returns found=false for no tracker", () => {
    const html = "<html><body>No tracker here</body></html>";
    const result = parseTracker(html);
    expect(result.found).toBe(false);
  });
});

describe("isPublicIp", () => {
  it("rejects localhost", () => {
    expect(isPublicIp("127.0.0.1")).toBe(false);
  });

  it("rejects private 10.x", () => {
    expect(isPublicIp("10.0.0.1")).toBe(false);
  });

  it("rejects private 192.168.x", () => {
    expect(isPublicIp("192.168.1.1")).toBe(false);
  });

  it("rejects 169.254.x (link-local)", () => {
    expect(isPublicIp("169.254.1.1")).toBe(false);
  });

  it("accepts public IP", () => {
    expect(isPublicIp("8.8.8.8")).toBe(true);
  });

  it("rejects IPv6 loopback", () => {
    expect(isPublicIp("::1")).toBe(false);
  });

  it("accepts public IPv6", () => {
    expect(isPublicIp("2606:4700:4700::1111")).toBe(true);
  });
});


describe("cleanSiteNames", () => {
  it("normalizes, deduplicates, validates, and limits batch input", () => {
    expect(cleanSiteNames("Deffy, deffy, bad site, phexotial", 2)).toEqual(["deffy", "phexotial"]);
  });
});

describe("mapWithConcurrency", () => {
  it("preserves input order", async () => {
    const values = await mapWithConcurrency([3, 1, 2], 2, async (value) => {
      await new Promise((resolve) => setTimeout(resolve, value));
      return value * 2;
    });
    expect(values).toEqual([6, 2, 4]);
  });
});
