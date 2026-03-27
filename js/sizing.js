/**
 * Sizing engine — maps site inputs to hardware recommendations
 * based on Microsoft Learn guidance.
 */

const SizingEngine = {
  /**
   * Determine site category based on total device count.
   */
  getSiteCategory(totalDevices) {
    for (const cat of MCC_DATA.siteCategories) {
      if (totalDevices >= cat.minDevices && totalDevices <= cat.maxDevices) {
        return cat;
      }
    }
    // Over 5000 — use medium-large as base and calculate node count
    return MCC_DATA.siteCategories[2]; // medium-large
  },

  /**
   * Calculate number of cache nodes needed.
   */
  getNodeCount(totalDevices) {
    if (totalDevices <= 5000) return 1;
    return Math.ceil(totalDevices / 5000);
  },

  /**
   * Estimate monthly cacheable content based on bandwidth.
   */
  estimateMonthlyThroughput(bandwidthMbps) {
    const bandwidthGbps = bandwidthMbps / 1000;
    const table = MCC_DATA.bandwidthThroughput;

    // Exact match
    const exact = table.find(r => r.peakGbps === bandwidthGbps);
    if (exact) return exact.monthlyGB;

    // Below minimum
    if (bandwidthGbps < table[0].peakGbps) {
      return Math.round(bandwidthGbps / table[0].peakGbps * table[0].monthlyGB);
    }

    // Above maximum
    if (bandwidthGbps > table[table.length - 1].peakGbps) {
      const ratio = bandwidthGbps / table[table.length - 1].peakGbps;
      return Math.round(table[table.length - 1].monthlyGB * ratio);
    }

    // Interpolate
    for (let i = 0; i < table.length - 1; i++) {
      if (bandwidthGbps >= table[i].peakGbps && bandwidthGbps <= table[i + 1].peakGbps) {
        const range = table[i + 1].peakGbps - table[i].peakGbps;
        const fraction = (bandwidthGbps - table[i].peakGbps) / range;
        const gbRange = table[i + 1].monthlyGB - table[i].monthlyGB;
        return Math.round(table[i].monthlyGB + fraction * gbRange);
      }
    }

    return 0;
  },

  /**
   * Estimate monthly content volume per device based on selected content types.
   */
  estimateContentPerDevice(contentTypeIds) {
    let totalMB = 0;
    for (const id of contentTypeIds) {
      const ct = MCC_DATA.contentTypes.find(c => c.id === id);
      if (ct) totalMB += ct.avgMonthlyMBPerDevice;
    }
    return totalMB;
  },

  /**
   * Recommend OS based on site category and user preference.
   */
  recommendOS(siteCategory, preference, hasExistingServer) {
    if (preference === "linux") {
      return {
        primary: "Ubuntu 24.04",
        note: "Recommended Linux option — no WSL/Hyper-V dependencies.",
        warnings: []
      };
    }

    if (preference === "windows" || preference === "no-preference") {
      if (siteCategory.id === "branch" && !hasExistingServer) {
        return {
          primary: "Windows 11 (Build 22631.3296+)",
          note: "Can deploy directly to a client device at branch sites.",
          warnings: [
            "Requires WSL 2 (wsl.exe --install --no-distribution)",
            "Requires Hyper-V PowerShell Management Tools during deployment"
          ]
        };
      }

      if (preference === "no-preference") {
        return {
          primary: "Ubuntu 24.04 (recommended) or Windows Server 2022+",
          note: "Linux has fewer dependencies; Windows requires WSL 2 + Hyper-V tools.",
          warnings: []
        };
      }

      return {
        primary: "Windows Server 2022 (Build 20348.2227+) or later",
        note: "Requires WSL 2 and Hyper-V PowerShell Management Tools.",
        warnings: [
          "Requires WSL 2 (wsl.exe --install --no-distribution)",
          "Requires Hyper-V PowerShell Management Tools during deployment",
          "Nested virtualization must be supported — check BIOS settings",
          "Azure VMs: 'Trusted Launch' must be disabled"
        ]
      };
    }

    return { primary: "Ubuntu 24.04", note: "", warnings: [] };
  },

  /**
   * Generate complete sizing recommendation for a single site.
   */
  sizeSite(site, contentTypeIds) {
    const totalDevices = (site.wiredClients || 0) + (site.wirelessClients || 0);
    const category = this.getSiteCategory(totalDevices);
    const nodeCount = this.getNodeCount(totalDevices);
    const monthlyThroughput = this.estimateMonthlyThroughput(site.bandwidthMbps || 0);
    const contentPerDevice = this.estimateContentPerDevice(contentTypeIds);
    const totalMonthlyContentGB = Math.round(totalDevices * contentPerDevice / 1024);
    const osRecommendation = this.recommendOS(category, site.preferredOS || "no-preference", site.hasExistingServer);

    return {
      siteName: site.name || "Unnamed Site",
      wiredClients: site.wiredClients || 0,
      wirelessClients: site.wirelessClients || 0,
      totalDevices,
      category,
      nodeCount,
      hardware: {
        ...category.hardware,
        // Scale for multi-node
        totalCpuCores: category.hardware.cpuCores * nodeCount,
        totalRamGB: category.hardware.ramGB * nodeCount,
        nodesNote: nodeCount > 1
          ? `${nodeCount} cache nodes recommended (each serving up to 5,000 devices)`
          : "1 cache node"
      },
      network: {
        bandwidthMbps: site.bandwidthMbps || 0,
        monthlyThroughputGB: monthlyThroughput,
        nicGbps: category.hardware.nicGbps
      },
      os: osRecommendation,
      contentEstimate: {
        perDeviceMB: contentPerDevice,
        totalMonthlyGB: totalMonthlyContentGB,
        throughputCapacityGB: monthlyThroughput,
        utilizationPercent: monthlyThroughput > 0
          ? Math.min(100, Math.round(totalMonthlyContentGB / monthlyThroughput * 100))
          : 0
      }
    };
  }
};
