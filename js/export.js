/**
 * Export engine — JSON, CSV, and print-to-PDF support.
 */

const ExportEngine = {
  /**
   * Build a complete results object for export.
   */
  buildExportData(sites, contentTypeIds, results) {
    const selectedContent = contentTypeIds.map(id => {
      const ct = MCC_DATA.contentTypes.find(c => c.id === id);
      return ct ? ct.label : id;
    });

    let totalNodes = 0;
    let totalDevices = 0;

    const siteResults = results.map(r => {
      totalNodes += r.sizing.nodeCount;
      totalDevices += r.sizing.totalDevices;

      const policyList = {};
      for (const [key, val] of Object.entries(r.policies.policies)) {
        policyList[key] = val.value;
      }

      return {
        siteName: r.sizing.siteName,
        wiredClients: r.sizing.wiredClients,
        wirelessClients: r.sizing.wirelessClients,
        totalDevices: r.sizing.totalDevices,
        siteCategory: r.sizing.category.label,
        bandwidthMbps: r.sizing.network.bandwidthMbps,
        cacheNodes: r.sizing.nodeCount,
        cpuCores: r.sizing.hardware.cpuCores,
        ramGB: r.sizing.hardware.ramGB + " GB (" + r.sizing.hardware.ramFreeGB + " GB free min)",
        diskSpace: r.sizing.category.hardware.diskNote,
        nicSpeed: r.sizing.category.hardware.nicNote,
        recommendedOS: r.sizing.os.primary,
        monthlyThroughputGB: r.sizing.network.monthlyThroughputGB,
        estimatedMonthlyContentGB: r.sizing.contentEstimate.totalMonthlyGB,
        peakDelivery: {
          simultaneityPct: r.sizing.peakDelivery.simultaneityPct,
          simultaneousDevices: r.sizing.peakDelivery.simultaneousDevices,
          perDeviceKbps: r.sizing.peakDelivery.perDeviceKbps,
          downloadTime: r.sizing.peakDelivery.downloadTimeFormatted
        },
        policies: policyList,
        warnings: r.policies.warnings.map(w => w.message),
        notes: r.policies.info
      };
    });

    return {
      generatedAt: new Date().toISOString(),
      toolVersion: "1.0.0",
      summary: {
        totalSites: siteResults.length,
        totalDevices,
        totalCacheNodes: totalNodes,
        contentTypesSelected: selectedContent,
        azureCostForMCC: "$0 (Azure resource incurs no cost)"
      },
      sites: siteResults
    };
  },

  /**
   * Export as JSON and trigger download.
   */
  exportJSON(data) {
    const json = JSON.stringify(data, null, 2);
    this._download(json, "mcc-sizing-results.json", "application/json");
  },

  /**
   * Export as CSV and trigger download.
   */
  exportCSV(data) {
    const headers = [
      "Site Name", "Wired Clients", "Wireless Clients", "Total Devices",
      "Site Category", "Bandwidth (Mbps)", "Cache Nodes", "CPU Cores",
      "RAM", "Disk Space", "NIC Speed", "Recommended OS",
      "Monthly Throughput (GB)", "Est. Monthly Content (GB)",
      "Simultaneity %", "Simultaneous Devices", "Per-Device Kbps", "Download Time",
      "Key Policies", "Warnings"
    ];

    const rows = data.sites.map(site => [
      this._csvEscape(site.siteName),
      site.wiredClients,
      site.wirelessClients,
      site.totalDevices,
      this._csvEscape(site.siteCategory),
      site.bandwidthMbps,
      site.cacheNodes,
      site.cpuCores,
      this._csvEscape(site.ramGB),
      this._csvEscape(site.diskSpace),
      this._csvEscape(site.nicSpeed),
      this._csvEscape(site.recommendedOS),
      site.monthlyThroughputGB,
      site.estimatedMonthlyContentGB,
      site.peakDelivery.simultaneityPct,
      site.peakDelivery.simultaneousDevices,
      site.peakDelivery.perDeviceKbps,
      this._csvEscape(site.peakDelivery.downloadTime),
      this._csvEscape(Object.entries(site.policies).map(([k, v]) => k + "=" + v).join("; ")),
      this._csvEscape(site.warnings.join("; "))
    ]);

    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    this._download(csv, "mcc-sizing-results.csv", "text/csv");
  },

  /**
   * Print the results section for PDF export via browser print dialog.
   */
  exportPDF() {
    window.print();
  },

  /**
   * Trigger file download in the browser.
   */
  _download(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  /**
   * Escape a value for CSV.
   */
  _csvEscape(val) {
    if (val == null) return "";
    const str = String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }
};
