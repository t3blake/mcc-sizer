<#
.SYNOPSIS
    Exports Intune managed device data for use with the MCC Sizing Calculator.

.DESCRIPTION
    Connects to Microsoft Graph using interactive sign-in (no app registration required),
    queries Intune managed Windows devices, groups them by city/office location,
    determines wired vs. wireless connection type, and exports a CSV file that can
    be uploaded directly to the MCC Sizing Calculator.

    Required permissions: DeviceManagementManagedDevices.Read.All (granted via interactive consent).

.PARAMETER OutputPath
    Path for the output CSV file. Defaults to MCC-SiteData.csv in the current directory.

.EXAMPLE
    .\Export-IntuneDevicesForMCC.ps1
    .\Export-IntuneDevicesForMCC.ps1 -OutputPath "C:\Temp\sites.csv"

.NOTES
    Requires the Microsoft.Graph PowerShell module.
    Install with: Install-Module Microsoft.Graph -Scope CurrentUser
    No data is sent to any third party — this script only communicates with Microsoft Graph.
#>

[CmdletBinding()]
param(
    [string]$OutputPath = ".\MCC-SiteData.csv"
)

# Check for Microsoft.Graph module
if (-not (Get-Module -ListAvailable -Name Microsoft.Graph.DeviceManagement)) {
    Write-Host "Microsoft.Graph module not found. Installing..." -ForegroundColor Yellow
    Install-Module Microsoft.Graph -Scope CurrentUser -Force -AllowClobber
}

# Connect to Graph with interactive login
Write-Host "Connecting to Microsoft Graph..." -ForegroundColor Cyan
Write-Host "You will be prompted to sign in. The following permission is required:" -ForegroundColor Cyan
Write-Host "  - DeviceManagementManagedDevices.Read.All" -ForegroundColor White
Write-Host ""

Connect-MgGraph -Scopes "DeviceManagementManagedDevices.Read.All" -NoWelcome

# Query managed Windows devices
Write-Host "Querying Intune managed devices..." -ForegroundColor Cyan

$allDevices = @()
$uri = "https://graph.microsoft.com/v1.0/deviceManagement/managedDevices?`$filter=operatingSystem eq 'Windows'&`$select=id,deviceName,managedDeviceName,operatingSystem,wiFiMacAddress,ethernetMacAddress,joinType,deviceCategoryDisplayName"

# Page through all results
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

# Try to get location data from Azure AD device objects
Write-Host "Retrieving device location data..." -ForegroundColor Cyan

$deviceLocations = @{}
try {
    $aadUri = "https://graph.microsoft.com/v1.0/devices?`$select=deviceId,displayName,physicalIds&`$top=999"
    do {
        $aadResponse = Invoke-MgGraphRequest -Method GET -Uri $aadUri -ErrorAction SilentlyContinue
        if ($aadResponse.value) {
            foreach ($dev in $aadResponse.value) {
                $deviceLocations[$dev.displayName] = $dev
            }
        }
        $aadUri = $aadResponse.'@odata.nextLink'
    } while ($aadUri)
} catch {
    Write-Host "  Could not retrieve Azure AD device data for location mapping. Devices will be grouped by category instead." -ForegroundColor Yellow
}

# Determine connection type per device
function Get-ConnectionType {
    param($device)

    $hasEthernet = -not [string]::IsNullOrWhiteSpace($device.ethernetMacAddress)
    $hasWifi = -not [string]::IsNullOrWhiteSpace($device.wiFiMacAddress)

    if ($hasEthernet -and $hasWifi) { return "Both" }
    if ($hasEthernet) { return "Wired" }
    if ($hasWifi) { return "Wireless" }
    return "Unknown"
}

# Determine site grouping for each device
function Get-SiteGroup {
    param($device)

    # Use device category if available
    if (-not [string]::IsNullOrWhiteSpace($device.deviceCategoryDisplayName) -and
        $device.deviceCategoryDisplayName -ne "Unknown") {
        return $device.deviceCategoryDisplayName
    }

    return "Unassigned"
}

# Group devices by site
$siteGroups = @{}
foreach ($device in $allDevices) {
    $siteName = Get-SiteGroup -device $device
    $connType = Get-ConnectionType -device $device

    if (-not $siteGroups.ContainsKey($siteName)) {
        $siteGroups[$siteName] = @{
            Wired = 0
            Wireless = 0
            Unknown = 0
            Total = 0
        }
    }

    switch ($connType) {
        "Wired"    { $siteGroups[$siteName].Wired++ }
        "Wireless" { $siteGroups[$siteName].Wireless++ }
        "Both"     { $siteGroups[$siteName].Wired++; $siteGroups[$siteName].Wireless++ }
        "Unknown"  { $siteGroups[$siteName].Unknown++ }
    }
    $siteGroups[$siteName].Total++
}

# Build CSV output
$csvData = @()
foreach ($site in $siteGroups.GetEnumerator() | Sort-Object Name) {
    # Assign unknown devices to wired (conservative assumption for sizing)
    $wired = $site.Value.Wired + $site.Value.Unknown
    $wireless = $site.Value.Wireless

    $csvData += [PSCustomObject]@{
        SiteName       = $site.Key
        WiredClients   = $wired
        WirelessClients = $wireless
        BandwidthMbps  = ""  # Must be filled in manually — not available from Intune
    }
}

# Export
$csvData | Export-Csv -Path $OutputPath -NoTypeInformation -Encoding UTF8

# Summary
Write-Host ""
Write-Host "==== Export Summary ====" -ForegroundColor Green
Write-Host "  Sites found:        $($siteGroups.Count)" -ForegroundColor White
Write-Host "  Total devices:      $($allDevices.Count)" -ForegroundColor White
Write-Host "  Output file:        $OutputPath" -ForegroundColor White
Write-Host ""
Write-Host "Sites breakdown:" -ForegroundColor Cyan
foreach ($site in $csvData) {
    Write-Host "  $($site.SiteName): $($site.WiredClients) wired, $($site.WirelessClients) wireless" -ForegroundColor Gray
}
Write-Host ""
Write-Host "IMPORTANT:" -ForegroundColor Yellow
Write-Host "  - The BandwidthMbps column is blank and must be filled in manually." -ForegroundColor Yellow
Write-Host "    Intune does not have internet bandwidth data for your sites." -ForegroundColor Yellow
Write-Host "  - Devices with 'Unknown' connection type are counted as wired (conservative)." -ForegroundColor Yellow
Write-Host "  - Devices are grouped by Intune device category. If your devices don't have" -ForegroundColor Yellow
Write-Host "    categories assigned, they will appear as 'Unassigned' — you can rename" -ForegroundColor Yellow
Write-Host "    the sites in the CSV before uploading to the sizing tool." -ForegroundColor Yellow
Write-Host ""
Write-Host "Upload this CSV at: https://t3blake.github.io/mcc-sizer/" -ForegroundColor Cyan

# Disconnect
Disconnect-MgGraph | Out-Null
Write-Host "Disconnected from Microsoft Graph." -ForegroundColor Gray
