<p align="center">
  <img src="logo.png" alt="Azure Mapper" width="300">
</p>

<h1 align="center">Azure Network Mapper</h1>

<p align="center">
  Interactive topology visualization, compliance auditing, and infrastructure reporting for Azure environments.
</p>

<p align="center">
  <a href="https://schylerchase.github.io/azure_mapper/">Live Demo</a> &middot;
  <a href="https://github.com/schylerchase/azure_mapper/releases/latest">Download Desktop App</a> &middot;
  <a href="#quick-start">Quick Start</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.1.4-blue" alt="Version">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux%20%7C%20Browser-lightgrey" alt="Platform">
</p>

---

## What It Does

Paste Azure CLI JSON exports (or scan directly from the desktop app) and get an interactive network map with compliance scoring, traffic flow tracing, governance rules, and exportable reports. Zero backend, zero dependencies for the browser version.

> **Looking for AWS?** See [AWS Network Mapper](https://github.com/schylerchase/aws_mapper) for the AWS equivalent.

---

## Features

### Visualization
- D3.js SVG canvas with VNets, public/private subnets, NSGs, peerings, firewalls, and 30+ resource types
- Three layout modes: **Grid** (columns), **Landing Zone** (hub-spoke), **Executive Overview**
- Traffic flow tracing with NSG rule evaluation and flow analysis dashboard
- Blast radius analysis for any resource
- Detail level cycling (collapsed / default / expanded) with keyboard shortcuts
- **Design Mode**: build infrastructure from scratch with a drag-and-drop palette

### Compliance Engine
28 controls across 4 frameworks, evaluated against every applicable resource:

| Framework | Controls | Coverage |
|-----------|----------|----------|
| CIS Azure 3.0 | 8 | NSG rules, storage encryption, disk encryption, Bastion |
| Azure Architecture | 15 | Best practices, HA, private endpoints, network segmentation |
| SOC 2 | 2 | TLS enforcement, outbound access controls |
| PCI DSS | 3 | Network segmentation, admin credentials, HTTPS listeners |

Full compliance dashboard with severity filtering, framework breakdowns, and remediation guidance.

### Governance Rules Engine
- Automatic resource classification with tiered governance (Critical / High / Standard / Low)
- Pattern-based rule matching with pre-compiled RegExp for performance
- Governance dashboard with per-tier breakdown and CSV/JSON export

### NSG / Firewall Dashboard
- Unified view of all NSGs and their security rules
- Search, filter by direction/access, sort by name or open ingress count
- Summary cards: total NSGs, total rules, allow rules, open ingress
- Export as CSV, JSON, or Azure CLI commands

### Report Builder
Modular report generator with drag-to-reorder sections, live preview, and standalone HTML export:
- Executive Summary
- Compliance Report
- Resource Governance
- Resource Inventory
- NSG Rule Summary
- Architecture Notes

### Flow Analysis
- Traffic flow tracing between any source/destination with NSG rule evaluation
- Flow exposure dashboard ranking subnets by exposure level
- One-click trace launch from context menu or flow entries

### Export Formats

| Format | Description |
|--------|-------------|
| PNG | Map screenshot |
| SVG | Vector format |
| Terraform HCL | Azure provider with `azurerm` resources |
| ARM Template | Native Azure JSON deployment template |
| Bicep | Azure DSL format |
| HTML Report | Standalone assessment report |
| CSV / XLSX | Compliance findings and NSG rules |
| .azmap | Full project save/restore |

### Other Capabilities
- Snapshot timeline: capture, browse, and compare historical infrastructure states
- Diff/change detection between snapshots
- Annotations: pin searchable notes to any resource
- Resource search with fuzzy matching
- Context menus with resource-specific actions
- Auto-save to browser every 30 seconds

---

## Quick Start

### Browser (no install)

1. Open the [live demo](https://schylerchase.github.io/azure_mapper/) or `index.html` locally
2. Click **Load Demo** or paste Azure CLI JSON into the input fields
3. Click **Render Map**

### Desktop App (Electron)

Download from [Releases](https://github.com/schylerchase/azure_mapper/releases/latest). Available for macOS (.dmg), Windows (.exe), and Linux (.AppImage).

The desktop app adds:
- **Scan Azure** button -- runs Azure CLI commands automatically
- Native file save/open/export dialogs
- **Import Folder** for bulk JSON loading
- XLSX compliance export
- Auto-update via GitHub Releases

### Export Azure Data

A Bash export script is included for extracting data from your Azure subscriptions:

```bash
./export-azure-data.sh -s my-subscription
./export-azure-data.sh -s my-subscription -g my-resource-group
./export-azure-data.sh -s my-subscription -l eastus
```

The script runs 30+ `az` CLI commands and outputs JSON files ready for import.

---

## Supported Azure Resources

| Category | Resources |
|----------|-----------|
| Network | VNets, Subnets, Route Tables, NSGs, NICs, ASGs |
| Gateways | NAT Gateways, Private Endpoints, Azure Bastion |
| Compute | Virtual Machines, Function Apps, Container Instances, AKS |
| Database | SQL Servers, SQL Databases, Redis Caches, Synapse |
| Load Balancing | Application Gateways, Load Balancers, Front Door |
| Connectivity | VNet Peerings, VPN Connections, Virtual WANs, Virtual Hubs |
| Storage | Storage Accounts, Managed Disks, Snapshots |
| DNS | DNS Zones (Public), DNS Zones (Private), DNS Record Sets |
| Security | WAF Policies, Azure Firewalls, Network Watchers |
| Identity | Role Assignments, Role Definitions, Service Principals |
| Management | Resource Groups |

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `/` | Search resources |
| `?` | Help overlay |
| `D` | Generate demo data |
| `R` | Render map |
| `F` | Zoom to fit |
| `N` | Notes / Annotations |
| `H` | Snapshot timeline |
| `[` / `]` | Cycle detail level |
| `+` / `-` | Zoom in / out |
| `Shift+B` | Report Builder |
| `Shift+C` | Compliance Dashboard |
| `Shift+D` | Design Mode |
| `Shift+E` | Flow Exposure Dashboard |
| `Shift+F` | NSG / Firewall Dashboard |
| `Shift+G` | Governance Dashboard |
| `Shift+R` | Resource List |
| `Shift+T` | Traffic Flow Tracer |
| `Ctrl+S` | Save project |

---

## Build

```bash
npm run build:mac    # macOS (dmg + zip)
npm run build:win    # Windows (nsis + portable)
npm run build:linux  # Linux (AppImage + deb)
npm run build:all    # all platforms
```

## Test

```bash
npm test
```

---

## See Also

- **[AWS Network Mapper](https://github.com/schylerchase/aws_mapper)** -- the AWS equivalent with VPCs, security groups, transit gateways, and 25+ AWS resource types

---

## License

MIT
