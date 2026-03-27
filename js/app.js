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
    document.getElementById("export-pdf-btn").addEventListener("click", () => this.export("pdf"));
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
          <label for="site-${id}-bandwidth">Internet Bandwidth (Mbps)</label>
          <input type="number" id="site-${id}-bandwidth" min="1" value="100" />
        </div>

        <div class="form-group">
          <label for="site-${id}-p2p">Allow Peer-to-Peer?</label>
          <select id="site-${id}-p2p" onchange="App.toggleP2PScope(${id})">
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </div>

        <div class="form-group" id="site-${id}-p2p-scope-group">
          <label for="site-${id}-p2p-scope">P2P Scope</label>
          <select id="site-${id}-p2p-scope">
            <option value="subnet">Same Subnet</option>
            <option value="site">Same AD Site</option>
            <option value="custom">Custom Group ID</option>
          </select>
        </div>

        <div class="form-group">
          <label for="site-${id}-server">Existing Server Hardware?</label>
          <select id="site-${id}-server">
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </div>

        <div class="form-group">
          <label for="site-${id}-os">Preferred Cache Host OS</label>
          <select id="site-${id}-os">
            <option value="no-preference">No Preference</option>
            <option value="windows">Windows</option>
            <option value="linux">Linux</option>
          </select>
        </div>

        <div class="form-group">
          <label for="site-${id}-vpn">VPN Clients at This Site?</label>
          <select id="site-${id}-vpn">
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </div>

        <div class="form-group">
          <label for="site-${id}-proxy">Proxy in Use?</label>
          <select id="site-${id}-proxy">
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </div>

        <div class="form-group">
          <label for="site-${id}-autopilot">Autopilot Provisioning Site?</label>
          <select id="site-${id}-autopilot">
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </div>
      </div>
    `;

    container.appendChild(siteDiv);
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
        hasExistingServer: document.getElementById("site-" + id + "-server").value === "yes",
        preferredOS: document.getElementById("site-" + id + "-os").value,
        hasVpnClients: document.getElementById("site-" + id + "-vpn").value === "yes",
        hasProxy: document.getElementById("site-" + id + "-proxy").value === "yes",
        isAutopilotSite: document.getElementById("site-" + id + "-autopilot").value === "yes"
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
              <tr><td>Monthly Cacheable Content Capacity</td><td>~${s.network.monthlyThroughputGB.toLocaleString()} GB/month</td></tr>
              <tr><td>Estimated Monthly Client Demand</td><td>~${s.contentEstimate.totalMonthlyGB.toLocaleString()} GB/month</td></tr>
              <tr><td>Cache Utilization</td><td>${s.contentEstimate.utilizationPercent}%</td></tr>
            </table>
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
      case "pdf": ExportEngine.exportPDF(); break;
    }
  },

  /**
   * Escape HTML to prevent XSS.
   */
  _escapeHtml(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
};

// Initialize on DOM ready
document.addEventListener("DOMContentLoaded", () => App.init());
