const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { SizingEngine } = require("./loader");

// ── Verify against the known example from MCC field observations ──
// 15,244 devices, 5 Gbps cache, 500 MB content, 100% simultaneity, 1 node

describe("Peak delivery — field observation example", () => {
  it("matches the 15,244 device / 5 Gbps / 500 MB example", () => {
    const result = SizingEngine.calculatePeakDelivery(
      15244,  // totalDevices
      5,      // cacheGbps (NIC speed)
      500,    // contentPerDeviceMB
      100,    // simultaneityPct (worst case)
      false,  // p2pEnabled
      1       // nodeCount
    );

    // 5 Gbps = 5,000,000 Kbps
    assert.equal(result.totalCacheKbps, 5000000);

    // All devices simultaneous
    assert.equal(result.simultaneousDevices, 15244);

    // 5,000,000 / 15,244 ≈ 328 Kbps (email said ~327, rounding varies)
    assert.ok(result.perDeviceKbps >= 327 && result.perDeviceKbps <= 329,
      `Expected ~328 Kbps, got ${result.perDeviceKbps}`);

    // 500 MB = 4,096,000 Kb. 4,096,000 / 328 ≈ 12,488 seconds ≈ 3:28:08
    // Email said ~3:23:52 (used slightly different rounding)
    // Allow a range of 3:20:00 to 3:30:00 (12000-12600 seconds)
    assert.ok(result.downloadTimeSec >= 12000 && result.downloadTimeSec <= 12600,
      `Expected ~3:24-3:30, got ${result.downloadTimeSec}s (${result.downloadTimeFormatted})`);
  });
});

// ── Simultaneity scaling ──

describe("Peak delivery — simultaneity percentage", () => {
  it("100% means all devices download at once", () => {
    const result = SizingEngine.calculatePeakDelivery(1000, 5, 500, 100, false, 1);
    assert.equal(result.simultaneousDevices, 1000);
  });

  it("50% halves the simultaneous device count", () => {
    const result = SizingEngine.calculatePeakDelivery(1000, 5, 500, 50, false, 1);
    assert.equal(result.simultaneousDevices, 500);
  });

  it("25% quarters the simultaneous device count", () => {
    const result = SizingEngine.calculatePeakDelivery(1000, 5, 500, 25, false, 1);
    assert.equal(result.simultaneousDevices, 250);
  });

  it("lower simultaneity means higher per-device bandwidth", () => {
    const full = SizingEngine.calculatePeakDelivery(1000, 5, 500, 100, false, 1);
    const half = SizingEngine.calculatePeakDelivery(1000, 5, 500, 50, false, 1);
    assert.ok(half.perDeviceKbps > full.perDeviceKbps);
    // Should be exactly 2x
    assert.equal(half.perDeviceKbps, full.perDeviceKbps * 2);
  });

  it("lower simultaneity means shorter download time", () => {
    const full = SizingEngine.calculatePeakDelivery(1000, 5, 500, 100, false, 1);
    const half = SizingEngine.calculatePeakDelivery(1000, 5, 500, 50, false, 1);
    assert.ok(half.downloadTimeSec < full.downloadTimeSec);
  });

  it("treats 0% as 100% (falsy default)", () => {
    const result = SizingEngine.calculatePeakDelivery(1000, 5, 500, 0, false, 1);
    // 0 is falsy so falls back to 100% — this is correct since the UI enforces min=1
    assert.equal(result.simultaneousDevices, 1000);
  });
});

// ── Multi-node scaling ──

describe("Peak delivery — multi-node", () => {
  it("multiple nodes multiply total throughput", () => {
    const single = SizingEngine.calculatePeakDelivery(10000, 10, 500, 100, false, 1);
    const double = SizingEngine.calculatePeakDelivery(10000, 10, 500, 100, false, 2);

    assert.equal(double.totalCacheKbps, single.totalCacheKbps * 2);
    assert.equal(double.perDeviceKbps, single.perDeviceKbps * 2);
  });

  it("3 nodes at 10 Gbps = 30,000,000 Kbps total", () => {
    const result = SizingEngine.calculatePeakDelivery(15000, 10, 500, 100, false, 3);
    assert.equal(result.totalCacheKbps, 30000000);
  });
});

// ── Mitigation messages ──

describe("Peak delivery — mitigation messages", () => {
  it("always includes update ring mitigation", () => {
    const result = SizingEngine.calculatePeakDelivery(1000, 5, 500, 100, false, 1);
    assert.ok(result.mitigations.some(m => m.includes("update rings")));
  });

  it("notes peering is enabled when p2p is on", () => {
    const result = SizingEngine.calculatePeakDelivery(1000, 5, 500, 100, true, 1);
    assert.ok(result.mitigations.some(m => m.includes("peering") && m.includes("enabled")));
  });

  it("suggests enabling peering when p2p is off", () => {
    const result = SizingEngine.calculatePeakDelivery(1000, 5, 500, 100, false, 1);
    assert.ok(result.mitigations.some(m => m.includes("enabling DO peering")));
  });
});

// ── Time formatting ──

describe("Peak delivery — time formatting", () => {
  it("formats as H:MM:SS", () => {
    // Small site, huge bandwidth — should be very fast
    const result = SizingEngine.calculatePeakDelivery(1, 10, 1, 100, false, 1);
    assert.match(result.downloadTimeFormatted, /^\d+:\d{2}:\d{2}$/);
  });
});
