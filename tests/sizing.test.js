const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { MCC_DATA, SizingEngine } = require("./loader");

// ── getSiteCategory ──

describe("getSiteCategory", () => {
  it("returns branch for 0 devices", () => {
    assert.equal(SizingEngine.getSiteCategory(0).id, "branch");
  });

  it("returns branch for 49 devices", () => {
    assert.equal(SizingEngine.getSiteCategory(49).id, "branch");
  });

  it("returns small-medium for 50 devices", () => {
    assert.equal(SizingEngine.getSiteCategory(50).id, "small-medium");
  });

  it("returns small-medium for 499 devices", () => {
    assert.equal(SizingEngine.getSiteCategory(499).id, "small-medium");
  });

  it("returns medium-large for 500 devices", () => {
    assert.equal(SizingEngine.getSiteCategory(500).id, "medium-large");
  });

  it("returns medium-large for 5000 devices", () => {
    assert.equal(SizingEngine.getSiteCategory(5000).id, "medium-large");
  });

  it("returns medium-large as base for >5000 devices", () => {
    assert.equal(SizingEngine.getSiteCategory(10000).id, "medium-large");
  });
});

// ── getNodeCount ──

describe("getNodeCount", () => {
  it("returns 1 for 1 device", () => {
    assert.equal(SizingEngine.getNodeCount(1), 1);
  });

  it("returns 1 for 5000 devices", () => {
    assert.equal(SizingEngine.getNodeCount(5000), 1);
  });

  it("returns 2 for 5001 devices", () => {
    assert.equal(SizingEngine.getNodeCount(5001), 2);
  });

  it("returns 3 for 15000 devices", () => {
    assert.equal(SizingEngine.getNodeCount(15000), 3);
  });

  it("returns 4 for 15244 devices", () => {
    assert.equal(SizingEngine.getNodeCount(15244), 4);
  });
});

// ── estimateMonthlyThroughput ──

describe("estimateMonthlyThroughput", () => {
  it("returns exact match for 1000 Mbps (1 Gbps)", () => {
    assert.equal(SizingEngine.estimateMonthlyThroughput(1000), 3600);
  });

  it("returns exact match for 5000 Mbps (5 Gbps)", () => {
    assert.equal(SizingEngine.estimateMonthlyThroughput(5000), 18000);
  });

  it("returns 0 for 0 Mbps", () => {
    assert.equal(SizingEngine.estimateMonthlyThroughput(0), 0);
  });

  it("scales below minimum (25 Mbps = half of 50 Mbps)", () => {
    const result = SizingEngine.estimateMonthlyThroughput(25);
    assert.equal(result, 90); // 25/50 * 180 = 90
  });

  it("interpolates between 1 Gbps and 3 Gbps", () => {
    const result = SizingEngine.estimateMonthlyThroughput(2000); // 2 Gbps
    // 1 Gbps = 3600, 3 Gbps = 10800. Midpoint = 7200
    assert.equal(result, 7200);
  });

  it("extrapolates above maximum (18 Gbps = 2x 9 Gbps)", () => {
    const result = SizingEngine.estimateMonthlyThroughput(18000);
    assert.equal(result, 64800); // 2 * 32400
  });
});

// ── estimateContentPerDevice ──

describe("estimateContentPerDevice", () => {
  it("returns 0 for no content types", () => {
    assert.equal(SizingEngine.estimateContentPerDevice([]), 0);
  });

  it("returns correct value for single content type", () => {
    assert.equal(SizingEngine.estimateContentPerDevice(["windows-updates"]), 500);
  });

  it("sums multiple content types", () => {
    const result = SizingEngine.estimateContentPerDevice(["windows-updates", "m365-apps", "defender"]);
    assert.equal(result, 500 + 300 + 150);
  });

  it("ignores unknown content type IDs", () => {
    assert.equal(SizingEngine.estimateContentPerDevice(["nonexistent"]), 0);
  });
});

// ── recommendOS ──

describe("recommendOS", () => {
  const branch = MCC_DATA.siteCategories[0];
  const medium = MCC_DATA.siteCategories[2];

  it("recommends Windows 11 for branch + windows preference", () => {
    const os = SizingEngine.recommendOS(branch, "windows");
    assert.ok(os.primary.includes("Windows 11"));
  });

  it("recommends Ubuntu for linux preference", () => {
    const os = SizingEngine.recommendOS(medium, "linux");
    assert.ok(os.primary.includes("Ubuntu"));
    assert.equal(os.warnings.length, 0);
  });

  it("recommends Ubuntu or Windows for no-preference at medium site", () => {
    const os = SizingEngine.recommendOS(medium, "no-preference");
    assert.ok(os.primary.includes("Ubuntu"));
  });

  it("includes WSL warning for Windows Server", () => {
    const os = SizingEngine.recommendOS(medium, "windows");
    assert.ok(os.warnings.some(w => w.includes("WSL")));
  });
});

// ── sizeSite (integration) ──

describe("sizeSite", () => {
  it("returns complete result for a basic site", () => {
    const site = {
      name: "Test Site",
      wiredClients: 200,
      wirelessClients: 100,
      bandwidthMbps: 1000,
      preferredOS: "no-preference",
      p2pEnabled: true,
      simultaneityPct: 100
    };
    const result = SizingEngine.sizeSite(site, ["windows-updates", "defender"]);

    assert.equal(result.siteName, "Test Site");
    assert.equal(result.totalDevices, 300);
    assert.equal(result.category.id, "small-medium");
    assert.equal(result.nodeCount, 1);
    assert.equal(result.hardware.cpuCores, 8);
    assert.equal(result.hardware.ramGB, 16);
    assert.equal(result.network.bandwidthMbps, 1000);
    assert.equal(result.network.monthlyThroughputGB, 3600);
    assert.ok(result.peakDelivery);
    assert.ok(result.peakDelivery.downloadTimeFormatted);
  });

  it("scales to multiple nodes for large sites", () => {
    const site = {
      name: "Large Site",
      wiredClients: 12000,
      wirelessClients: 3000,
      bandwidthMbps: 5000
    };
    const result = SizingEngine.sizeSite(site, ["windows-updates"]);

    assert.equal(result.totalDevices, 15000);
    assert.equal(result.nodeCount, 3);
    assert.equal(result.hardware.totalCpuCores, 48); // 16 * 3
    assert.equal(result.hardware.totalRamGB, 96);     // 32 * 3
  });
});
