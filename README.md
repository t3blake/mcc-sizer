# Microsoft Connected Cache Sizing Calculator

**[Use the tool →](https://t3blake.github.io/mcc-sizer/)**

A client-side web tool that helps IT administrators size **Microsoft Connected Cache (MCC) for Enterprise and Education** deployments. All calculations run in the browser — no data is uploaded or stored.

> **Not official guidance.** This tool produces estimates based on publicly available documentation and internal product group conversations. Always validate against your environment and consult the official [Microsoft Learn documentation](https://learn.microsoft.com/en-us/windows/deployment/do/mcc-ent-edu-overview).

## What it does

Enter your organization's site details (device counts, bandwidth, OS preferences, P2P configuration) and the tool outputs:

- **Server hardware specs** (CPU, RAM, disk, NIC) per site based on Microsoft's recommended tiers
- **Number of cache nodes** needed per site
- **Peak delivery analysis** — models what happens when devices download simultaneously, showing per-device bandwidth and download time
- **Delivery Optimization policy recommendations** (Download Mode, DOCacheHost, peer selection, VPN settings)
- **Estimated monthly throughput** and content volume
- **Contextual warnings** (wireless P2P/client isolation, proxy conflicts, port 80 requirements, OS-specific dependencies)
- **Organization-wide summary** with total nodes and devices

## How sizing decisions are made

The tool combines official documentation with assumptions where documentation is silent. Each data point is tagged by source.

### Hardware specifications — from [MS Learn](https://learn.microsoft.com/en-us/windows/deployment/do/mcc-ent-prerequisites#recommended-host-machine-hardware-specifications)

Microsoft publishes three hardware tiers. This tool maps them to site sizes:

| Site Category | Devices | CPU | RAM | Disk | NIC |
|---|---|---|---|---|---|
| Branch Office | < 50 | 4 cores | 8 GB | 100 GB free | 1 Gbps |
| Small–Medium Enterprise | 50–500 | 8 cores | 16 GB | 500 GB free | 5 Gbps |
| Medium–Large Enterprise | 500–5,000 | 16 cores | 32 GB | 2× 200–500 GB free | 10 Gbps |

The MS Learn hardware table does not explicitly label columns by site size. The mapping above is inferred by correlating the hardware table with site category descriptions and the bandwidth table on the [overview page](https://learn.microsoft.com/en-us/windows/deployment/do/mcc-ent-edu-overview#supported-scenarios-and-configurations).

### Bandwidth-to-throughput — from [MS Learn](https://learn.microsoft.com/en-us/windows/deployment/do/mcc-ent-edu-overview#large-enterprise-sites)

| Peak Bandwidth | Monthly Throughput |
|---|---|
| 50 Mbps | 180 GB |
| 100 Mbps | 360 GB |
| 250 Mbps | 900 GB |
| 500 Mbps | 1,800 GB |
| 1 Gbps | 3,600 GB |
| 3 Gbps | 10,800 GB |
| 5 Gbps | 18,000 GB |
| 9 Gbps | 32,400 GB |

When bandwidth falls between these values, the tool uses linear interpolation (our calculation, not documented).

### Peak delivery analysis — from field observations

Models what happens when many devices download simultaneously from the cache node:

1. Cache throughput (NIC Gbps from the hardware tier) is shared across all simultaneously downloading devices
2. Per-device bandwidth = cache throughput ÷ simultaneous device count
3. Download time = content size per device ÷ per-device bandwidth

**Example:** 15,244 devices on a 5 Gbps cache node. If all devices request 500 MB at the same time: 5,000,000 Kbps ÷ 15,244 = ~327 Kbps per device → ~3:24 download time.

The "Simultaneous Download %" input (default 100% = worst case) lets users model the effect of staggered update rings. For example, 4 rings with staggered schedules → ~25%.

**Key mitigations:**
- Configure update rings to stagger downloads across the fleet
- Enable Delivery Optimization peering so devices source content from each other

### Multi-node sizing — assumption

Microsoft's largest documented tier covers up to 5,000 devices. For sites above 5,000, the tool recommends additional cache nodes by dividing by 5,000. This is a practical assumption — the docs state "there is no limit to the number of licensed machines that can concurrently download from a Connected Cache node" — and should be validated through testing.

### Per-device content estimates — assumption

Microsoft documents which content types are cacheable but does not publish per-device volumes. These are rough approximations used only for the "Estimated Monthly Client Demand" figure:

| Content Type | Estimate |
|---|---|
| Windows Updates (feature + quality) | ~500 MB/device/month |
| Microsoft 365 Apps (Office C2R) | ~300 MB/device/month |
| Intune Win32 / LOB Apps | ~200 MB/device/month |
| Microsoft Store Apps | ~50 MB/device/month |
| Windows Defender Definitions | ~150 MB/device/month |
| Autopilot Provisioning | ~4,000 MB/device (one-time) |

Hardware sizing does **not** depend on these estimates.

### Delivery Optimization policies — from [MS Learn](https://learn.microsoft.com/en-us/windows/deployment/do/waas-delivery-optimization-reference)

All policy names, values, and descriptions come from official documentation. The cache server fallback delay of 60 seconds is a suggested starting point — Microsoft recommends setting this policy but does not specify a particular value.

### OS and general requirements — from [MS Learn](https://learn.microsoft.com/en-us/windows/deployment/do/mcc-ent-prerequisites)

All OS requirements, build numbers, WSL/Hyper-V dependencies, proxy warnings, port requirements, and NIC specifications come directly from the prerequisites page.

## Site inputs

Each site form collects the following. Every field is used in sizing or policy calculations:

| Input | Used for |
|---|---|
| Site Name | Labels in results and exports |
| Wired / Wireless Clients | Device count → hardware tier, node count, peak delivery math, wireless P2P warnings |
| Internet Bandwidth (Mbps) | Monthly throughput estimate via MS Learn bandwidth table |
| Allow Peer-to-Peer | DO download mode policy; affects peak delivery mitigation notes |
| P2P Scope | Sets DORestrictPeerSelectionBy or DOGroupIDSource policies |
| Preferred Cache Host OS | OS recommendation and dependency warnings (WSL, Hyper-V) |
| VPN Clients | DOAllowVPNPeerCaching and DODisallowCacheServerDownloadsOnVPN policies |
| Proxy in Use | Generates proxy compatibility warning |
| Simultaneous Download % | Peak delivery analysis — models update ring staggering |

## Export

Results can be exported as:
- **JSON** — structured data for automation or further processing
- **CSV** — spreadsheet-friendly format
- **PDF** — via browser print dialog (print-optimized stylesheet included)

## Bulk import via CSV

For organizations with many sites, download the CSV template from the tool and fill in your site data. Upload the completed CSV to populate all site cards at once.

**Template columns:**

| Column | Required | Values | Default |
|---|---|---|---|
| SiteName | Yes | Free text | — |
| WiredClients | No | Number | 0 |
| WirelessClients | No | Number | 0 |
| BandwidthMbps | No | Number | 100 |
| P2P | No | yes / no | yes |
| P2PScope | No | subnet / site / custom | subnet |
| PreferredOS | No | windows / linux / no-preference | no-preference |
| VPN | No | yes / no | no |
| Proxy | No | yes / no | no |
| SimultaneousPct | No | 1–100 | 100 |

Only `SiteName` is required — all other columns will use defaults if omitted or left blank.

**Where to get your device counts:**
- **Intune portal** → Devices → All devices → filter by OS = Windows, then export and group by location/category
- **Configuration Manager (SCCM)** → Device Collections by site or boundary group
- **Active Directory** → Computer objects by OU or AD site
- **Network team** → DHCP lease counts or NAC data per site

## Hosting

Static site with no backend. Designed for GitHub Pages:

1. Push to a GitHub repository
2. Enable GitHub Pages (Settings → Pages → Deploy from branch → `master`, folder `/`)
3. Access at `https://<username>.github.io/mcc-sizer/`

## Data sources

| Source | What it provides |
|---|---|
| [MCC Enterprise Overview](https://learn.microsoft.com/en-us/windows/deployment/do/mcc-ent-edu-overview) | Site categories, bandwidth-to-throughput table |
| [MCC Enterprise Prerequisites](https://learn.microsoft.com/en-us/windows/deployment/do/mcc-ent-prerequisites) | Hardware specs, OS requirements, port/NIC requirements |
| [Delivery Optimization Reference](https://learn.microsoft.com/en-us/windows/deployment/do/waas-delivery-optimization-reference) | Policy names, values, and descriptions |
| Field observations | Peak delivery analysis methodology |

## License

MIT
