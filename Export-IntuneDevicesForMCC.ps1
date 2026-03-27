<#
.SYNOPSIS
    Exports Intune managed device data for use with the MCC Sizing Calculator.

.DESCRIPTION
    Connects to Microsoft Graph using interactive sign-in (no app registration required),
    queries Intune managed Windows devices, determines wired vs. wireless connection type,
    groups devices into sites using the chosen strategy, and exports a CSV file that can
    be uploaded directly to the MCC Sizing Calculator.

    No data is sent to any third party — this script only communicates with Microsoft Graph.

.PARAMETER GroupBy
    How to group devices into sites. Options:
      - Category     : Group by Intune device category (default)
      - Subnet       : Group by IP subnet (uses last known IP from Intune, /24 by default)
      - EntraIDCity  : Group by the city attribute on the Entra ID user object
      - None         : All devices in a single group (useful for single-site orgs)

.PARAMETER SubnetSize
    Subnet prefix length for IP-based grouping. Default is 24 (i.e., /24 = 255.255.255.0).
    Common values: 24 (per /24 block), 22 (campus), 16 (large site), 8 (very broad).
    Only used when GroupBy is 'Subnet'.

.PARAMETER OutputPath
    Path for the output CSV file. Defaults to MCC-SiteData.csv in the current directory.

.EXAMPLE
    .\Export-IntuneDevicesForMCC.ps1
    .\Export-IntuneDevicesForMCC.ps1 -GroupBy Subnet
    .\Export-IntuneDevicesForMCC.ps1 -GroupBy Subnet -SubnetSize 22
    .\Export-IntuneDevicesForMCC.ps1 -GroupBy EntraIDCity
    .\Export-IntuneDevicesForMCC.ps1 -GroupBy None
    .\Export-IntuneDevicesForMCC.ps1 -GroupBy Category -OutputPath "C:\Temp\sites.csv"

.NOTES
    Requires the Microsoft.Graph PowerShell module.
    Install with: Install-Module Microsoft.Graph -Scope CurrentUser
#>

[CmdletBinding()]
param(
    [ValidateSet("Category", "Subnet", "EntraIDCity", "None")]
    [string]$GroupBy = "None",

    [ValidateRange(8, 30)]
    [int]$SubnetSize = 24,

    [string]$OutputPath = ".\MCC-SiteData.csv"
)

# ── Module check ──
if (-not (Get-Module -ListAvailable -Name Microsoft.Graph.DeviceManagement)) {
    Write-Host "Microsoft.Graph module not found. Installing..." -ForegroundColor Yellow
    Install-Module Microsoft.Graph -Scope CurrentUser -Force -AllowClobber
}

# ── Determine required scopes ──
$scopes = @("DeviceManagementManagedDevices.Read.All")
if ($GroupBy -eq "EntraIDCity") {
    $scopes += "User.Read.All"
}

# ── Connect ──
Write-Host "Connecting to Microsoft Graph..." -ForegroundColor Cyan
Write-Host "  Grouping strategy: $GroupBy$(if ($GroupBy -eq 'Subnet') { " (/$SubnetSize)" })" -ForegroundColor White
Write-Host "  Required permissions: $($scopes -join ', ')" -ForegroundColor White
Write-Host ""

Connect-MgGraph -Scopes $scopes -NoWelcome

# ── Query managed Windows devices ──
Write-Host "Querying Intune managed devices..." -ForegroundColor Cyan

$allDevices = @()
$uri = "https://graph.microsoft.com/v1.0/deviceManagement/managedDevices?`$filter=operatingSystem eq 'Windows'&`$select=id,deviceName,managedDeviceName,operatingSystem,wiFiMacAddress,ethernetMacAddress,deviceCategoryDisplayName,userId"

do {
    $response = Invoke-MgGraphRequest -Method GET -Uri $uri
    $allDevices += $response.value
    $uri = $response.'@odata.nextLink'

    if ($allDevices.Count % 500 -eq 0 -and $allDevices.Count -gt 0) {
        Write-Host "  Retrieved $($allDevices.Count) devices so far..." -ForegroundColor Gray
    }
} while ($uri)

Write-Host "  Total Windows devices found: $($allDevices.Count)" -ForegroundColor Green

if ($allDevices.Count -eq 0) {
    Write-Warning "No managed Windows devices found. Check your permissions and Intune enrollment."
    Disconnect-MgGraph | Out-Null
    return
}

# ── For subnet grouping, get device IPs ──
$deviceIPs = @{}
if ($GroupBy -eq "Subnet") {
    Write-Host "Retrieving device IP addresses for subnet grouping..." -ForegroundColor Cyan
    Write-Host "  Note: IP data comes from last Intune check-in and may not reflect current network location." -ForegroundColor Gray
    Write-Host "  VPN or roaming devices may appear in unexpected subnets." -ForegroundColor Gray

    $counter = 0
    foreach ($device in $allDevices) {
        $counter++
        try {
            $detailUri = "https://graph.microsoft.com/beta/deviceManagement/managedDevices/$($device.id)?`$select=id,hardwareInformation"
            $detail = Invoke-MgGraphRequest -Method GET -Uri $detailUri -ErrorAction SilentlyContinue
            if ($detail.hardwareInformation -and $detail.hardwareInformation.ipAddressV4) {
                $deviceIPs[$device.id] = $detail.hardwareInformation.ipAddressV4
            }
        } catch {
            # Skip devices where we can't get IP
        }

        if ($counter % 100 -eq 0) {
            Write-Host "  Processed $counter of $($allDevices.Count) devices..." -ForegroundColor Gray
        }
    }

    Write-Host "  IP addresses found: $($deviceIPs.Count) of $($allDevices.Count) devices" -ForegroundColor Green

    if ($deviceIPs.Count -eq 0) {
        Write-Warning "No IP addresses found. The beta API may not have hardware info for your devices."
        Write-Warning "Try a different grouping method: -GroupBy Category or -GroupBy EntraIDCity"
        Disconnect-MgGraph | Out-Null
        return
    }
}

# ── For Entra ID city grouping, get user city data ──
$userCities = @{}
if ($GroupBy -eq "EntraIDCity") {
    Write-Host "Retrieving user city data from Entra ID..." -ForegroundColor Cyan

    $userUri = "https://graph.microsoft.com/v1.0/users?`$select=id,displayName,city,officeLocation&`$top=999"
    do {
        $userResponse = Invoke-MgGraphRequest -Method GET -Uri $userUri -ErrorAction SilentlyContinue
        if ($userResponse.value) {
            foreach ($user in $userResponse.value) {
                $location = if (-not [string]::IsNullOrWhiteSpace($user.city)) { $user.city }
                            elseif (-not [string]::IsNullOrWhiteSpace($user.officeLocation)) { $user.officeLocation }
                            else { $null }
                if ($location) {
                    $userCities[$user.id] = $location
                }
            }
        }
        $userUri = $userResponse.'@odata.nextLink'
    } while ($userUri)

    Write-Host "  Users with city/office data: $($userCities.Count)" -ForegroundColor Green
}

# ── Helper: Get connection type ──
function Get-ConnectionType {
    param($device)
    $hasEthernet = -not [string]::IsNullOrWhiteSpace($device.ethernetMacAddress)
    $hasWifi = -not [string]::IsNullOrWhiteSpace($device.wiFiMacAddress)
    if ($hasEthernet -and $hasWifi) { return "Both" }
    if ($hasEthernet) { return "Wired" }
    if ($hasWifi) { return "Wireless" }
    return "Unknown"
}

# ── Helper: Compute subnet from IP ──
function Get-Subnet {
    param([string]$ip, [int]$prefix)

    try {
        $octets = $ip.Split('.') | ForEach-Object { [int]$_ }
        if ($octets.Count -ne 4) { return "Unknown-Subnet" }

        $ipInt = ($octets[0] -shl 24) -bor ($octets[1] -shl 16) -bor ($octets[2] -shl 8) -bor $octets[3]
        $mask = ([uint32]::MaxValue) -shl (32 - $prefix) -band [uint32]::MaxValue
        $subnetInt = $ipInt -band $mask

        $s1 = ($subnetInt -shr 24) -band 0xFF
        $s2 = ($subnetInt -shr 16) -band 0xFF
        $s3 = ($subnetInt -shr 8) -band 0xFF
        $s4 = $subnetInt -band 0xFF

        return "$s1.$s2.$s3.$s4/$prefix"
    } catch {
        return "Unknown-Subnet"
    }
}

# ── Get site name for a device based on GroupBy strategy ──
function Get-SiteGroup {
    param($device)

    switch ($script:GroupBy) {
        "Category" {
            if (-not [string]::IsNullOrWhiteSpace($device.deviceCategoryDisplayName) -and
                $device.deviceCategoryDisplayName -ne "Unknown") {
                return $device.deviceCategoryDisplayName
            }
            return "Uncategorized"
        }
        "Subnet" {
            $ip = $script:deviceIPs[$device.id]
            if ($ip) { return Get-Subnet -ip $ip -prefix $script:SubnetSize }
            return "No-IP-Data"
        }
        "EntraIDCity" {
            if ($device.userId -and $script:userCities.ContainsKey($device.userId)) {
                return $script:userCities[$device.userId]
            }
            return "No-City-Data"
        }
        "None" {
            return "All Devices"
        }
    }
}

# ── Group devices ──
Write-Host "Grouping devices..." -ForegroundColor Cyan

$siteGroups = @{}
foreach ($device in $allDevices) {
    $siteName = Get-SiteGroup -device $device
    $connType = Get-ConnectionType -device $device

    if (-not $siteGroups.ContainsKey($siteName)) {
        $siteGroups[$siteName] = @{ Wired = 0; Wireless = 0; Unknown = 0; Total = 0 }
    }

    switch ($connType) {
        "Wired"    { $siteGroups[$siteName].Wired++ }
        "Wireless" { $siteGroups[$siteName].Wireless++ }
        "Both"     { $siteGroups[$siteName].Wired++; $siteGroups[$siteName].Wireless++ }
        "Unknown"  { $siteGroups[$siteName].Unknown++ }
    }
    $siteGroups[$siteName].Total++
}

# ── Build CSV ──
$csvData = @()
foreach ($site in $siteGroups.GetEnumerator() | Sort-Object Name) {
    $wired = $site.Value.Wired + $site.Value.Unknown
    $wireless = $site.Value.Wireless

    $csvData += [PSCustomObject]@{
        SiteName        = $site.Key
        WiredClients    = $wired
        WirelessClients = $wireless
        BandwidthMbps   = ""
    }
}

$csvData | Export-Csv -Path $OutputPath -NoTypeInformation -Encoding UTF8

# ── Summary ──
Write-Host ""
Write-Host "==== Export Summary ====" -ForegroundColor Green
Write-Host "  Grouping method:    $GroupBy$(if ($GroupBy -eq 'Subnet') { " (/$SubnetSize)" })" -ForegroundColor White
Write-Host "  Sites found:        $($siteGroups.Count)" -ForegroundColor White
Write-Host "  Total devices:      $($allDevices.Count)" -ForegroundColor White
Write-Host "  Output file:        $OutputPath" -ForegroundColor White
Write-Host ""
Write-Host "Sites breakdown:" -ForegroundColor Cyan
foreach ($site in $csvData) {
    Write-Host "  $($site.SiteName): $($site.WiredClients) wired, $($site.WirelessClients) wireless" -ForegroundColor Gray
}
Write-Host ""
Write-Host "NOTES:" -ForegroundColor Yellow
Write-Host "  - BandwidthMbps is blank and must be filled in manually." -ForegroundColor Yellow
Write-Host "    Intune does not have internet bandwidth data for your sites." -ForegroundColor Yellow
Write-Host "  - Devices with unknown connection type are counted as wired (conservative)." -ForegroundColor Yellow
Write-Host "  - Review site names in the CSV and rename to match your actual site names" -ForegroundColor Yellow
Write-Host "    before uploading to the sizing tool." -ForegroundColor Yellow

if ($GroupBy -eq "Subnet") {
    Write-Host "  - IP addresses come from the last Intune check-in." -ForegroundColor Yellow
    Write-Host "    VPN or roaming devices may appear in unexpected subnets." -ForegroundColor Yellow
}
if ($GroupBy -eq "EntraIDCity") {
    Write-Host "  - City data comes from the Entra ID user profile." -ForegroundColor Yellow
    Write-Host "    Devices without an assigned user or missing city data appear as 'No-City-Data'." -ForegroundColor Yellow
}
if ($GroupBy -eq "Category") {
    Write-Host "  - Devices without a category appear as 'Uncategorized'." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Upload this CSV at: https://t3blake.github.io/mcc-sizer/" -ForegroundColor Cyan

Disconnect-MgGraph | Out-Null
Write-Host "Disconnected from Microsoft Graph." -ForegroundColor Gray
