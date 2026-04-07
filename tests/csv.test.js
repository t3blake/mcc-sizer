const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

// Load app.js into a minimal DOM-like context so we can test _parseCSV and _parseCSVLine
let appCode = fs.readFileSync(path.join(__dirname, "..", "js", "app.js"), "utf-8");
appCode = appCode.replace(/^const\s+/gm, "var ");

// Minimal stubs for DOM APIs that app.js references at module level
const context = vm.createContext({
  document: {
    getElementById: () => ({
      addEventListener: () => {},
      querySelectorAll: () => [],
      value: "",
      checked: false,
      innerHTML: "",
      style: {}
    }),
    addEventListener: () => {},
    createElement: (tag) => ({ textContent: "", innerHTML: "", appendChild: () => {}, click: () => {} })
  },
  window: {},
  MCC_DATA: { contentTypes: [] },
  SizingEngine: {},
  PolicyEngine: {},
  ExportEngine: {},
  alert: () => {},
  parseInt,
  parseFloat,
  console,
  Math,
  String,
  FileReader: class {},
  Blob: class {},
  URL: { createObjectURL: () => "", revokeObjectURL: () => {} }
});

vm.runInContext(appCode, context, { filename: "app.js" });
const App = context.App;

// ── _parseCSVLine ──

describe("_parseCSVLine", () => {
  it("parses simple comma-separated values", () => {
    const result = App._parseCSVLine("Seattle,100,200,1000");
    assert.deepEqual(result, ["Seattle", "100", "200", "1000"]);
  });

  it("handles quoted values with commas", () => {
    const result = App._parseCSVLine('"Seattle, WA",100,200,1000');
    assert.deepEqual(result, ["Seattle, WA", "100", "200", "1000"]);
  });

  it("handles escaped quotes inside quoted values", () => {
    const result = App._parseCSVLine('"Site ""Alpha""",100,200,500');
    assert.deepEqual(result, ['Site "Alpha"', "100", "200", "500"]);
  });

  it("handles empty fields", () => {
    const result = App._parseCSVLine("Seattle,,,1000");
    assert.deepEqual(result, ["Seattle", "", "", "1000"]);
  });
});

// ── _parseCSV ──

describe("_parseCSV", () => {
  it("parses a valid CSV with required columns", () => {
    const csv = "SiteName,WiredClients,WirelessClients,BandwidthMbps\nHQ,400,200,1000\nBranch,10,25,100";
    const result = App._parseCSV(csv);
    assert.equal(result.length, 2);
    assert.equal(result[0].SiteName, "HQ");
    assert.equal(result[0].WiredClients, "400");
    assert.equal(result[1].SiteName, "Branch");
  });

  it("returns empty for missing required columns", () => {
    const csv = "Name,Devices\nHQ,400";
    const result = App._parseCSV(csv);
    assert.equal(result.length, 0);
  });

  it("returns empty for header-only CSV", () => {
    const csv = "SiteName,WiredClients,WirelessClients";
    const result = App._parseCSV(csv);
    assert.equal(result.length, 0);
  });

  it("skips comment rows starting with #", () => {
    const csv = "SiteName,WiredClients,WirelessClients\n# This is a comment\nHQ,400,200\n# Another comment\nBranch,10,25";
    const result = App._parseCSV(csv);
    assert.equal(result.length, 2);
    assert.equal(result[0].SiteName, "HQ");
    assert.equal(result[1].SiteName, "Branch");
  });

  it("filters out rows with empty SiteName", () => {
    const csv = "SiteName,WiredClients,WirelessClients\nHQ,400,200\n,,\nBranch,10,25";
    const result = App._parseCSV(csv);
    assert.equal(result.length, 2);
  });

  it("handles optional columns gracefully", () => {
    const csv = "SiteName,WiredClients,WirelessClients,BandwidthMbps,P2P,VPN\nHQ,400,200,1000,yes,no";
    const result = App._parseCSV(csv);
    assert.equal(result.length, 1);
    assert.equal(result[0].P2P, "yes");
    assert.equal(result[0].VPN, "no");
  });

  it("handles Windows-style line endings", () => {
    const csv = "SiteName,WiredClients,WirelessClients\r\nHQ,400,200\r\nBranch,10,25";
    const result = App._parseCSV(csv);
    assert.equal(result.length, 2);
  });

  it("skips blank lines", () => {
    const csv = "SiteName,WiredClients,WirelessClients\n\nHQ,400,200\n\n\nBranch,10,25\n";
    const result = App._parseCSV(csv);
    assert.equal(result.length, 2);
  });
});
