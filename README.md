<p align="center">
  <img src="logo.png" alt="Azure Network Mapper" width="200">
  <!-- icon.png is used by Electron for the window/dock icon -->
</p>

<h1 align="center">Azure Network Mapper</h1>

<p align="center">Desktop + web app that visualizes Azure network topology from CLI exports.<br>Paste JSON, click render, get an interactive SVG map of your VNets, subnets, peerings, and resources.</p>

## Features

- **Auto-layout** — grid or force-directed positioning of VNets with 2-column subnet grids
- **Peering visualization** — orthogonal routed lines between peered VNets with gateway icons, NSG security state on endpoints
- **Resource inventory** — VMs, NICs, Public IPs, NSGs, NAT Gateways, Private Endpoints, App Gateways, Load Balancers, Firewalls, AKS clusters, Function Apps, Container Instances
- **Detail panels** — click any subnet or resource for drill-down info, NSG rules, route tables, effective routes
- **Traffic flow analysis** — trace network paths between resources
- **Compliance scan** — check for open subnets, missing NSGs, public exposure
- **Export** — PNG, SVG, Terraform HCL, ARM Template JSON, Bicep DSL
- **Snapshots** — save and restore map states
- **Live scan** — (Electron only) run `az` CLI commands directly to pull data from your subscription
- **Dark theme** — purpose-built for network diagrams

## Quick Start

### Web (no install)

Open `index.html` in a browser. Paste your Azure CLI JSON output into the text fields and click **Render Map**.

### Electron (desktop app)

```bash
npm install
npm start
```

### Collect Azure data

Run these commands against your subscription (requires [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli)):

```bash
az network vnet list -o json
az network nsg list -o json
az network route-table list -o json
az network nic list -o json
az network public-ip list -o json
az network nat gateway list -o json
az network private-endpoint list -o json
az vm list --show-details -o json
az network vnet peering list --resource-group <rg> --vnet-name <vnet> -o json
```

Paste each output into the corresponding field in the sidebar, or use **Import Folder** to load an entire directory of JSON exports.

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

## Tech

Single-file HTML app (~5700 lines). No build step, no framework. D3.js v7 for SVG rendering, Electron for desktop packaging.

## License

MIT
