/**
 * Delivery Optimization policy recommendation engine.
 * Generates DO policy settings and warnings based on site configuration.
 */

const PolicyEngine = {
  /**
   * Generate DO policy recommendations for a site.
   */
  recommend(site) {
    const policies = {};
    const warnings = [];
    const info = [];
    const totalDevices = (site.wiredClients || 0) + (site.wirelessClients || 0);

    // Download Mode
    if (site.p2pEnabled) {
      if (site.p2pScope === "subnet") {
        policies["DODownloadMode"] = { value: "1 (LAN)", description: "P2P with devices on the same subnet" };
        policies["DORestrictPeerSelectionBy"] = { value: "1 (Subnet mask)", description: "Restrict peers to same subnet" };
      } else if (site.p2pScope === "site") {
        policies["DODownloadMode"] = { value: "2 (Group)", description: "P2P across subnets within a group" };
        policies["DOGroupIDSource"] = { value: "1 (AD Site)", description: "Group by Active Directory site" };
      } else if (site.p2pScope === "custom") {
        policies["DODownloadMode"] = { value: "2 (Group)", description: "P2P with custom group ID" };
        policies["DOGroupID"] = { value: "<Your-Custom-GUID>", description: "Set a custom GUID for this group" };
      } else {
        policies["DODownloadMode"] = { value: "1 (LAN)", description: "P2P on the same local network (default)" };
      }
    } else {
      policies["DODownloadMode"] = { value: "0 (HTTP Only)", description: "No P2P; content from CDN or cache server only" };
    }

    // Cache server hostname
    policies["DOCacheHost"] = { value: "<your-mcc-server-fqdn>", description: "FQDN or IP of the Connected Cache node" };

    // Cache server fallback delays (recommended)
    policies["DelayCacheServerFallbackForeground"] = { value: "60 (seconds)", description: "Delay fallback to CDN for foreground downloads. 60s is a starting point — adjust based on testing in your environment." };
    policies["DelayCacheServerFallbackBackground"] = { value: "60 (seconds)", description: "Delay fallback to CDN for background downloads. 60s is a starting point — adjust based on testing in your environment." };

    // VPN settings
    if (site.hasVpnClients) {
      policies["DOAllowVPNPeerCaching"] = { value: "false", description: "VPN clients should not use P2P (default)" };
      policies["DODisallowCacheServerDownloadsOnVPN"] = { value: "false (allow)", description: "Allow VPN clients to download from cache server on corporate network" };
      info.push("VPN clients will be able to use the Connected Cache node but will not participate in P2P. This is the recommended configuration.");
    }

    // P2P + wireless warnings
    if (site.p2pEnabled && site.wirelessClients > 0) {
      warnings.push({
        type: "wireless-p2p",
        severity: "warning",
        message: `Peer-to-peer is enabled and this site has ${site.wirelessClients} wireless client${site.wirelessClients !== 1 ? "s" : ""}. Verify that your wireless controller and/or access points support peer-to-peer traffic between clients. Many enterprise Wi-Fi configurations enable client isolation by default, which blocks P2P. Check for settings like "client isolation", "peer-to-peer blocking", or "Layer 2 isolation" on your APs/controller.`
      });

      if (site.wiredClients > 0) {
        info.push(`Consider using Group download mode with subnet restrictions to limit P2P to wired clients only, if wireless P2P is unreliable at this site.`);
      }

      if (site.wiredClients === 0) {
        warnings.push({
          type: "wireless-only-p2p",
          severity: "warning",
          message: "This site is entirely wireless with P2P enabled. P2P effectiveness depends heavily on your wireless infrastructure. If AP client isolation is active, P2P will not function. Consider setting Download Mode to HTTP Only (0) and relying solely on the cache node."
        });
      }
    }

    // Proxy warning
    if (site.hasProxy) {
      warnings.push({
        type: "proxy",
        severity: "warning",
        message: "A forward proxy is in use at this site. Connected Cache is a reverse proxy and will not work behind a forward proxy with caching enabled (e.g., Squid-based proxies). Ensure the proxy is configured to let the Connected Cache node connect directly to origin, or allow it to bypass the proxy entirely."
      });
    }

    // Autopilot note
    if (site.isAutopilotSite) {
      info.push("This site uses Autopilot provisioning. During provisioning events, bandwidth demand will spike significantly as devices download the full OS image and apps (~4-8 GB per device). Ensure cache node disk and bandwidth are sized for burst provisioning scenarios.");
    }

    // General requirements warnings (always)
    warnings.push({
      type: "port80",
      severity: "info",
      message: "Port 80 must be free on the cache host — no other services or applications can use port 80."
    });

    // Multi-node warning
    if (totalDevices > 5000) {
      const nodeCount = Math.ceil(totalDevices / 5000);
      warnings.push({
        type: "multi-node",
        severity: "info",
        message: `With ${totalDevices.toLocaleString()} devices, ${nodeCount} cache nodes are recommended (based on an assumed limit of ~5,000 devices per node — see Methodology for details). Deploy behind a load balancer or list multiple FQDNs/IPs in the DOCacheHost policy (comma-separated). Fallback to CDN occurs after the first cache server failure unless DelayCacheServerFallback policies are set.`
      });
    }

    return { policies, warnings, info };
  }
};
