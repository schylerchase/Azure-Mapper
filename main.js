const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { buildScanArgs, parseOutputDir, mapFolderFiles } = require('./main-utils');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1600,
        height: 1000,
        minWidth: 1200,
        minHeight: 700,
        title: 'Azure Network Mapper',
        icon: path.join(__dirname, 'icon.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    mainWindow.loadFile('index.html');
    buildMenu();
}

function buildMenu() {
    const template = [
        {
            label: 'File',
            submenu: [
                {
                    label: 'Open Project...',
                    accelerator: 'CmdOrCtrl+O',
                    click: () => openProject()
                },
                {
                    label: 'Save Project',
                    accelerator: 'CmdOrCtrl+S',
                    click: () => mainWindow.webContents.send('menu:save')
                },
                {
                    label: 'Save Project As...',
                    accelerator: 'CmdOrCtrl+Shift+S',
                    click: () => saveProjectAs()
                },
                { type: 'separator' },
                {
                    label: 'Import Azure Export Folder...',
                    click: () => importExportFolder()
                },
                { type: 'separator' },
                { role: 'quit' }
            ]
        },
        {
            label: 'View',
            submenu: [
                { role: 'reload' },
                { role: 'toggleDevTools' },
                { type: 'separator' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { role: 'resetZoom' },
                { type: 'separator' },
                { role: 'togglefullscreen' }
            ]
        },
        {
            label: 'Scan',
            submenu: [
                {
                    label: 'Scan Azure...',
                    accelerator: 'CmdOrCtrl+Shift+A',
                    click: () => mainWindow.webContents.send('menu:scanAzure')
                }
            ]
        },
        {
            label: 'Help',
            submenu: [
                {
                    label: 'About Azure Network Mapper',
                    click: () => {
                        dialog.showMessageBox(mainWindow, {
                            type: 'info',
                            title: 'About',
                            message: 'Azure Network Mapper v1.0.0',
                            detail: 'Visualize, analyze, and export Azure network topologies.'
                        });
                    }
                }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

async function openProject() {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: 'Open Azure Map Project',
        filters: [{ name: 'Azure Map', extensions: ['azuremap'] }],
        properties: ['openFile']
    });
    if (!canceled && filePaths.length > 0) {
        try {
            const data = fs.readFileSync(filePaths[0], 'utf8');
            mainWindow.webContents.send('project:load', { data, filePath: filePaths[0] });
        } catch (err) {
            dialog.showErrorBox('Open Failed', err.message);
        }
    }
}

async function saveProjectAs() {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Save Azure Map Project',
        filters: [{ name: 'Azure Map', extensions: ['azuremap'] }],
        defaultPath: 'network-map.azuremap'
    });
    if (!canceled && filePath) {
        mainWindow.webContents.send('menu:saveAs', filePath);
    }
}

async function importExportFolder() {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: 'Select Azure Export Folder',
        properties: ['openDirectory']
    });
    if (!canceled && filePaths.length > 0) {
        try {
            const folder = filePaths[0];
            const files = fs.readdirSync(folder);
            const data = mapFolderFiles(files, f => fs.readFileSync(path.join(folder, f), 'utf8'));
            mainWindow.webContents.send('import:folder', data);
        } catch (err) {
            dialog.showErrorBox('Import Failed', err.message);
        }
    }
}

// IPC handlers
ipcMain.handle('azure:check-cli', async () => {
    return new Promise((resolve) => {
        // shell: true needed on Windows to resolve az.cmd; no user input in this call
        const proc = spawn('az', ['--version'], { shell: process.platform === 'win32' });
        let output = '';
        proc.stdout.on('data', d => output += d.toString());
        proc.on('close', code => resolve({ installed: code === 0, version: output.split('\n')[0] }));
        proc.on('error', () => resolve({ installed: false, version: null }));
    });
});

ipcMain.handle('azure:scan', async (event, { subscription, resourceGroup }) => {
    const scriptPath = path.join(__dirname, 'export-azure-data.sh');
    if (!fs.existsSync(scriptPath)) {
        return { success: false, error: 'export-azure-data.sh not found' };
    }

    let args;
    try {
        args = buildScanArgs(scriptPath, subscription, resourceGroup);
    } catch (err) {
        return { success: false, error: err.message };
    }

    return new Promise((resolve) => {
        // No shell: true -- args are passed directly to bash, preventing shell injection
        const proc = spawn('bash', args);
        let stdout = '', stderr = '';
        proc.stdout.on('data', d => {
            stdout += d.toString();
            mainWindow.webContents.send('scan:progress', d.toString());
        });
        proc.stderr.on('data', d => stderr += d.toString());
        proc.on('close', code => {
            if (code === 0) {
                const outDir = parseOutputDir(stdout);
                resolve({ success: true, outputDir: outDir });
            } else {
                resolve({ success: false, error: stderr || 'Scan failed' });
            }
        });
        proc.on('error', err => resolve({ success: false, error: err.message }));
    });
});

ipcMain.handle('file:save', async (event, { filePath, data }) => {
    if (!filePath || !filePath.endsWith('.azuremap')) {
        return { success: false, error: 'Invalid file path: must end with .azuremap' };
    }
    // Resolve and reject paths with traversal segments
    const resolved = path.resolve(filePath);
    if (resolved !== path.normalize(filePath) && resolved !== filePath) {
        return { success: false, error: 'Invalid file path: traversal detected' };
    }
    if (resolved.includes('..')) {
        return { success: false, error: 'Invalid file path: traversal detected' };
    }
    try {
        fs.writeFileSync(resolved, data, 'utf8');
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('dialog:saveAs', async () => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Save Azure Map Project',
        filters: [{ name: 'Azure Map', extensions: ['azuremap'] }],
        defaultPath: 'network-map.azuremap'
    });
    return { canceled, filePath };
});

// ── Auto-Update ───────────────────────────────────────────────────

function checkForUpdates() {
    try {
        const { autoUpdater } = require('electron-updater');
        autoUpdater.autoDownload = false;
        autoUpdater.on('update-available', (info) => {
            mainWindow?.webContents.send('update:available', {
                version: info.version,
                releaseNotes: info.releaseNotes
            });
        });
        autoUpdater.checkForUpdates().catch(() => {});
    } catch {}
}

// ── App Lifecycle ─────────────────────────────────────────────────

app.whenReady().then(() => {
    // Set dock icon on macOS
    if (process.platform === 'darwin' && app.dock) {
        app.dock.setIcon(path.join(__dirname, 'icon.png'));
    }

    createWindow();

    // Check for updates after a short delay
    setTimeout(checkForUpdates, 5000);

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
