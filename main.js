const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const fs = require('fs');
const path = require('path');
// const { PDFDocument } = require('pdf-lib'); // No longer directly used here for printToPDF
const { shell } = require('electron');

// Application window state
let mainWindow;
let currentFilePath = null; // Tracks the currently open file path
let documentIsModified = false; // Tracks if the document has unsaved changes

// Recent files list
const recentFiles = [];
const MAX_RECENT_FILES = 5;

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false, // For easier integration with existing renderer.js
      enableRemoteModule: true, // Deprecated, but kept for compatibility if needed
    },
    icon: path.join(__dirname, 'assets/icon.png'),
  });

  // Load the index.html of the app
  mainWindow.loadFile('index.html');

  // Open the DevTools in development mode
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  // Create application menu
  createApplicationMenu();

  // Handle window being closed
  mainWindow.on('close', async (event) => {
    if (documentIsModified) { // Use our internal flag
      event.preventDefault(); // Prevent default close behavior
      const { response } = await dialog.showMessageBox(mainWindow, {
        type: 'question',
        buttons: ['Save', 'Don\'t Save', 'Cancel'],
        defaultId: 0,
        cancelId: 2,
        title: 'Media Sphere Docs',
        message: 'Do you want to save changes to this document?',
      });

      if (response === 0) { // Save
        // Notify renderer to save, then quit once saved
        ipcMain.once('document-saved-status', (event, success) => {
            if (success) {
                app.quit();
            } else {
                // If save failed, perhaps notify user or keep window open
                dialog.showErrorBox('Save Error', 'Failed to save document. Please try again.');
            }
        });
        mainWindow.webContents.send('menu-save'); // Trigger save in renderer
      } else if (response === 1) { // Don't Save
        documentIsModified = false; // Reset flag to allow quitting
        app.quit();
      } else { // Cancel
        // Do nothing, keep window open
      }
    }
  });
}

// Create application menu
function createApplicationMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            mainWindow.webContents.send('menu-new');
          },
        },
        {
          label: 'Open...',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            mainWindow.webContents.send('menu-open'); // Let renderer handle open
          },
        },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            mainWindow.webContents.send('menu-save');
          },
        },
        {
          label: 'Save As...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => {
            mainWindow.webContents.send('menu-save-as');
          },
        },
        { type: 'separator' },
        {
          label: 'Export as PDF',
          click: () => {
            mainWindow.webContents.send('menu-export-pdf');
          },
        },
        { type: 'separator' },
        buildRecentFilesMenu(),
        { type: 'separator' },
        {
          label: 'Print...',
          accelerator: 'CmdOrCtrl+P',
          click: () => {
            mainWindow.webContents.send('menu-print');
          },
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Alt+F4',
          click: () => {
            app.quit();
          },
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'delete' },
        { type: 'separator' },
        { role: 'selectAll' },
        { type: 'separator' },
        {
          label: 'Find and Replace...',
          accelerator: 'CmdOrCtrl+F',
          click: () => {
            mainWindow.webContents.send('menu-find');
          },
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Reading Mode',
          click: () => {
            mainWindow.webContents.send('toggle-reading-mode');
          },
        },
        { type: 'separator' },
        {
            label: 'Zoom In',
            accelerator: 'CmdOrCtrl+=',
            click: () => {
                const currentZoom = mainWindow.webContents.getZoomFactor();
                mainWindow.webContents.setZoomFactor(currentZoom + 0.1);
            }
        },
        {
            label: 'Zoom Out',
            accelerator: 'CmdOrCtrl+-',
            click: () => {
                const currentZoom = mainWindow.webContents.getZoomFactor();
                mainWindow.webContents.setZoomFactor(currentZoom - 0.1);
            }
        },
        {
            label: 'Actual Size',
            accelerator: 'CmdOrCtrl+0',
            click: () => {
                mainWindow.webContents.setZoomFactor(1.0);
            }
        },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Insert',
      submenu: [
        {
          label: 'Image...',
          click: () => {
            mainWindow.webContents.send('insert-image');
          },
        },
        {
          label: 'Table...',
          click: () => {
            mainWindow.webContents.send('insert-table');
          },
        },
        {
          label: 'Link...',
          click: () => {
            mainWindow.webContents.send('insert-link');
          },
        },
        {
          label: 'Special Character...',
          click: () => {
            mainWindow.webContents.send('insert-special-char');
          },
        },
        {
          label: 'Horizontal Line',
          click: () => {
            mainWindow.webContents.send('insert-hr');
          },
        },
        {
          label: 'Comment',
          click: () => {
            mainWindow.webContents.send('add-comment');
          },
        },
      ],
    },
    {
      label: 'Format',
      submenu: [
        {
          label: 'Bold',
          accelerator: 'CmdOrCtrl+B',
          click: () => {
            mainWindow.webContents.send('format-command', 'bold');
          },
        },
        {
          label: 'Italic',
          accelerator: 'CmdOrCtrl+I',
          click: () => {
            mainWindow.webContents.send('format-command', 'italic');
          },
        },
        {
          label: 'Underline',
          accelerator: 'CmdOrCtrl+U',
          click: () => {
            mainWindow.webContents.send('format-command', 'underline');
          },
        },
        { type: 'separator' },
        {
          label: 'Paragraph',
          submenu: [
            {
              label: 'Align Left',
              click: () => {
                mainWindow.webContents.send('format-command', 'justifyLeft');
              },
            },
            {
              label: 'Align Center',
              click: () => {
                mainWindow.webContents.send('format-command', 'justifyCenter');
              },
            },
            {
              label: 'Align Right',
              click: () => {
                mainWindow.webContents.send('format-command', 'justifyRight');
              },
            },
            {
              label: 'Justify',
              click: () => {
                mainWindow.webContents.send('format-command', 'justifyFull');
              },
            },
            { type: 'separator' },
            {
                label: 'Line Spacing',
                submenu: [
                    { label: 'Single', click: () => mainWindow.webContents.send('format-command', 'lineHeight', '1') },
                    { label: '1.15', click: () => mainWindow.webContents.send('format-command', 'lineHeight', '1.15') },
                    { label: '1.5', click: () => mainWindow.webContents.send('format-command', 'lineHeight', '1.5') },
                    { label: 'Double', click: () => mainWindow.webContents.send('format-command', 'lineHeight', '2') },
                ]
            }
          ],
        },
        {
          label: 'Lists',
          submenu: [
            {
              label: 'Bullet List',
              click: () => {
                mainWindow.webContents.send('format-command', 'insertUnorderedList');
              },
            },
            {
              label: 'Numbered List',
              click: () => {
                mainWindow.webContents.send('format-command', 'insertOrderedList');
              },
            },
          ],
        },
      ],
    },
    {
      label: 'Tools',
      submenu: [
        {
          label: 'Spell Check',
          type: 'checkbox',
          checked: true, // Initial state, will be updated by renderer
          click: (menuItem) => {
            // Send the new checked state to renderer if needed, or let renderer manage its own state
            mainWindow.webContents.send('toggle-spell-check', menuItem.checked);
          },
        },
        {
          label: 'Word Count',
          click: () => {
            mainWindow.webContents.send('show-word-count');
          },
        },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Documentation',
          click: () => {
            shell.openExternal('https://mediasphere.docs/help');
          },
        },
        {
          label: 'Keyboard Shortcuts',
          click: () => {
            showKeyboardShortcuts();
          },
        },
        { type: 'separator' },
        {
          label: 'About Media Sphere Docs',
          click: () => {
            showAboutDialog();
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// Build the recent files menu
function buildRecentFilesMenu() {
  const recentFilesMenu = {
    label: 'Recent Files',
    submenu: [],
  };

  if (recentFiles.length === 0) {
    recentFilesMenu.submenu.push({
      label: 'No Recent Files',
      enabled: false,
    });
  } else {
    recentFiles.forEach((file) => {
      recentFilesMenu.submenu.push({
        label: path.basename(file),
        toolTip: file, // Show full path on hover
        click: () => {
          openSpecificFile(file);
        },
      });
    });

    recentFilesMenu.submenu.push({ type: 'separator' });
    recentFilesMenu.submenu.push({
      label: 'Clear Recent Files',
      click: () => {
        clearRecentFiles();
      },
    });
  }

  return recentFilesMenu;
}

// Add a file to recent files list
function addToRecentFiles(filePath) {
  // Remove if already exists
  const index = recentFiles.indexOf(filePath);
  if (index !== -1) {
    recentFiles.splice(index, 1);
  }

  // Add to beginning of array
  recentFiles.unshift(filePath);

  // Keep only the max number of recent files
  if (recentFiles.length > MAX_RECENT_FILES) {
    recentFiles.pop();
  }

  // Update menu to reflect recent files
  createApplicationMenu();
}

// Clear recent files list
function clearRecentFiles() {
  recentFiles.length = 0;
  createApplicationMenu();
}

// Open a specific file
function openSpecificFile(filePath) {
  // Check if the file still exists on disk
  if (!fs.existsSync(filePath)) {
    dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: 'File Not Found',
      message: `The file "${filePath}" could not be found. It may have been moved or deleted.`,
    });
    // Remove from recent files if it no longer exists
    const index = recentFiles.indexOf(filePath);
    if (index !== -1) {
        recentFiles.splice(index, 1);
        createApplicationMenu();
    }
    return;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    currentFilePath = filePath; // Update current file path
    addToRecentFiles(filePath); // Add to recent files
    documentIsModified = false; // Mark as unmodified after opening

    // Send content to renderer to load
    mainWindow.webContents.send('document-opened', { filePath, content });
  } catch (error) {
    dialog.showErrorBox('Error Opening File', `An error occurred while opening the file: ${error.message}`);
  }
}

// Show keyboard shortcuts dialog
function showKeyboardShortcuts() {
  const shortcuts = [
    'Ctrl+N: New document',
    'Ctrl+O: Open document',
    'Ctrl+S: Save document',
    'Ctrl+Shift+S: Save document as',
    'Ctrl+P: Print document',
    'Ctrl+Z: Undo',
    'Ctrl+Y: Redo',
    'Ctrl+X: Cut',
    'Ctrl+C: Copy',
    'Ctrl+V: Paste',
    'Ctrl+F: Find and replace',
    'Ctrl+B: Bold',
    'Ctrl+I: Italic',
    'Ctrl+U: Underline',
    'Ctrl+=: Zoom In',
    'Ctrl+-: Zoom Out',
    'Ctrl+0: Actual Size',
  ].join('\n');

  dialog.showMessageBox(mainWindow, {
    title: 'Keyboard Shortcuts',
    message: 'Keyboard Shortcuts',
    detail: shortcuts,
    buttons: ['OK'],
  });
}

// Show about dialog
function showAboutDialog() {
  dialog.showMessageBox(mainWindow, {
    title: 'About Media Sphere Docs',
    message: 'Media Sphere Docs',
    detail: `Version 1.0.0\nCopyright © ${new Date().getFullYear()} Media Sphere\n\nA powerful document editor for all your needs.`,
    buttons: ['OK'],
  });
}

// When Electron has finished initialization
app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// --- IPC Handlers ---

// Renderer notifies main process about document modification status
ipcMain.on('document-modified', (event, modified) => {
    documentIsModified = modified;
    mainWindow.setDocumentEdited(modified); // Electron's built-in flag
});

// Handle 'Save', 'Don't Save', 'Cancel' dialog when closing or opening new/file
ipcMain.handle('show-save-dialog', async (event) => {
    if (!documentIsModified) {
        return 'no-changes'; // No changes, no dialog needed
    }
    const { response } = await dialog.showMessageBox(mainWindow, {
        type: 'question',
        buttons: ['Save', 'Don\'t Save', 'Cancel'],
        defaultId: 0,
        cancelId: 2,
        title: 'Save Changes',
        message: 'Do you want to save changes to this document?',
    });

    if (response === 0) { // Save
        return 'save';
    } else if (response === 1) { // Don't Save
        return 'discard';
    } else { // Cancel
        return 'cancel';
    }
});


ipcMain.handle('open-file', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'HTML Documents', extensions: ['html', 'htm'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });

  if (!canceled && filePaths.length > 0) {
    try {
      const filePath = filePaths[0];
      const content = fs.readFileSync(filePath, 'utf8');
      currentFilePath = filePath;
      addToRecentFiles(filePath);
      documentIsModified = false; // Mark as unmodified
      return { filePath, content };
    } catch (error) {
      throw new Error(`Failed to open file: ${error.message}`);
    }
  }
  
  return { canceled: true }; // Indicate user cancelled
});

ipcMain.handle('save-file-dialog', async () => { // Used by saveAs
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    filters: [{ name: 'HTML Documents', extensions: ['html'] }],
    defaultPath: currentFilePath || 'Untitled.html' // Suggest current path or untitled
  });

  if (!canceled && filePath) {
    return { filePath };
  }
  
  return { canceled: true }; // Indicate user cancelled
});

ipcMain.handle('save-file', async (event, { filePath, content }) => {
  try {
    fs.writeFileSync(filePath, content);
    currentFilePath = filePath;
    addToRecentFiles(filePath);
    documentIsModified = false; // Mark as unmodified after successful save
    event.sender.send('document-saved-status', true); // Notify renderer of save status
    return { success: true };
  } catch (error) {
    dialog.showErrorBox('Save Error', `Failed to save file: ${error.message}`);
    event.sender.send('document-saved-status', false); // Notify renderer of save status
    throw new Error(`Failed to save file: ${error.message}`);
  }
});

ipcMain.handle('export-to-pdf', async () => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    filters: [{ name: 'PDF Documents', extensions: ['pdf'] }],
    defaultPath: currentFilePath ? currentFilePath.replace(/\.html$/, '.pdf') : 'Document.pdf'
  });

  if (!canceled && filePath) {
    try {
      const pdfData = await mainWindow.webContents.printToPDF({
        printBackground: true,
        margins: {
          top: 36, // 0.5 inch
          bottom: 36,
          left: 36,
          right: 36,
        },
        pageSize: 'A4',
        // Prefer CSS media queries for print layout for better control
      });

      fs.writeFileSync(filePath, pdfData);
      return { success: true };
    } catch (error) {
      dialog.showErrorBox('PDF Export Error', `Failed to export PDF: ${error.message}`);
      throw new Error(`Failed to export PDF: ${error.message}`);
    }
  }
  
  return { success: false, canceled: true }; // Indicate user cancelled
});

ipcMain.handle('select-image', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'] },
      { name: 'All Files', extensions: ['*'] }
    ],
  });

  if (!canceled && filePaths.length > 0) {
    return { filePath: filePaths[0] };
  }
  
  return { canceled: true }; // Indicate user cancelled
});