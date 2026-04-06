/**
 * Application UI logic — form management, rendering, event handling.
 */

const App = {
  siteCounter: 0,
  results: [],

  init() {
    this.addSite(); // Start with one site
    this.bindEvents();
    this.initContentDefaults();
  },

  bindEvents() {
    document.getElementById("add-site-btn").addEventListener("click", () => this.addSite());
    document.getElementById("calculate-btn").addEventListener("click", () => this.calculate());
    document.getElementById("export-json-btn").addEventListener("click", () => this.export("json"));
    document.getElementById("export-csv-btn").addEventListener("click", () => this.export("csv"));
    document.getElementById("csv-upload-input").addEventListener("change", (e) => this.importCSV(e));
    document.getElementById("download-template-btn").addEventListener("click", (e) => { e.preventDefault(); this.downloadTemplate(); });
  },

  initContentDefaults() {
    MCC_DATA.contentTypes.forEach(ct => {
      const cb = document.getElementById("content-" + ct.id);
      if (cb) cb.checked = ct.defaultOn;
    });
  },

  /**
   * Add a new site input form.
   */
  addSite() {
    this.siteCounter++;
    const id = this.siteCounter;
    const container = document.getElementById("sites-container");

    // Copy values from the last site if one exists
    const prev = this._getLastSiteValues();

    const siteDiv = document.createElement("div");
    siteDiv.className = "site-card";
    siteDiv.id = "site-" + id;
    siteDiv.innerHTML = `
      <div class="site-card-header">
        <h3>Site #${id}</h3>
        ${id > 1 ? `<button type="button" class="btn-remove" onclick="App.removeSite(${id})" title="Remove site">&times;</button>` : ""}
      </div>

      <div class="form-grid">
        <div class="form-group">
          <label for="site-${id}-name">Site Name</label>
          <input type="text" id="site-${id}-name" placeholder="e.g., Seattle HQ" />
        </div>

        <div class="form-group">
          <label for="site-${id}-wired">Wired Clients</label>
          <input type="number" id="site-${id}-wired" min="0" value="0" />
        </div>

        <div class="form-group">
          <label for="site-${id}-wireless">Wireless Clients</label>
          <input type="number" id="site-${id}-wireless" min="0" value="0" />
        </div>

        <div class="form-group">
          <label for="site-${id}-bandwidth">Internet Bandwidth (Mbps) <span class="label-hint" data-tooltip="Total internet bandwidth available at this site. Used to estimate monthly cacheable content throughput.">?</span></label>
          <input type="number" id="site-${id}-bandwidth" min="1" value="${prev.bandwidth}" />
        </div>

        <div class="form-group">
          <label for="site-${id}-p2p">Allow Peer-to-Peer? <span class="label-hint" data-tooltip="Whether devices at this site can share downloaded content with each other via Delivery Optimization peering, reducing cache node and WAN load.">?</span></label>
          <select id="site-${id}-p2p" onchange="App.toggleP2PScope(${id})">
            <option value="yes" ${prev.p2p === "yes" ? "selected" : ""}>Yes</option>
            <option value="no" ${prev.p2p === "no" ? "selected" : ""}>No</option>
          </select>
        </div>

        <div class="form-group" id="site-${id}-p2p-scope-group">
          <label for="site-${id}-p2p-scope">P2P Scope <span class="label-hint" data-tooltip="Controls which devices can peer with each other. Same Subnet = devices sharing a subnet. Same AD Site = devices in the same Active Directory site. Custom Group ID = manually defined group.">?</span></label>
          <select id="site-${id}-p2p-scope">
            <option value="subnet" ${prev.p2pScope === "subnet" ? "selected" : ""}>Same Subnet</option>
            <option value="site" ${prev.p2pScope === "site" ? "selected" : ""}>Same AD Site</option>
            <option value="custom" ${prev.p2pScope === "custom" ? "selected" : ""}>Custom Group ID</option>
          </select>
        </div>

        <div class="form-group">
          <label for="site-${id}-os">Preferred Cache Host OS <span class="label-hint" data-tooltip="The OS for the cache node server. Linux (Ubuntu 24.04) has fewer dependencies. Windows requires WSL 2 and Hyper-V PowerShell tools.">?</span></label>
          <select id="site-${id}-os">
            <option value="no-preference" ${prev.os === "no-preference" ? "selected" : ""}>No Preference</option>
            <option value="windows" ${prev.os === "windows" ? "selected" : ""}>Windows</option>
            <option value="linux" ${prev.os === "linux" ? "selected" : ""}>Linux</option>
          </select>
        </div>

        <div class="form-group">
          <label for="site-${id}-vpn">VPN Clients at This Site? <span class="label-hint" data-tooltip="If devices connect over VPN, P2P peering may not work effectively since VPN clients often don't share a LAN with on-site devices.">?</span></label>
          <select id="site-${id}-vpn">
            <option value="no" ${prev.vpn === "no" ? "selected" : ""}>No</option>
            <option value="yes" ${prev.vpn === "yes" ? "selected" : ""}>Yes</option>
          </select>
        </div>

        <div class="form-group">
          <label for="site-${id}-proxy">Proxy in Use? <span class="label-hint" data-tooltip="Proxies can interfere with MCC traffic. If a proxy is in use, byte-range requests must be allowed and the cache node hostname should be added to the proxy allow list.">?</span></label>
          <select id="site-${id}-proxy">
            <option value="no" ${prev.proxy === "no" ? "selected" : ""}>No</option>
            <option value="yes" ${prev.proxy === "yes" ? "selected" : ""}>Yes</option>
          </select>
        </div>

        <div class="form-group">
          <label for="site-${id}-simultaneity">Simultaneous Download % <span class="label-hint" data-tooltip="Percentage of devices expected to download at the same time. Defaults to 100% (worst-case). Adjust based on your update ring configuration — e.g., 4 rings with staggered schedules might mean ~25%.">?</span></label>
          <input type="number" id="site-${id}-simultaneity" min="1" max="100" value="${prev.simultaneity}" />
        </div>
      </div>
    `;

    container.appendChild(siteDiv);

    // Apply P2P scope visibility based on copied value
    this.toggleP2PScope(id);
  },

  /**
   * Remove a site input form.
   */
  removeSite(id) {
    const el = document.getElementById("site-" + id);
    if (el) el.remove();
  },

  /**
   * Toggle P2P scope visibility.
   */
  toggleP2PScope(id) {
    const p2pVal = document.getElementById("site-" + id + "-p2p").value;
    const scopeGroup = document.getElementById("site-" + id + "-p2p-scope-group");
    scopeGroup.style.display = p2pVal === "yes" ? "" : "none";
  },

  /**
   * Gather selected content types.
   */
  getSelectedContentTypes() {
    return MCC_DATA.contentTypes
      .filter(ct => {
        const cb = document.getElementById("content-" + ct.id);
        return cb && cb.checked;
      })
      .map(ct => ct.id);
  },

  /**
   * Gather all site inputs.
   */
  gatherSites() {
    const sites = [];
    const container = document.getElementById("sites-container");
    const cards = container.querySelectorAll(".site-card");

    cards.forEach(card => {
      const id = card.id.replace("site-", "");
      sites.push({
        name: document.getElementById("site-" + id + "-name").value || "Site " + id,
        wiredClients: parseInt(document.getElementById("site-" + id + "-wired").value) || 0,
        wirelessClients: parseInt(document.getElementById("site-" + id + "-wireless").value) || 0,
        bandwidthMbps: parseInt(document.getElementById("site-" + id + "-bandwidth").value) || 0,
        p2pEnabled: document.getElementById("site-" + id + "-p2p").value === "yes",
        p2pScope: document.getElementById("site-" + id + "-p2p-scope").value,
        preferredOS: document.getElementById("site-" + id + "-os").value,
        hasVpnClients: document.getElementById("site-" + id + "-vpn").value === "yes",
        hasProxy: document.getElementById("site-" + id + "-proxy").value === "yes",
        simultaneityPct: parseInt(document.getElementById("site-" + id + "-simultaneity").value) || 100
      });
    });

    return sites;
  },

  /**
   * Run the sizing calculation and render results.
   */
  calculate() {
    const sites = this.gatherSites();
    const contentTypeIds = this.getSelectedContentTypes();

    if (sites.length === 0) {
      alert("Please add at least one site.");
      return;
    }

    // Validate
    for (const site of sites) {
      if (site.wiredClients + site.wirelessClients === 0) {
        alert(`"${site.name}" has 0 total clients. Please enter at least one wired or wireless client.`);
        return;
      }
    }

    this.results = sites.map(site => ({
      sizing: SizingEngine.sizeSite(site, contentTypeIds),
      policies: PolicyEngine.recommend(site)
    }));

    this.renderResults(this.results, sites, contentTypeIds);
  },

  /**
   * Render results to the page.
   */
  renderResults(results, sites, contentTypeIds) {
    const container = document.getElementById("results-container");
    const exportBar = document.getElementById("export-bar");
    const summarySection = document.getElementById("summary-section");

    let totalNodes = 0;
    let totalDevices = 0;

    let html = "";

    results.forEach((r, i) => {
      const s = r.sizing;
      const p = r.policies;
      totalNodes += s.nodeCount;
      totalDevices += s.totalDevices;

      html += `
        <div class="result-card">
          <div class="result-card-header">
            <h3>${this._escapeHtml(s.siteName)}</h3>
            <span class="badge">${s.wiredClients} wired, ${s.wirelessClients} wireless — ${s.totalDevices} total</span>
          </div>

          <div class="result-category">
            <strong>Site Category:</strong> ${s.category.label}
            <span class="category-desc">${s.category.description}</span>
          </div>

          <div class="result-section">
            <h4>Cache Node Server Specs</h4>
            <table class="spec-table">
              <tr><td>CPU</td><td>${s.hardware.cpuCores} cores${s.nodeCount > 1 ? " (per node)" : ""}</td></tr>
              <tr><td>RAM</td><td>${s.hardware.ramGB} GB (${s.hardware.ramFreeGB} GB free minimum)</td></tr>
              <tr><td>Disk</td><td>${s.category.hardware.diskNote}</td></tr>
              <tr><td>NIC</td><td>${s.category.hardware.nicNote} (SR-IOV recommended)</td></tr>
              <tr><td>OS</td><td>${this._escapeHtml(s.os.primary)}</td></tr>
              <tr><td>Nodes</td><td>${s.hardware.nodesNote}</td></tr>
            </table>
            ${s.os.note ? `<p class="os-note">${this._escapeHtml(s.os.note)}</p>` : ""}
          </div>

          <div class="result-section">
            <h4>Estimated Throughput</h4>
            <table class="spec-table">
              <tr><td>Site Bandwidth</td><td>${s.network.bandwidthMbps.toLocaleString()} Mbps</td></tr>
              <tr><td>Monthly Cacheable Content Capacity</td><td>~${s.network.monthlyThroughputGB.toLocaleString()} GB/month <span class="source-tag">MS Learn</span></td></tr>
              <tr><td>Estimated Monthly Client Demand*</td><td>~${s.contentEstimate.totalMonthlyGB.toLocaleString()} GB/month</td></tr>
              <tr><td>Cache Utilization*</td><td>${s.contentEstimate.utilizationPercent}%</td></tr>
            </table>
            <p class="estimate-disclaimer">* Client demand and utilization are estimates based on assumed per-device content sizes, not official Microsoft figures. See <a href="#methodology">Methodology</a> for details.</p>
          </div>

          <div class="result-section">
            <h4>Peak Delivery Analysis <span class="source-tag source-tag-assumption">Scenario</span></h4>
            <p class="peak-intro">What happens when devices download at the same time? This models cache throughput shared across simultaneous clients — based on <a href="#methodology-peak">field observations</a>.</p>
            <table class="spec-table">
              <tr><td>Cache Sustained Throughput</td><td>${s.network.nicGbps} Gbps${s.nodeCount > 1 ? " × " + s.nodeCount + " nodes" : ""}</td></tr>
              <tr><td>Simultaneous Devices</td><td>${s.peakDelivery.simultaneousDevices.toLocaleString()} of ${s.totalDevices.toLocaleString()} (${s.peakDelivery.simultaneityPct}%)</td></tr>
              <tr><td>Per-Device Bandwidth</td><td>~${s.peakDelivery.perDeviceKbps.toLocaleString()} Kbps</td></tr>
              <tr><td>Daily Content per Device</td><td>~${s.peakDelivery.contentPerDeviceMB.toLocaleString()} MB</td></tr>
              <tr><td>Download Time per Device</td><td>${s.peakDelivery.downloadTimeFormatted}</td></tr>
            </table>
            <div class="peak-walkthrough">
              <strong>How this is calculated:</strong>
              <ol>
                ${s.peakDelivery.insights.map(i => `<li>${this._escapeHtml(i)}</li>`).join("")}
              </ol>
            </div>
            <div class="peak-mitigations">
              <strong>Mitigations:</strong>
              <ul>
                ${s.peakDelivery.mitigations.map(m => `<li>${this._escapeHtml(m)}</li>`).join("")}
              </ul>
            </div>
          </div>

          <div class="result-section">
            <h4>Delivery Optimization Policies</h4>
            <table class="policy-table">
              <tr><th>Policy</th><th>Value</th><th>Description</th></tr>
              ${Object.entries(p.policies).map(([key, val]) =>
                `<tr><td><code>${key}</code></td><td>${this._escapeHtml(val.value)}</td><td>${this._escapeHtml(val.description)}</td></tr>`
              ).join("")}
            </table>
          </div>

          ${p.warnings.length > 0 ? `
          <div class="result-section">
            <h4>Warnings &amp; Notes</h4>
            ${p.warnings.map(w => `
              <div class="alert alert-${w.severity}">
                <span class="alert-icon">${w.severity === "warning" ? "⚠" : "ℹ"}</span>
                <span>${this._escapeHtml(w.message)}</span>
              </div>
            `).join("")}
          </div>
          ` : ""}

          ${p.info.length > 0 ? `
          <div class="result-section">
            ${p.info.map(msg => `
              <div class="alert alert-info">
                <span class="alert-icon">ℹ</span>
                <span>${this._escapeHtml(msg)}</span>
              </div>
            `).join("")}
          </div>
          ` : ""}

          ${s.os.warnings.length > 0 ? `
          <div class="result-section">
            <h4>OS Deployment Notes</h4>
            <ul>
              ${s.os.warnings.map(w => `<li>${this._escapeHtml(w)}</li>`).join("")}
            </ul>
          </div>
          ` : ""}
        </div>
      `;
    });

    container.innerHTML = html;

    // Organization summary
    const selectedContent = contentTypeIds.map(id => {
      const ct = MCC_DATA.contentTypes.find(c => c.id === id);
      return ct ? ct.label : id;
    });

    summarySection.innerHTML = `
      <h3>Organization Summary</h3>
      <table class="spec-table summary-table">
        <tr><td>Total Sites</td><td>${results.length}</td></tr>
        <tr><td>Total Devices</td><td>${totalDevices.toLocaleString()}</td></tr>
        <tr><td>Total Cache Nodes Needed</td><td>${totalNodes}</td></tr>
        <tr><td>Content Types</td><td>${selectedContent.join(", ")}</td></tr>
        <tr><td>Azure Cost for MCC</td><td><strong>$0</strong> (Azure resource incurs no cost)</td></tr>
      </table>
      <div class="general-requirements">
        <h4>General Requirements (All Sites)</h4>
        <ul>
          ${MCC_DATA.generalRequirements.map(r => `<li>${this._escapeHtml(r)}</li>`).join("")}
        </ul>
      </div>
    `;

    // Show sections
    document.getElementById("results-section").style.display = "block";
    exportBar.style.display = "flex";

    // Scroll to results
    document.getElementById("results-section").scrollIntoView({ behavior: "smooth" });
  },

  /**
   * Handle export button clicks.
   */
  export(format) {
    const sites = this.gatherSites();
    const contentTypeIds = this.getSelectedContentTypes();
    const data = ExportEngine.buildExportData(sites, contentTypeIds, this.results);

    switch (format) {
      case "json": ExportEngine.exportJSON(data); break;
      case "csv": ExportEngine.exportCSV(data); break;
    }
  },

  /**
   * Import sites from a CSV file.
   */
  importCSV(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const sites = this._parseCSV(text);

      if (sites.length === 0) {
        alert("No valid site data found in the CSV. Expected columns: SiteName, WiredClients, WirelessClients, BandwidthMbps");
        return;
      }

      // Clear existing sites
      document.getElementById("sites-container").innerHTML = "";
      this.siteCounter = 0;

      // Add a site card for each imported row
      sites.forEach(site => {
        this.addSite();
        const id = this.siteCounter;
        document.getElementById("site-" + id + "-name").value = site.SiteName || "";
        document.getElementById("site-" + id + "-wired").value = site.WiredClients || 0;
        document.getElementById("site-" + id + "-wireless").value = site.WirelessClients || 0;
        if (site.BandwidthMbps) {
          document.getElementById("site-" + id + "-bandwidth").value = site.BandwidthMbps;
        }
        if (site.P2P && ["yes", "no"].includes(site.P2P.toLowerCase())) {
          document.getElementById("site-" + id + "-p2p").value = site.P2P.toLowerCase();
          this.toggleP2PScope(id);
        }
        if (site.P2PScope && ["subnet", "site", "custom"].includes(site.P2PScope.toLowerCase())) {
          document.getElementById("site-" + id + "-p2p-scope").value = site.P2PScope.toLowerCase();
        }
        if (site.PreferredOS && ["windows", "linux", "no-preference"].includes(site.PreferredOS.toLowerCase())) {
          document.getElementById("site-" + id + "-os").value = site.PreferredOS.toLowerCase();
        }
        if (site.VPN && ["yes", "no"].includes(site.VPN.toLowerCase())) {
          document.getElementById("site-" + id + "-vpn").value = site.VPN.toLowerCase();
        }
        if (site.Proxy && ["yes", "no"].includes(site.Proxy.toLowerCase())) {
          document.getElementById("site-" + id + "-proxy").value = site.Proxy.toLowerCase();
        }
        if (site.SimultaneousPct) {
          const pct = parseInt(site.SimultaneousPct);
          if (pct >= 1 && pct <= 100) {
            document.getElementById("site-" + id + "-simultaneity").value = pct;
          }
        }
      });

      alert(sites.length + " site(s) imported. Review the data and adjust any settings, then click Generate.");
    };
    reader.readAsText(file);

    // Reset input so the same file can be re-uploaded
    event.target.value = "";
  },

  /**
   * Parse CSV text into an array of objects.
   */
  _parseCSV(text) {
    const lines = text.split(/\r?\n/).filter(line => line.trim());
    if (lines.length < 2) return [];

    const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));

    const requiredCols = ["SiteName", "WiredClients", "WirelessClients"];
    const missing = requiredCols.filter(c => !headers.includes(c));
    if (missing.length > 0) {
      alert("CSV is missing required columns: " + missing.join(", ") + ". Expected: SiteName, WiredClients, WirelessClients, BandwidthMbps");
      return [];
    }

    return lines.slice(1).filter(line => !line.startsWith("#")).map(line => {
      const values = this._parseCSVLine(line);
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = values[i] || "";
      });
      return obj;
    }).filter(row => row.SiteName);
  },

  /**
   * Parse a single CSV line, handling quoted values.
   */
  _parseCSVLine(line) {
    const values = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        values.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    values.push(current.trim());
    return values;
  },

  /**
   * Download a blank CSV template.
   */
  downloadTemplate() {
    const template = [
      "SiteName,WiredClients,WirelessClients,BandwidthMbps,P2P,P2PScope,PreferredOS,VPN,Proxy,SimultaneousPct",
      "# Required: SiteName. All other columns are optional (defaults shown in row 2).",
      "# P2P: yes/no. P2PScope: subnet/site/custom. PreferredOS: windows/linux/no-preference.",
      "# VPN: yes/no. Proxy: yes/no. SimultaneousPct: 1-100 (default 100).",
      "# Delete these comment rows before uploading.",
      "Seattle HQ,400,200,1000,yes,subnet,no-preference,no,no,100",
      "Denver Branch,10,25,100,yes,subnet,no-preference,no,no,100"
    ].join("\n") + "\n";
    const blob = new Blob([template], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "MCC-SiteData-Template.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  /**
   * Escape HTML to prevent XSS.
   */
  _escapeHtml(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  },

  /**
   * Get values from the last site card to pre-fill a new one.
   */
  _getLastSiteValues() {
    const defaults = { bandwidth: "100", p2p: "yes", p2pScope: "subnet", os: "no-preference", vpn: "no", proxy: "no", simultaneity: "100" };
    const container = document.getElementById("sites-container");
    if (!container) return defaults;
    const cards = container.querySelectorAll(".site-card");
    if (cards.length === 0) return defaults;

    const lastCard = cards[cards.length - 1];
    const lastId = lastCard.id.replace("site-", "");

    return {
      bandwidth: document.getElementById("site-" + lastId + "-bandwidth").value || "100",
      p2p: document.getElementById("site-" + lastId + "-p2p").value || "yes",
      p2pScope: document.getElementById("site-" + lastId + "-p2p-scope").value || "subnet",
      os: document.getElementById("site-" + lastId + "-os").value || "no-preference",
      vpn: document.getElementById("site-" + lastId + "-vpn").value || "no",
      simultaneity: document.getElementById("site-" + lastId + "-simultaneity").value || "100",
      proxy: document.getElementById("site-" + lastId + "-proxy").value || "no"
    };
  }
};

// Initialize on DOM ready
document.addEventListener("DOMContentLoaded", () => App.init());
