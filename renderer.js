// Enhanced renderer.js - Document Editor
const { ipcRenderer } = require('electron');

class DocumentEditor {
  constructor() {
    this.documentModified = false;
    this.currentFilePath = null;
    this.currentPage = 1;
    this.totalPages = 1;
    this.selectedEditor = null;
    this.typingTimer = null;
    this.pageHeight = 1120; // Default page height, should ideally be dynamic
    this.editorPadding = 80; // Estimated padding/margin top+bottom for editor content within a page

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.init());
    } else {
      this.init();
    }
  }

  init() {
    this.setupDOM();
    this.setupEventListeners();
    this.setupKeyboardShortcuts();
    this.initializeTheme();
    this.initializeSpecialChars();
    this.setupAutoPageBreak();
    this.setupMobileResponsiveness();
    this.updateUI();

    // Focus on first editor
    this.focusFirstEditor();

    // Calculate initial page height dynamically
    this.calculatePageDimensions();
    window.addEventListener('resize', this.calculatePageDimensions.bind(this));


    console.log('Document Editor initialized');
  }

  setupDOM() {
    // Ensure required elements exist
    const requiredElements = [
      'page-container', 'statusDocInfo', 'statusWordCount',
      'toast', 'toastMessage', 'contextMenu'
    ];

    requiredElements.forEach(id => {
      if (!document.getElementById(id)) {
        console.warn(`Required element #${id} not found`);
      }
    });
  }

  setupEventListeners() {
    // File operations
    this.bindEvent('newDoc', this.createNewDocument.bind(this));
    this.bindEvent('openFile', this.openFile.bind(this));
    this.bindEvent('saveFile', this.saveFile.bind(this));
    this.bindEvent('saveAsFile', this.saveFileAs.bind(this));
    this.bindEvent('exportPDF', this.exportPDF.bind(this));
    this.bindEvent('printDoc', this.printDocument.bind(this));

    // Theme toggle
    this.bindEvent('themeToggle', this.toggleTheme.bind(this));

    // Font controls
    this.bindChangeEvent('fontName', (value) => this.execCmd('fontName', value));
    this.bindChangeEvent('fontSize', (value) => this.execCmd('fontSize', value));
    this.bindChangeEvent('lineSpacing', (value) => this.changeLineSpacing(value));
    this.bindChangeEvent('zoom', (value) => this.changeZoom(value));
    this.bindChangeEvent('textColor', (value) => this.execCmd('foreColor', value));
    this.bindChangeEvent('bgColor', (value) => this.execCmd('hiliteColor', value));

    // Text formatting
    this.bindEvent('boldBtn', () => this.execCmd('bold'));
    this.bindEvent('italicBtn', () => this.execCmd('italic'));
    this.bindEvent('underlineBtn', () => this.execCmd('underline'));
    this.bindEvent('strikeBtn', () => this.execCmd('strikeThrough'));

    // Alignment
    this.bindEvent('alignLeftBtn', () => this.execCmd('justifyLeft'));
    this.bindEvent('alignCenterBtn', () => this.execCmd('justifyCenter'));
    this.bindEvent('alignRightBtn', () => this.execCmd('justifyRight'));
    this.bindEvent('alignJustifyBtn', () => this.execCmd('justifyFull'));

    // Lists
    this.bindEvent('orderedListBtn', () => this.execCmd('insertOrderedList'));
    this.bindEvent('unorderedListBtn', () => this.execCmd('insertUnorderedList'));
    this.bindEvent('indentBtn', () => this.execCmd('indent'));
    this.bindEvent('outdentBtn', () => this.execCmd('outdent'));

    // Insert elements
    this.bindEvent('linkBtn', this.insertLink.bind(this));
    this.bindEvent('imageBtn', this.insertImage.bind(this));
    this.bindEvent('tableBtn', this.insertTable.bind(this));
    this.bindEvent('hrBtn', () => this.execCmd('insertHorizontalRule'));
    this.bindEvent('specialCharBtn', this.insertSpecialChar.bind(this));

    // Page operations
    this.bindEvent('addPageBtn', this.addPage.bind(this));

    // Tools
    this.bindEvent('findReplaceBtn', this.showFindReplace.bind(this));
    this.bindEvent('wordCountBtn', this.countWords.bind(this));
    this.bindEvent('spellCheckBtn', this.toggleSpellCheck.bind(this));
    this.bindEvent('addCommentBtn', this.addComment.bind(this));
    this.bindEvent('readingModeBtn', this.toggleReadingMode.bind(this));

    // Header/Footer toggles
    this.bindEvent('toggleHeader', () => this.toggleHeaderFooter('header'));
    this.bindEvent('toggleFooter', () => this.toggleHeaderFooter('footer'));

    // Panel buttons
    this.setupPanelButtons();

    // Context menu
    this.setupContextMenu();

    // Editor events
    this.setupEditorEvents();

    // IPC listeners
    this.setupIPCListeners();

    // Window events
    this.setupWindowEvents();
  }

  bindEvent(id, handler) {
    const element = document.getElementById(id);
    if (element) {
      element.onclick = handler;
    }
  }

  bindChangeEvent(id, handler) {
    const element = document.getElementById(id);
    if (element) {
      element.onchange = (e) => handler(e.target.value);
    }
  }

  setupPanelButtons() {
    // Find/Replace panel
    this.bindEvent('findNextBtn', this.findNext.bind(this));
    this.bindEvent('replaceBtn', this.replaceText.bind(this));
    this.bindEvent('replaceAllBtn', this.replaceAllText.bind(this));
    this.bindEvent('closeFindBtn', () => this.hidePanel('findReplacePanel'));

    // Table panel
    this.bindEvent('createTableBtn', this.createTable.bind(this));
    this.bindEvent('closeTableBtn', () => this.hidePanel('tablePanel'));

    // Link panel
    this.bindEvent('createLinkBtn', this.createLink.bind(this));
    this.bindEvent('closeLinkBtn', () => this.hidePanel('linkPanel'));

    // Other panels
    this.bindEvent('closeSpecialCharBtn', () => this.hidePanel('specialCharPanel'));
    this.bindEvent('closeWordCountBtn', () => this.hidePanel('wordCountPanel'));

    // Context menu actions
    this.bindEvent('contextCut', () => {
      this.execCmd('cut');
      this.hideContextMenu();
    });
    this.bindEvent('contextCopy', () => {
      this.execCmd('copy');
      this.hideContextMenu();
    });
    this.bindEvent('contextPaste', () => {
      this.execCmd('paste');
      this.hideContextMenu();
    });
    this.bindEvent('contextSelectAll', () => {
      this.execCmd('selectAll');
      this.hideContextMenu();
    });
    this.bindEvent('contextAddComment', () => {
      this.addComment();
      this.hideContextMenu();
    });

    // Panel click outside to close
    this.setupPanelClickOutside();
  }

  setupPanelClickOutside() {
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.panel') && !e.target.closest('[data-panel]')) {
        this.hideAllPanels();
      }
    });

    // Prevent panel clicks from propagating
    document.querySelectorAll('.panel').forEach(panel => {
      panel.addEventListener('click', (e) => e.stopPropagation());
    });
  }

  setupContextMenu() {
    document.addEventListener('contextmenu', (e) => {
      if (e.target.closest('[contenteditable]')) {
        e.preventDefault();
        this.showContextMenu(e.pageX, e.pageY);
      }
    });

    document.addEventListener('click', () => this.hideContextMenu());
  }

  setupEditorEvents() {
    // Setup events for initial page
    this.setupPageEvents(document.querySelector('.page'));

    // Track selected editor and current page
    document.addEventListener('click', (e) => {
      const editable = e.target.closest('[contenteditable]');
      if (editable) {
        this.selectedEditor = editable;
        this.updateCurrentPage(editable);
      }
    });

    // Setup input handling with debouncing
    document.addEventListener('input', (e) => {
      if (e.target.classList.contains('editor')) {
        this.handleEditorInput(e.target);
      }
    });

    // Backspace deletes empty page (if not first)
    document.addEventListener('keydown', (e) => {
      const activeEditor = document.activeElement;

      if (
        e.key === 'Backspace' &&
        activeEditor.classList.contains('editor')
      ) {
        // Remove invisible <br> and check if truly empty
        const htmlContent = activeEditor.innerHTML.trim().replace(/<br\s*\/?>/gi, '').replace(/&nbsp;/gi, '').trim();

        if (htmlContent === '') {
          const currentPage = activeEditor.closest('.page');
          const pages = Array.from(document.querySelectorAll('.page'));
          const currentIndex = pages.indexOf(currentPage);

          if (currentIndex > 0) {
            e.preventDefault(); // Prevent default Backspace behavior (e.g., navigating back)
            currentPage.remove();

            // Focus previous editor
            const prevEditor = pages[currentIndex - 1].querySelector('.editor');
            if (prevEditor) {
              prevEditor.focus();
              this.selectedEditor = prevEditor;
            }

            this.updatePageNumbers();
            this.totalPages = document.querySelectorAll('.page').length;
            this.currentPage = Math.min(this.currentPage, this.totalPages);
            this.updateStatusBar();
            this.showToast('Empty page removed');
          }
        }
      }
    });
  }



  setupPageEvents(page) {
    if (!page) return;

    const editor = page.querySelector('.editor');
    const header = page.querySelector('.header');
    const footer = page.querySelector('.footer');

    [editor, header, footer].filter(Boolean).forEach(el => {
      el.addEventListener('focus', () => {
        this.selectedEditor = el;
        this.updateCurrentPage(el); // Update current page on focus
      });

      el.addEventListener('input', () => {
        this.markDocumentAsModified();
        this.updateWordCount();
      });
    });
  }

  handleEditorInput(editor) {
    this.markDocumentAsModified();
    this.updateWordCount();

    // Debounced overflow check
    clearTimeout(this.typingTimer);
    this.typingTimer = setTimeout(() => {
      this.checkPageOverflow(editor);
    }, 500); // Reduced debounce to 500ms for quicker response
  }

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (!e.ctrlKey && !e.metaKey) return;

      const shortcuts = {
        's': () => { e.preventDefault(); this.saveFile(); },
        'o': () => { e.preventDefault(); this.openFile(); },
        'n': () => { e.preventDefault(); this.createNewDocument(); },
        'p': () => { e.preventDefault(); this.printDocument(); },
        'f': () => { e.preventDefault(); this.showFindReplace(); }
      };

      const handler = shortcuts[e.key.toLowerCase()];
      if (handler) handler();
    });
  }

  setupIPCListeners() {
    const ipcEvents = {
      'menu-new': this.createNewDocument.bind(this),
      'menu-open': this.openFile.bind(this),
      'menu-save': this.saveFile.bind(this),
      'menu-save-as': this.saveFileAs.bind(this),
      'menu-export-pdf': this.exportPDF.bind(this),
      'menu-print': this.printDocument.bind(this),
      'menu-find': this.showFindReplace.bind(this),
      'menu-theme-toggle': this.toggleTheme.bind(this)
    };

    Object.entries(ipcEvents).forEach(([event, handler]) => {
      ipcRenderer.on(event, handler);
    });
  }

  setupWindowEvents() {
    window.addEventListener('beforeunload', (e) => {
      if (this.documentModified) {
        e.returnValue = true;
      }
    });

    window.addEventListener('resize', this.handleResize.bind(this));
  }

  // Core editing functions
  execCmd(command, value = null) {
    try {
      document.execCommand(command, false, value);
      if (this.selectedEditor) {
        this.selectedEditor.focus();
      }
      this.markDocumentAsModified();
      this.updateWordCount();
    } catch (error) {
      console.error(`Error executing command ${command}:`, error);
      this.showToast(`Error: Could not execute ${command}`);
    }
  }

  markDocumentAsModified() {
    this.documentModified = true;
    this.updateStatusBar();
  }

  focusFirstEditor() {
    const editor = document.querySelector('.page .editor');
    if (editor) {
      editor.focus();
      this.selectedEditor = editor;
    }
  }

  // UI Update functions
  updateStatusBar() {
    const statusElement = document.getElementById('statusDocInfo');
    if (!statusElement) return;

    let docName = this.currentFilePath ?
      this.currentFilePath.split(/[/\\]/).pop() : 'Untitled Document';

    if (this.documentModified) docName += ' *';
    statusElement.textContent = `${docName} | Page ${this.currentPage} of ${this.totalPages}`;
  }

  updateWordCount() {
    const statusElement = document.getElementById('statusWordCount');
    if (!statusElement) return;

    const allText = this.getAllText();
    const words = allText.trim() ? allText.trim().split(/\s+/).length : 0;
    statusElement.textContent = `Words: ${words}`;
  }

  updateCurrentPage(editable) {
    const page = editable.closest('.page');
    if (page) {
      const pages = Array.from(document.querySelectorAll('.page'));
      this.currentPage = pages.indexOf(page) + 1;
      this.updateStatusBar();
    }
  }

  updateUI() {
    this.updateStatusBar();
    this.updateWordCount();
    this.updatePageNumbers();
  }

  updatePageNumbers() {
    document.querySelectorAll('.page').forEach((page, index) => {
      const pageNumber = page.querySelector('.page-number');
      if (pageNumber) {
        pageNumber.textContent = index + 1;
      }
    });
    this.totalPages = document.querySelectorAll('.page').length;
  }

  // Text and content functions
  getAllText() {
    let allText = '';
    document.querySelectorAll('.editor').forEach(editor => {
      allText += editor.innerText + ' ';
    });
    return allText;
  }

  getAllContent() {
    let content = '';
    document.querySelectorAll('.page .editor').forEach(editor => {
      content += editor.innerHTML;
    });
    return content;
  }

  // Document operations
  createNewDocument() {
    if (this.documentModified) {
      if (!confirm('You have unsaved changes. Do you want to continue without saving?')) {
        return;
      }
    }
    this.resetDocument();
  }

  resetDocument() {
    // Clear all pages except the first one
    const pageContainer = document.getElementById('page-container');
    const firstPage = pageContainer.querySelector('.page');

    if (!firstPage) {
      console.error('No page found to reset');
      return;
    }

    // Remove all pages except first
    Array.from(pageContainer.children).slice(1).forEach(page => page.remove());

    // Clear content of first page
    firstPage.querySelectorAll('[contenteditable]').forEach(el => {
      el.innerHTML = '';
    });

    // Reset state
    this.currentPage = 1;
    this.totalPages = 1;
    this.currentFilePath = null;
    this.documentModified = false;

    // Focus and update UI
    this.focusFirstEditor();
    this.updateUI();
    this.showToast('New document created');
  }

  async openFile() {
    if (this.documentModified) {
      if (!confirm('You have unsaved changes. Do you want to continue without saving?')) {
        return;
      }
    }

    try {
      const result = await ipcRenderer.invoke('open-file');
      if (result) {
        this.loadDocument(result.filePath, result.content);
      }
    } catch (error) {
      console.error('Error opening file:', error);
      this.showToast('Error opening file');
    }
  }

  loadDocument(filePath, content) {
    this.resetDocument();

    // Set content
    const editor = document.querySelector('.editor');
    if (editor) {
      editor.innerHTML = content;
    }

    // Update state
    this.currentFilePath = filePath;
    this.documentModified = false;

    this.updateUI();
    // After loading, ensure all pages are checked for overflow
    this.checkAllPagesForOverflow();
    this.showToast(`Document loaded: ${filePath.split(/[/\\]/).pop()}`);
  }

  saveFile() {
    if (this.currentFilePath) {
      this.saveDocumentToFile(this.currentFilePath);
    } else {
      this.saveFileAs();
    }
  }

  async saveFileAs() {
    try {
      const result = await ipcRenderer.invoke('save-file-as');
      if (result && result.filePath) {
        this.saveDocumentToFile(result.filePath);
      }
    } catch (error) {
      console.error('Error in save as:', error);
      this.showToast('Error saving file');
    }
  }

  async saveDocumentToFile(filePath) {
    try {
      const result = await ipcRenderer.invoke('save-document', {
        filePath: filePath,
        content: this.getAllContent()
      });

      if (result.success) {
        this.currentFilePath = filePath;
        this.documentModified = false;
        this.updateStatusBar();
        this.showToast(`Document saved: ${filePath.split(/[/\\]/).pop()}`);
      } else {
        this.showToast('Error saving document');
      }
    } catch (error) {
      console.error('Error saving document:', error);
      this.showToast('Error saving document');
    }
  }

  async exportPDF() {
    if (!this.currentFilePath) {
      this.showToast('Please save your document first');
      return;
    }

    if (this.documentModified) {
      this.showToast('Please save your changes before exporting to PDF');
      return;
    }

    try {
      const result = await ipcRenderer.invoke('export-pdf', {
        filePath: this.currentFilePath
      });

      if (result.success) {
        this.showToast('PDF exported successfully');
      } else {
        this.showToast('Error exporting PDF');
      }
    } catch (error) {
      console.error('Error exporting PDF:', error);
      this.showToast('Error exporting PDF');
    }
  }

  printDocument() {
    document.body.classList.add('print-mode');
    window.print();
    setTimeout(() => {
      document.body.classList.remove('print-mode');
    }, 1000);
  }

  // Page management
  addPage() {
    const pageContainer = document.getElementById('page-container');
    const pageTemplate = document.querySelector('.page').cloneNode(true);

    // Clear content but keep structure
    pageTemplate.querySelectorAll('[contenteditable]').forEach(el => {
      el.innerHTML = '';
    });

    // Update page number - this will be handled by updatePageNumbers
    // const pageNumber = pageTemplate.querySelector('.page-number');
    // if (pageNumber) {
    //   pageNumber.textContent = this.totalPages;
    // }

    // Add the new page
    pageContainer.appendChild(pageTemplate);

    // Setup events and focus
    this.setupPageEvents(pageTemplate);
    const newEditor = pageTemplate.querySelector('.editor');
    if (newEditor) {
      newEditor.focus();
      this.selectedEditor = newEditor;
    }

    this.updateUI(); // This will correctly update totalPages and page numbers
    this.showToast('New page added');
  }

  // Calculates the actual usable height of a page for content
  calculatePageDimensions() {
    const firstPage = document.querySelector('.page');
    if (firstPage) {
      // Assuming a fixed header/footer height, or calculating it from CSS
      const pageStyle = getComputedStyle(firstPage);
      const editorStyle = getComputedStyle(firstPage.querySelector('.editor'));

      const pageHeight = parseFloat(pageStyle.height);
      const editorPaddingTop = parseFloat(editorStyle.paddingTop);
      const editorPaddingBottom = parseFloat(editorStyle.paddingBottom);
      const editorMarginTop = parseFloat(editorStyle.marginTop);
      const editorMarginBottom = parseFloat(editorStyle.marginBottom);

      // Estimate header/footer height or just subtract a fixed value for margins/padding
      const header = firstPage.querySelector('.header');
      const footer = firstPage.querySelector('.footer');
      let headerHeight = header ? header.offsetHeight : 0;
      let footerHeight = footer ? footer.offsetHeight : 0;

      // Adjust for the page padding/margins if any on the .page element itself
      const pagePaddingTop = parseFloat(pageStyle.paddingTop);
      const pagePaddingBottom = parseFloat(pageStyle.paddingBottom);

      // This calculation needs to be precise based on your CSS.
      // For simplicity, let's assume `pageHeight` is the total fixed height of a page element
      // and we need to subtract space taken by header, footer, and editor's own padding/margins.
      // You might need to adjust this based on your actual page/editor CSS.
      // Example: If page is A4 (1122px) and has 20px top/bottom padding, and editor has 10px top/bottom margin
      // usable height = 1122 - (20*2) - (10*2) - header_height - footer_height
      this.pageHeight = pageHeight - headerHeight - footerHeight - pagePaddingTop - pagePaddingBottom - editorPaddingTop - editorPaddingBottom - editorMarginTop - editorMarginBottom;

      // Ensure a reasonable minimum height
      if (this.pageHeight <= 0) {
        this.pageHeight = 1120; // Fallback
        console.warn('Calculated page height is too small, using fallback.');
      }
      console.log('Calculated usable page height for editor:', this.pageHeight);
    }
  }


  checkPageOverflow(editor) {
    if (!editor) return;

    // Use the dynamically calculated page height
    const page = editor.closest('.page');
    // Ensure the editor has rendered properly before checking scrollHeight
    // Sometimes scrollHeight is 0 or incorrect right after content insertion
    if (editor.scrollHeight === 0 && editor.innerText.trim() !== '') {
        console.log('Editor scrollHeight is 0 but has content. Retrying overflow check.');
        clearTimeout(this.typingTimer);
        this.typingTimer = setTimeout(() => this.checkPageOverflow(editor), 100);
        return;
    }

    // Check if the current editor's content overflows its container
    // `editor.offsetHeight` is the visible height. `editor.scrollHeight` is the full content height.
    // We want to detect if scrollHeight exceeds the available 'this.pageHeight'
    if (editor.scrollHeight > this.pageHeight + 5) { // Add a small buffer
      console.log('Overflow detected in editor:', editor, 'scrollHeight:', editor.scrollHeight, 'pageHeight:', this.pageHeight);
      const currentPageElem = editor.closest('.page');
      const pages = Array.from(document.querySelectorAll('.page'));
      const currentIndex = pages.indexOf(currentPageElem);

      let overflowContent = '';
      // Attempt to find a suitable split point (e.g., last full paragraph or line)
      overflowContent = this.extractOverflowContent(editor, this.pageHeight);

      if (overflowContent.trim() !== '') {
        if (currentIndex === pages.length - 1) { // If it's the last page
          this.addPage();
          const newPageEditor = document.querySelector('.page:last-child .editor');
          if (newPageEditor) {
            newPageEditor.innerHTML = overflowContent;
            // Recursively check the new page for overflow
            this.checkPageOverflow(newPageEditor);
          }
        } else {
          // Move content to the next existing page
          const nextPageEditor = pages[currentIndex + 1].querySelector('.editor');
          if (nextPageEditor) {
            // Prepend overflow content to the next page
            nextPageEditor.innerHTML = overflowContent + nextPageEditor.innerHTML;
            // Recursively check the next page for overflow
            this.checkPageOverflow(nextPageEditor);
          } else {
              // This case should ideally not happen if pages are managed correctly,
              // but as a fallback, add a new page if next one isn't found.
              this.addPage();
              const newPageEditor = document.querySelector('.page:last-child .editor');
              if(newPageEditor) {
                newPageEditor.innerHTML = overflowContent;
                this.checkPageOverflow(newPageEditor);
              }
          }
        }
      }
    }
    // After adjustments, ensure the current page is not empty and update UI
    this.updateUI();
  }

  // Improved overflow extraction, attempts to break at block-level elements or lines
  extractOverflowContent(editor, maxHeight) {
    const tempDiv = document.createElement('div');
    tempDiv.style.cssText = `
      position: absolute;
      visibility: hidden;
      width: ${editor.clientWidth}px; /* Use clientWidth for accurate width */
      font: ${getComputedStyle(editor).font};
      line-height: ${getComputedStyle(editor).lineHeight};
      box-sizing: border-box; /* Crucial for consistent sizing */
      padding: ${getComputedStyle(editor).padding};
      border: ${getComputedStyle(editor).border};
      margin: ${getComputedStyle(editor).margin};
    `;
    tempDiv.innerHTML = editor.innerHTML;
    document.body.appendChild(tempDiv);

    let overflowHTML = '';
    const originalNodes = Array.from(editor.childNodes);
    const tempNodes = Array.from(tempDiv.childNodes);
    let currentHeight = 0;
    let splitIndex = -1;

    for (let i = 0; i < tempNodes.length; i++) {
        const node = tempNodes[i];
        const nodeHeight = node.offsetHeight;

        if (currentHeight + nodeHeight > maxHeight) {
            splitIndex = i;
            break;
        }
        currentHeight += nodeHeight;
    }

    if (splitIndex !== -1) {
        // Collect overflow content from tempDiv
        for (let i = splitIndex; i < tempNodes.length; i++) {
            overflowHTML += tempNodes[i].outerHTML || tempNodes[i].textContent;
        }

        // Remove overflow content from the original editor
        // We need to carefully remove corresponding nodes from the actual editor
        while (editor.childNodes.length > splitIndex) {
            editor.removeChild(editor.childNodes[splitIndex]);
        }
        // Ensure the editor doesn't become completely empty with no focusable content
        if (editor.innerHTML.trim() === '') {
            editor.innerHTML = '<br>'; // Keep a break tag for focus and typing
        }
    }

    document.body.removeChild(tempDiv);
    return overflowHTML;
  }

  // Call this after loading content to ensure all pages are correctly flowed
  checkAllPagesForOverflow() {
    document.querySelectorAll('.page .editor').forEach(editor => {
        this.checkPageOverflow(editor);
    });
  }

  setupAutoPageBreak() {
    // Simple mutation observer for content changes
    // This now debounces to checkPageOverflow directly
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        const target = mutation.target;
        if (target.classList && target.classList.contains('editor')) {
          clearTimeout(this.typingTimer);
          this.typingTimer = setTimeout(() => this.checkPageOverflow(target), 500);
        }
      });
    });

    document.querySelectorAll('.editor').forEach(editor => {
      observer.observe(editor, { childList: true, subtree: true, characterData: true });
    });
  }

  // Insert functions
  insertLink() {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const selectedText = selection.toString();
      const linkTextInput = document.getElementById('linkText');
      if (selectedText && linkTextInput) {
        linkTextInput.value = selectedText;
      }
    }
    this.showPanel('linkPanel');
  }

  createLink() {
    const text = document.getElementById('linkText')?.value || '';
    const url = document.getElementById('linkUrl')?.value || '';

    if (url) {
      const html = `<a href="${url}" target="_blank">${text || url}</a>`;
      this.execCmd('insertHTML', html);
    }
    this.hidePanel('linkPanel');
  }

  async insertImage() {
    try {
      const result = await ipcRenderer.invoke('select-image');
      if (result && result.filePath) {
        const imgTag = `<img src="${result.filePath}" alt="Image" style="max-width: 100%; display: block; margin: 5px 0;" />`; // Added display:block and margin
        this.execCmd('insertHTML', imgTag);
      }
    } catch (error) {
      console.error('Error inserting image:', error);
      this.showToast('Error inserting image');
    }
  }

  insertTable() {
    this.showPanel('tablePanel');
  }

  createTable() {
    const rows = parseInt(document.getElementById('tableRows')?.value) || 2;
    const cols = parseInt(document.getElementById('tableCols')?.value) || 2;

    let tableHTML = '<table style="width:100%; border-collapse: collapse;">';

    // Header row
    tableHTML += '<thead><tr>';
    for (let i = 0; i < cols; i++) {
      tableHTML += `<th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Header ${i + 1}</th>`;
    }
    tableHTML += '</tr></thead><tbody>';

    // Data rows
    for (let i = 0; i < rows - 1; i++) {
      tableHTML += '<tr>';
      for (let j = 0; j < cols; j++) {
        tableHTML += `<td style="border: 1px solid #ddd; padding: 8px;">Cell ${i + 1}-${j + 1}</td>`;
      }
      tableHTML += '</tr>';
    }

    tableHTML += '</tbody></table><p><br></p>'; // Add a paragraph after table for easier typing
    this.execCmd('insertHTML', tableHTML);
    this.hidePanel('tablePanel');
  }

  insertSpecialChar() {
    this.showPanel('specialCharPanel');
  }

  initializeSpecialChars() {
    const specialChars = [
      '©', '®', '™', '€', '£', '¥', '¢', '§', '¶', '°', '±', '÷', '×',
      '≠', '≤', '≥', '∑', '√', '∞', '∝', '∂', '∫', 'Α', 'Β', 'Γ', 'Δ',
      'Ω', 'α', 'β', 'γ', 'δ', 'ω', '←', '→', '↑', '↓', '↔', '⇐',
      '⇒', '⇔', '♠', '♣', '♥', '♦'
    ];

    const grid = document.querySelector('.special-chars-grid');
    if (grid) {
      grid.innerHTML = '';
      specialChars.forEach(char => {
        const btn = document.createElement('button');
        btn.innerHTML = char;
        btn.onclick = () => {
          this.execCmd('insertHTML', char);
          this.hidePanel('specialCharPanel');
        };
        grid.appendChild(btn);
      });
    }
  }

  // Tools and utilities
  countWords() {
    const allText = this.getAllText();
    const words = allText.trim() ? allText.trim().split(/\s+/).length : 0;
    const charNoSpaces = allText.replace(/\s+/g, '').length;
    const charWithSpaces = allText.length;
    const paragraphs = allText.split(/\n\s*\n/).filter(p => p.trim().length > 0).length;

    const elements = {
      'wordCount': words,
      'charCountNoSpace': charNoSpaces,
      'charCountWithSpace': charWithSpaces,
      'paragraphCount': paragraphs
    };

    Object.entries(elements).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element) element.textContent = value;
    });

    this.showPanel('wordCountPanel');
  }

  showFindReplace() {
    this.showPanel('findReplacePanel');
    const findInput = document.getElementById('findText');
    if (findInput) findInput.focus();
  }

  findNext() {
    const searchText = document.getElementById('findText')?.value;
    if (!searchText) return;

    const matchCase = document.getElementById('matchCase')?.checked || false;
    const wholeWord = document.getElementById('wholeWord')?.checked || false;

    if (window.find) {
      window.find(searchText, matchCase, false, true, wholeWord, false, false);
    } else {
      this.showToast('Find function is not supported in this environment.');
    }
  }

  replaceText() {
    const searchText = document.getElementById('findText')?.value;
    const replaceTextVal = document.getElementById('replaceText')?.value;

    if (!searchText) return;

    const matchCase = document.getElementById('matchCase')?.checked || false;
    const selected = window.getSelection().toString();
    const selectedMatch = matchCase ? selected : selected.toLowerCase();
    const searchTextMatch = matchCase ? searchText : searchText.toLowerCase();

    if (selectedMatch === searchTextMatch) {
      this.execCmd('insertText', replaceTextVal);
      this.findNext();
    } else {
      this.findNext();
    }
  }

  replaceAllText() {
    const searchText = document.getElementById('findText')?.value;
    const replaceTextVal = document.getElementById('replaceText')?.value;

    if (!searchText) return;

    const matchCase = document.getElementById('matchCase')?.checked || false;
    const wholeWord = document.getElementById('wholeWord')?.checked || false;

    let count = 0;
    document.querySelectorAll('.editor').forEach(editor => {
      let content = editor.innerHTML;
      let flags = 'g';
      if (!matchCase) flags += 'i';

      let regex;
      if (wholeWord) {
        regex = new RegExp(`\\b${this.escapeRegExp(searchText)}\\b`, flags);
      } else {
        regex = new RegExp(this.escapeRegExp(searchText), flags);
      }

      const matches = content.match(regex);
      if (matches) count += matches.length;

      content = content.replace(regex, replaceTextVal);
      editor.innerHTML = content;
    });

    this.showToast(`Replaced ${count} occurrences.`);
    this.markDocumentAsModified();
  }

  escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  toggleSpellCheck() {
    const editors = document.querySelectorAll('.editor');
    const spellCheckEnabled = editors[0]?.spellcheck || false;

    editors.forEach(editor => {
      editor.spellcheck = !spellCheckEnabled;
    });

    const button = document.getElementById('spellCheckBtn');
    if (button) button.classList.toggle('active');

    this.showToast(`Spell check ${!spellCheckEnabled ? 'enabled' : 'disabled'}`);
  }
  addComment() {
    const selection = window.getSelection();
    if (selection.rangeCount > 0 && selection.toString()) {
      const comment = prompt('Add a comment:');
      if (comment) {
        const span = document.createElement('span');
        span.className = 'comment';
        span.title = comment;
        span.style.cssText = 'background-color: yellow; cursor: help;';

        try {
          const range = selection.getRangeAt(0);
          range.surroundContents(span);
          this.markDocumentAsModified();
          this.showToast('Comment added');
        } catch (error) {
          console.error('Error adding comment:', error);
          this.showToast('Could not add comment to selection');
        }
      }
    } else {
      this.showToast('Please select text to add a comment');
    }
  }

  toggleReadingMode() {
    document.body.classList.toggle('reading-mode');
    const button = document.getElementById('readingModeBtn');
    if (button) {
      button.classList.toggle('active');
      const isActive = button.classList.contains('active');
      this.showToast(`Reading mode ${isActive ? 'enabled' : 'disabled'}`);
    }
  }

  // Header/Footer functions
  toggleHeaderFooter(type) {
    const elements = document.querySelectorAll(`.${type}`);
    const isVisible = elements[0]?.style.display !== 'none';

    elements.forEach(element => {
      element.style.display = isVisible ? 'none' : 'block';
    });

    const button = document.getElementById(`toggle${type.charAt(0).toUpperCase() + type.slice(1)}`);
    if (button) {
      button.classList.toggle('active');
    }

    this.showToast(`${type.charAt(0).toUpperCase() + type.slice(1)} ${isVisible ? 'hidden' : 'shown'}`);
    this.markDocumentAsModified();
  }

  // Theme and appearance
  initializeTheme() {
    const savedTheme = localStorage.getItem('documentEditorTheme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    this.updateThemeButton();
  }

  toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', currentTheme);
    localStorage.setItem('documentEditorTheme', currentTheme);
    this.updateThemeButton();
    this.showToast(`${currentTheme === 'dark' ? 'Dark' : 'Light'} theme activated`);
  }


  updateThemeButton() {
    const button = document.getElementById('themeToggle');
    if (button) {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark'; // Check documentElement attribute
      button.innerHTML = isDark ? '☀️' : '🌙';
      button.title = `Switch to ${isDark ? 'light' : 'dark'} theme`;
    }
  }

  changeLineSpacing(spacing) {
    if (!this.selectedEditor) return;

    const spacingMap = {
      '1': '1',
      '1.15': '1.15',
      '1.5': '1.5',
      '2': '2'
    };

    const lineHeight = spacingMap[spacing] || '1';
    this.selectedEditor.style.lineHeight = lineHeight;
    this.markDocumentAsModified();
  }

  changeZoom(zoomLevel) {
    const pageContainer = document.getElementById('page-container');
    if (pageContainer) {
      const zoom = parseInt(zoomLevel) / 100;
      pageContainer.style.transform = `scale(${zoom})`;
      pageContainer.style.transformOrigin = 'top center';

      // Adjust container width to prevent horizontal scrolling
      // This is a common issue with `transform: scale` if not managed
      if (zoom !== 1) {
        // Calculate the scaled width and apply to the container
        // Assuming the page container itself doesn't have a fixed width set in CSS
        const originalWidth = pageContainer.offsetWidth; // Get current rendered width
        pageContainer.style.width = `${originalWidth / zoom}px`; // Adjust its own width
        // Or if you want to scale the page elements themselves:
        // document.querySelectorAll('.page').forEach(page => {
        //     page.style.width = `${(page.clientWidth / zoom)}px`; // Adjust individual page widths
        // });
      } else {
        pageContainer.style.width = ''; // Reset to default
      }
      this.calculatePageDimensions(); // Recalculate page height after zoom
      this.checkAllPagesForOverflow(); // Re-check overflow
    }
  }

  // Panel management
  showPanel(panelId) {
    this.hideAllPanels();
    const panel = document.getElementById(panelId);
    if (panel) {
      panel.style.display = 'block';

      // Focus first input in the panel
      const firstInput = panel.querySelector('input, textarea');
      if (firstInput) {
        setTimeout(() => firstInput.focus(), 100);
      }
    }
  }

  hidePanel(panelId) {
    const panel = document.getElementById(panelId);
    if (panel) {
      panel.style.display = 'none';
    }
  }

  hideAllPanels() {
    document.querySelectorAll('.panel').forEach(panel => {
      panel.style.display = 'none';
    });
  }

  // Context menu
  showContextMenu(x, y) {
    const contextMenu = document.getElementById('contextMenu');
    if (!contextMenu) return;

    contextMenu.style.display = 'block';
    contextMenu.style.left = `${x}px`;
    contextMenu.style.top = `${y}px`;

    // Adjust position if menu goes off screen
    const rect = contextMenu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      contextMenu.style.left = `${x - rect.width}px`;
    }
    if (rect.bottom > window.innerHeight) {
      contextMenu.style.top = `${y - rect.height}px`;
    }
  }

  hideContextMenu() {
    const contextMenu = document.getElementById('contextMenu');
    if (contextMenu) {
      contextMenu.style.display = 'none';
    }
  }

  // Mobile responsiveness
  setupMobileResponsiveness() {
    const handleMobileResize = () => {
      const isMobile = window.innerWidth <= 768;
      document.body.classList.toggle('mobile-layout', isMobile);

      if (isMobile) {
        // Collapse toolbar sections on mobile (you might need to implement this CSS)
        document.querySelectorAll('.toolbar-section').forEach(section => {
          section.classList.add('collapsed');
        });
      } else {
         document.querySelectorAll('.toolbar-section').forEach(section => {
          section.classList.remove('collapsed');
        });
      }
    };

    handleMobileResize();
    window.addEventListener('resize', handleMobileResize);
  }

  handleResize() {
    // Recalculate page layouts if needed
    this.setupMobileResponsiveness();
    this.calculatePageDimensions(); // Re-calculate page dimensions on resize
    this.checkAllPagesForOverflow(); // Re-check overflow on all pages
  }

  // Toast notifications
  showToast(message, duration = 3000) {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');

    if (toast && toastMessage) {
      toastMessage.textContent = message;
      toast.classList.add('show');

      setTimeout(() => {
        toast.classList.remove('show');
      }, duration);
    }
  }

  // Utility functions
  generateUniqueId() {
    return 'id_' + Math.random().toString(36).substr(2, 9);
  }

  sanitizeHTML(html) {
    const temp = document.createElement('div');
    temp.innerHTML = html;

    // Remove script tags and event handlers
    temp.querySelectorAll('script').forEach(script => script.remove());
    temp.querySelectorAll('*').forEach(el => {
      Array.from(el.attributes).forEach(attr => {
        if (attr.name.startsWith('on')) {
          el.removeAttribute(attr.name);
        }
      });
    });

    return temp.innerHTML;
  }

  // Export functions for external access
  getDocumentData() {
    return {
      content: this.getAllContent(),
      text: this.getAllText(),
      modified: this.documentModified,
      filePath: this.currentFilePath,
      wordCount: this.getAllText().trim().split(/\s+/).length,
      pageCount: this.totalPages
    };
  }

  loadFromData(data) {
    if (data.content) {
      this.loadDocument(data.filePath || null, data.content);
    }
  }

  // Auto-save functionality
  setupAutoSave() {
    setInterval(() => {
      if (this.documentModified && this.currentFilePath) {
        this.autoSave();
      }
    }, 30000); // Auto-save every 30 seconds
  }

  async autoSave() {
    try {
      const result = await ipcRenderer.invoke('auto-save-document', {
        filePath: this.currentFilePath,
        content: this.getAllContent()
      });

      if (result.success) {
        console.log('Document auto-saved');
      }
    } catch (error) {
      console.error('Auto-save failed:', error);
    }
  }

  // Format preservation
  preserveFormatting() {
    document.querySelectorAll('.editor').forEach(editor => {
      // Ensure formatting is preserved when content changes
      editor.addEventListener('paste', (e) => {
        e.preventDefault();
        const text = e.clipboardData.getData('text/html') || e.clipboardData.getData('text/plain');
        const sanitizedHTML = this.sanitizeHTML(text);
        this.execCmd('insertHTML', sanitizedHTML);
      });
    });
  }

  // Cleanup function
  destroy() {
    // Remove event listeners
    clearTimeout(this.typingTimer);

    // Remove IPC listeners
    const events = ['menu-new', 'menu-open', 'menu-save', 'menu-save-as', 'menu-export-pdf', 'menu-print', 'menu-find', 'menu-theme-toggle'];
    events.forEach(event => {
      ipcRenderer.removeAllListeners(event);
    });

    // Remove window event listeners
    window.removeEventListener('beforeunload', (e) => { if (this.documentModified) e.returnValue = true; });
    window.removeEventListener('resize', this.handleResize.bind(this));
    window.removeEventListener('resize', this.calculatePageDimensions.bind(this));


    console.log('Document Editor destroyed');
  }
}

// Initialize the document editor when the script loads
const documentEditor = new DocumentEditor();

// Export for potential external access
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DocumentEditor;
}

// Make it available globally for debugging
window.DocumentEditor = documentEditor;