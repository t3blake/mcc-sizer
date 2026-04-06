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
  recommendOS(siteCategory, preference) {
    if (preference === "linux") {
      return {
        primary: "Ubuntu 24.04",
        note: "Recommended Linux option — no WSL/Hyper-V dependencies.",
        warnings: []
      };
    }

    if (preference === "windows" || preference === "no-preference") {
      if (siteCategory.id === "branch") {
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
   * Calculate peak concurrent delivery scenario.
   *
   * Models the worst-case where devices download simultaneously from the cache
   * node, based on field observations and deployment experience:
   *   - Cache throughput (Gbps from NIC spec) is shared across all active devices
   *   - Per-device bandwidth = cache throughput / simultaneous device count
   *   - Download time = content size per device / per-device bandwidth
   *
   * Mitigations:
   *   - Update rings stagger downloads so not all devices pull at once
   *   - Peer-to-peer (DO peering) offloads the cache node further
   *
   * @param {number} totalDevices      Total device count at the site
   * @param {number} cacheGbps         Sustained cache delivery rate (NIC Gbps)
   * @param {number} contentPerDeviceMB Daily or per-cycle content per device (MB)
   * @param {number} simultaneityPct   % of devices downloading at the same time (1-100)
   * @param {boolean} p2pEnabled       Whether peering is enabled at this site
   * @param {number} nodeCount         Number of cache nodes
   */
  calculatePeakDelivery(totalDevices, cacheGbps, contentPerDeviceMB, simultaneityPct, p2pEnabled, nodeCount) {
    const simultaneityFactor = Math.max(1, Math.min(100, simultaneityPct || 100)) / 100;
    const simultaneousDevices = Math.max(1, Math.ceil(totalDevices * simultaneityFactor));

    // Total sustained throughput across all cache nodes in Kbps
    const totalCacheKbps = cacheGbps * nodeCount * 1_000_000;

    // Per-device bandwidth when all simultaneous devices are pulling content
    const perDeviceKbps = totalCacheKbps / simultaneousDevices;

    // Content size in Kb
    const contentKb = contentPerDeviceMB * 8 * 1024; // MB → Kb

    // Download time in seconds
    const downloadTimeSec = perDeviceKbps > 0 ? contentKb / perDeviceKbps : 0;

    // Format as HH:MM:SS
    const hours = Math.floor(downloadTimeSec / 3600);
    const minutes = Math.floor((downloadTimeSec % 3600) / 60);
    const seconds = Math.floor(downloadTimeSec % 60);
    const downloadTimeFormatted = `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

    // Build insight messages explaining the math
    const insights = [];

    insights.push(
      `Cache throughput: ${cacheGbps} Gbps${nodeCount > 1 ? ` × ${nodeCount} nodes` : ""} = ${totalCacheKbps.toLocaleString()} Kbps total`
    );

    if (simultaneityPct < 100) {
      insights.push(
        `Simultaneous devices: ${simultaneousDevices.toLocaleString()} of ${totalDevices.toLocaleString()} (${simultaneityPct}%)`
      );
    } else {
      insights.push(
        `Worst case: all ${totalDevices.toLocaleString()} devices downloading at the same time`
      );
    }

    insights.push(
      `Per-device bandwidth: ${totalCacheKbps.toLocaleString()} Kbps ÷ ${simultaneousDevices.toLocaleString()} = ~${Math.round(perDeviceKbps).toLocaleString()} Kbps`
    );

    insights.push(
      `Time to deliver ${contentPerDeviceMB.toLocaleString()} MB @ ~${Math.round(perDeviceKbps).toLocaleString()} Kbps = ${downloadTimeFormatted}`
    );

    // Mitigation notes
    const mitigations = [];
    mitigations.push(
      "Configure update rings to stagger downloads across the fleet — reduces the number of devices pulling content at the same time."
    );
    if (p2pEnabled) {
      mitigations.push(
        "Peer-to-peer (Delivery Optimization peering) is enabled — devices can source content from each other, further offloading the cache node."
      );
    } else {
      mitigations.push(
        "Peer-to-peer is disabled — enabling DO peering would let devices source content from each other and reduce cache node load."
      );
    }

    return {
      simultaneousDevices,
      simultaneityPct: simultaneityPct || 100,
      totalCacheKbps,
      perDeviceKbps: Math.round(perDeviceKbps),
      contentPerDeviceMB,
      downloadTimeSec: Math.round(downloadTimeSec),
      downloadTimeFormatted,
      insights,
      mitigations
    };
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
    const osRecommendation = this.recommendOS(category, site.preferredOS || "no-preference");

    // Peak delivery analysis — uses daily content estimate (monthly / 30)
    const dailyContentPerDeviceMB = Math.round(contentPerDevice / 30) || 1;
    const peakDelivery = this.calculatePeakDelivery(
      totalDevices,
      category.hardware.nicGbps,
      dailyContentPerDeviceMB,
      site.simultaneityPct || 100,
      site.p2pEnabled !== false,
      nodeCount
    );

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
      },
      peakDelivery
    };
  }
};
