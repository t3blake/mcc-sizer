const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { PolicyEngine } = require("./loader");

// ── Download Mode ──

describe("Download Mode policies", () => {
  it("sets LAN mode (1) when P2P enabled with subnet scope", () => {
    const result = PolicyEngine.recommend({
      wiredClients: 100, wirelessClients: 0,
      p2pEnabled: true, p2pScope: "subnet"
    });
    assert.equal(result.policies["DODownloadMode"].value, "1 (LAN)");
    assert.ok(result.policies["DORestrictPeerSelectionBy"]);
  });

  it("sets Group mode (2) with AD site scope", () => {
    const result = PolicyEngine.recommend({
      wiredClients: 100, wirelessClients: 0,
      p2pEnabled: true, p2pScope: "site"
    });
    assert.equal(result.policies["DODownloadMode"].value, "2 (Group)");
    assert.ok(result.policies["DOGroupIDSource"]);
  });

  it("sets Group mode (2) with custom group ID", () => {
    const result = PolicyEngine.recommend({
      wiredClients: 100, wirelessClients: 0,
      p2pEnabled: true, p2pScope: "custom"
    });
    assert.equal(result.policies["DODownloadMode"].value, "2 (Group)");
    assert.ok(result.policies["DOGroupID"]);
  });

  it("sets HTTP Only (0) when P2P disabled", () => {
    const result = PolicyEngine.recommend({
      wiredClients: 100, wirelessClients: 0,
      p2pEnabled: false
    });
    assert.equal(result.policies["DODownloadMode"].value, "0 (HTTP Only)");
  });
});

// ── Cache server policies (always present) ──

describe("Cache server policies", () => {
  it("always includes DOCacheHost", () => {
    const result = PolicyEngine.recommend({
      wiredClients: 50, wirelessClients: 0, p2pEnabled: true, p2pScope: "subnet"
    });
    assert.ok(result.policies["DOCacheHost"]);
  });

  it("always includes foreground and background fallback delays", () => {
    const result = PolicyEngine.recommend({
      wiredClients: 50, wirelessClients: 0, p2pEnabled: true, p2pScope: "subnet"
    });
    assert.ok(result.policies["DelayCacheServerFallbackForeground"]);
    assert.ok(result.policies["DelayCacheServerFallbackBackground"]);
  });
});

// ── VPN policies ──

describe("VPN policies", () => {
  it("adds VPN policies when VPN clients present", () => {
    const result = PolicyEngine.recommend({
      wiredClients: 100, wirelessClients: 0,
      p2pEnabled: true, p2pScope: "subnet",
      hasVpnClients: true
    });
    assert.ok(result.policies["DOAllowVPNPeerCaching"]);
    assert.ok(result.policies["DODisallowCacheServerDownloadsOnVPN"]);
    assert.ok(result.info.some(msg => msg.includes("VPN")));
  });

  it("does not add VPN policies when no VPN clients", () => {
    const result = PolicyEngine.recommend({
      wiredClients: 100, wirelessClients: 0,
      p2pEnabled: true, p2pScope: "subnet",
      hasVpnClients: false
    });
    assert.equal(result.policies["DOAllowVPNPeerCaching"], undefined);
  });
});

// ── Wireless P2P warnings ──

describe("Wireless P2P warnings", () => {
  it("warns about wireless client isolation when P2P + wireless", () => {
    const result = PolicyEngine.recommend({
      wiredClients: 50, wirelessClients: 100,
      p2pEnabled: true, p2pScope: "subnet"
    });
    const warning = result.warnings.find(w => w.type === "wireless-p2p");
    assert.ok(warning);
    assert.ok(warning.message.includes("client isolation"));
  });

  it("warns about wireless-only with P2P", () => {
    const result = PolicyEngine.recommend({
      wiredClients: 0, wirelessClients: 100,
      p2pEnabled: true, p2pScope: "subnet"
    });
    const warning = result.warnings.find(w => w.type === "wireless-only-p2p");
    assert.ok(warning);
  });

  it("no wireless warnings when P2P disabled", () => {
    const result = PolicyEngine.recommend({
      wiredClients: 0, wirelessClients: 100,
      p2pEnabled: false
    });
    assert.ok(!result.warnings.find(w => w.type === "wireless-p2p"));
    assert.ok(!result.warnings.find(w => w.type === "wireless-only-p2p"));
  });

  it("suggests group mode for mixed wired/wireless sites", () => {
    const result = PolicyEngine.recommend({
      wiredClients: 50, wirelessClients: 100,
      p2pEnabled: true, p2pScope: "subnet"
    });
    assert.ok(result.info.some(msg => msg.includes("Group download mode")));
  });
});

// ── Proxy warning ──

describe("Proxy warnings", () => {
  it("warns when proxy is in use", () => {
    const result = PolicyEngine.recommend({
      wiredClients: 100, wirelessClients: 0,
      p2pEnabled: true, p2pScope: "subnet",
      hasProxy: true
    });
    const warning = result.warnings.find(w => w.type === "proxy");
    assert.ok(warning);
    assert.ok(warning.message.includes("proxy"));
  });

  it("no proxy warning when proxy not in use", () => {
    const result = PolicyEngine.recommend({
      wiredClients: 100, wirelessClients: 0,
      p2pEnabled: true, p2pScope: "subnet",
      hasProxy: false
    });
    assert.ok(!result.warnings.find(w => w.type === "proxy"));
  });
});

// ── Multi-node warning ──

describe("Multi-node warnings", () => {
  it("warns for sites with >5000 devices", () => {
    const result = PolicyEngine.recommend({
      wiredClients: 6000, wirelessClients: 0,
      p2pEnabled: true, p2pScope: "subnet"
    });
    const warning = result.warnings.find(w => w.type === "multi-node");
    assert.ok(warning);
    assert.ok(warning.message.includes("2 cache nodes"));
  });

  it("no multi-node warning for <=5000 devices", () => {
    const result = PolicyEngine.recommend({
      wiredClients: 5000, wirelessClients: 0,
      p2pEnabled: true, p2pScope: "subnet"
    });
    assert.ok(!result.warnings.find(w => w.type === "multi-node"));
  });
});

// ── Port 80 info (always present) ──

describe("General warnings", () => {
  it("always includes port 80 info", () => {
    const result = PolicyEngine.recommend({
      wiredClients: 50, wirelessClients: 0,
      p2pEnabled: true, p2pScope: "subnet"
    });
    assert.ok(result.warnings.find(w => w.type === "port80"));
  });
});
