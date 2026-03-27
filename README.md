# Microsoft Connected Cache Sizing Calculator

A client-side web tool that helps IT administrators size their **Microsoft Connected Cache (MCC) for Enterprise and Education** deployments based on [Microsoft Learn guidance](https://learn.microsoft.com/en-us/windows/deployment/do/mcc-ent-edu-overview).

## What it does

Enter your organization's site details (device counts, bandwidth, OS preferences, P2P configuration) and the tool outputs:

- **Server hardware specs** (CPU, RAM, disk, NIC) per site based on Microsoft's recommended tiers
- **Number of cache nodes** needed per site
- **Delivery Optimization policy recommendations** (Download Mode, DOCacheHost, peer selection, VPN settings)
- **Estimated monthly throughput** and content volume
- **Contextual warnings** (wireless P2P/client isolation, proxy conflicts, port 80 requirements, OS-specific dependencies)
- **Organization-wide summary** with total nodes and devices

## Export

Results can be exported as:
- **JSON** — structured data for automation or further processing
- **CSV** — spreadsheet-friendly format
- **PDF** — via browser print dialog (print-optimized stylesheet included)

## Hosting

This is a static site with no backend — all logic runs client-side. Designed for GitHub Pages:

1. Push to a GitHub repository
2. Enable GitHub Pages (Settings → Pages → Deploy from branch: `main`, folder: `/`)
3. Access at `https://<username>.github.io/connected-cache-sizer/`

## Data Sources

Hardware sizing and configuration guidance sourced from:

- [MCC Enterprise Overview](https://learn.microsoft.com/en-us/windows/deployment/do/mcc-ent-edu-overview)
- [MCC Enterprise Prerequisites](https://learn.microsoft.com/en-us/windows/deployment/do/mcc-ent-prerequisites)
- [Delivery Optimization Reference](https://learn.microsoft.com/en-us/windows/deployment/do/waas-delivery-optimization-reference)

**This is not an official Microsoft tool.** Recommendations are estimates. Always validate against your specific environment and consult Microsoft documentation for the latest guidance.

## License

MIT
