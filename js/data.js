/**
 * Microsoft Connected Cache sizing data based on Microsoft Learn documentation.
 * Source: https://learn.microsoft.com/en-us/windows/deployment/do/mcc-ent-edu-overview
 *         https://learn.microsoft.com/en-us/windows/deployment/do/mcc-ent-prerequisites
 *
 * Last verified: March 2026
 */

const MCC_DATA = {
  // Site categories with hardware specs from MS Learn
  siteCategories: [
    {
      id: "branch",
      label: "Branch Office",
      minDevices: 0,
      maxDevices: 49,
      description: "10–50 Windows devices, no dedicated server hardware, limited bandwidth",
      hardware: {
        cpuCores: 4,
        ramGB: 8,
        ramFreeGB: 4,
        diskFreeGB: 100,
        diskNote: "100 GB free",
        nicGbps: 1,
        nicNote: "1 Gbps"
      },
      deploymentNote: "Can deploy to a Windows 11 client device — no dedicated server needed."
    },
    {
      id: "small-medium",
      label: "Small to Medium Enterprise",
      minDevices: 50,
      maxDevices: 499,
      description: "50–500 devices, existing server hardware or cloud VM",
      hardware: {
        cpuCores: 8,
        ramGB: 16,
        ramFreeGB: 4,
        diskFreeGB: 500,
        diskNote: "500 GB free",
        nicGbps: 5,
        nicNote: "5 Gbps"
      },
      deploymentNote: "Deploy to Windows Server 2022+ or Ubuntu 24.04."
    },
    {
      id: "medium-large",
      label: "Medium to Large Enterprise",
      minDevices: 500,
      maxDevices: 5000,
      description: "500–5,000 devices, dedicated server hardware",
      hardware: {
        cpuCores: 16,
        ramGB: 32,
        ramFreeGB: 4,
        diskFreeGB: 500,
        diskNote: "2x 200–500 GB free",
        nicGbps: 10,
        nicNote: "10 Gbps"
      },
      deploymentNote: "Deploy to Windows Server 2022+ or Ubuntu 24.04."
    }
  ],

  // Bandwidth-to-throughput mapping from MS Learn
  bandwidthThroughput: [
    { peakGbps: 0.05,  monthlyGB: 180 },
    { peakGbps: 0.1,   monthlyGB: 360 },
    { peakGbps: 0.25,  monthlyGB: 900 },
    { peakGbps: 0.5,   monthlyGB: 1800 },
    { peakGbps: 1,     monthlyGB: 3600 },
    { peakGbps: 3,     monthlyGB: 10800 },
    { peakGbps: 5,     monthlyGB: 18000 },
    { peakGbps: 9,     monthlyGB: 32400 }
  ],

  // Supported host operating systems
  supportedOS: {
    windows: {
      label: "Windows",
      options: [
        { id: "win11", label: "Windows 11 (22631.3296+)", suitableFor: "branch", note: "Requires WSL 2 and Hyper-V PowerShell Management Tools" },
        { id: "winserver2022", label: "Windows Server 2022 (20348.2227+)", suitableFor: "all", note: "Requires WSL 2 and Hyper-V PowerShell Management Tools" },
        { id: "winserver2025", label: "Windows Server 2025", suitableFor: "all", note: "Requires WSL 2" }
      ],
      requirements: [
        "WSL 2 must be installed (wsl.exe --install --no-distribution)",
        "Hyper-V PowerShell Management Tools required during deployment",
        "Nested virtualization must be supported (check BIOS/security settings)",
        "If using Azure VMs, 'Trusted Launch' must be disabled"
      ]
    },
    linux: {
      label: "Linux",
      options: [
        { id: "ubuntu2404", label: "Ubuntu 24.04", suitableFor: "all", note: "Recommended Linux option" },
        { id: "rhel8", label: "RHEL 8.*", suitableFor: "all", note: "Must replace default Podman with Moby container engine" },
        { id: "rhel9", label: "RHEL 9.*", suitableFor: "all", note: "Must replace default Podman with Moby container engine" }
      ],
      requirements: [
        "No WSL or Hyper-V dependencies",
        "RHEL users must replace Podman with Moby container engine"
      ]
    }
  },

  // Content type estimates (rough monthly content sizes per device)
  contentTypes: [
    { id: "windows-updates", label: "Windows Updates (feature + quality)", defaultOn: true, avgMonthlyMBPerDevice: 500, description: "Monthly quality updates ~200-500 MB; feature updates ~3-4 GB (annual)" },
    { id: "m365-apps", label: "Microsoft 365 Apps (Office C2R)", defaultOn: true, avgMonthlyMBPerDevice: 300, description: "Monthly channel updates ~200-400 MB" },
    { id: "intune-apps", label: "Intune Win32 / LOB Apps", defaultOn: false, avgMonthlyMBPerDevice: 200, description: "Varies widely by organization" },
    { id: "store-apps", label: "Microsoft Store Apps", defaultOn: false, avgMonthlyMBPerDevice: 50, description: "Store app updates" },
    { id: "defender", label: "Windows Defender Definitions", defaultOn: true, avgMonthlyMBPerDevice: 150, description: "Frequent small definition updates" },
    { id: "autopilot", label: "Autopilot Provisioning", defaultOn: false, avgMonthlyMBPerDevice: 4000, description: "Full OS + apps during provisioning (~4-8 GB per device)" }
  ],

  // General requirements (always shown)
  generalRequirements: [
    "Port 80 must be free on the cache host (no other services using port 80)",
    "Port 80 and 443 must allow inbound/outbound traffic",
    "Azure IoT Edge modules should not be pre-installed on the host",
    "Any previous MCC installations must be uninstalled before deploying",
    "A single NIC per cache node host is required (multiple NICs not supported)",
    "SR-IOV support on NIC and BIOS is recommended for best performance",
    "Azure subscription required (MCC Azure resource itself incurs no cost)"
  ],

  // Download mode reference
  downloadModes: {
    0: { label: "HTTP Only", description: "No P2P; content from CDN or MCC cache server only" },
    1: { label: "LAN", description: "P2P with devices sharing the same public IP (default)" },
    2: { label: "Group", description: "P2P across subnets within a group (AD site, domain, or custom Group ID)" },
    99: { label: "Simple", description: "No cloud services; HTTP from source or MCC only (offline/restricted environments)" }
  }
};
