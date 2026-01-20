/**
 * NorthOffice - Online Word Processor
 * Built with jQuery 4.0.0
 */

$(function () {
    'use strict';

    // ========================================
    // State Management
    // ========================================
    const state = {
        isDark: false,
        zoom: 100,
        lastSaved: null,
        autoSaveTimer: null,
        hasUnsavedChanges: false,
        currentFilePath: null  // Path in virtual filesystem
    };

    // Cache DOM elements
    const $editor = $('#editor');
    const $docTitle = $('#docTitle');
    const $wordCount = $('#wordCount');
    const $charCount = $('#charCount');
    const $saveStatus = $('#saveStatus');
    const $zoomLevel = $('#zoomLevel');
    const $zoomSlider = $('#zoomSlider');

    // ========================================
    // Theme Management
    // ========================================
    $('#themeToggle').on('click', function () {
        state.isDark = !state.isDark;
        $('html').attr('data-theme', state.isDark ? 'dark' : 'light');
        $(this).find('i').toggleClass('fa-moon fa-sun');
        localStorage.setItem('northoffice-theme', state.isDark ? 'dark' : 'light');
    });

    // Load saved theme
    const savedTheme = localStorage.getItem('northoffice-theme');
    if (savedTheme === 'dark') {
        state.isDark = true;
        $('html').attr('data-theme', 'dark');
        $('#themeToggle i').removeClass('fa-moon').addClass('fa-sun');
    }

    // ========================================
    // Word & Character Count
    // ========================================
    function updateCounts() {
        const text = $editor.text().trim();
        const words = text ? text.split(/\s+/).length : 0;
        const chars = text.length;
        $wordCount.text(words);
        $charCount.text(chars);
    }

    $editor.on('input', function () {
        updateCounts();
        markUnsaved();
    });

    // ========================================
    // Auto-save functionality
    // ========================================
    function markUnsaved() {
        state.hasUnsavedChanges = true;
        $saveStatus.html('<i class="fas fa-circle" style="color: var(--color-warning);"></i> Osparade ändringar');

        // Auto-save after 2 seconds of inactivity
        clearTimeout(state.autoSaveTimer);
        state.autoSaveTimer = setTimeout(saveToLocalStorage, 2000);
    }

    function saveToLocalStorage() {
        const data = {
            title: $docTitle.val(),
            content: $editor.html(),
            lastSaved: new Date().toISOString()
        };
        localStorage.setItem('northoffice-document', JSON.stringify(data));

        // Also save to virtual filesystem if we have a file path
        if (state.currentFilePath && typeof NorthFS !== 'undefined') {
            saveToFilesystem();
        }

        state.hasUnsavedChanges = false;
        $saveStatus.html('<i class="fas fa-check-circle"></i> Sparad');
    }

    async function saveToFilesystem() {
        if (!state.currentFilePath) return;

        const content = {
            title: $docTitle.val(),
            html: $editor.html(),
            lastSaved: new Date().toISOString()
        };

        const pathParts = state.currentFilePath.split('/');
        const fileName = pathParts.pop();
        const parentPath = pathParts.join('/') || '/';

        await NorthFS.saveFile(fileName, parentPath, content);
    }

    // Save to filesystem with dialog
    async function saveToFilesystemDialog() {
        if (typeof NorthFS === 'undefined') {
            alert('Filsystemet är inte tillgängligt.');
            return;
        }

        try {
            await NorthFS.init();
            await NorthFS.ensureRoot();

            // Get all folders for the folder picker
            const allFiles = await NorthFS.getAllFiles();
            const folders = allFiles.filter(f => f.type === NorthFS.FILE_TYPES.FOLDER);

            // Create modal HTML
            const modalHtml = `
                <div class="modal active" id="saveToFsModal">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h3>Spara till filsystemet</h3>
                            <button class="modal-close" id="closeSaveToFsModal">&times;</button>
                        </div>
                        <div class="modal-body">
                            <div class="form-group">
                                <label for="saveFileName">Filnamn</label>
                                <input type="text" id="saveFileName" value="${$docTitle.val() || 'Namnlöst dokument'}.words" placeholder="dokument.words">
                            </div>
                            <div class="form-group">
                                <label for="saveFolderPath">Mapp</label>
                                <select id="saveFolderPath" class="toolbar-select" style="width: 100%; padding: 8px;">
                                    <option value="/">/</option>
                                    ${folders.map(f => `<option value="${f.path}">${f.path}</option>`).join('')}
                                </select>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button class="btn btn-secondary" id="cancelSaveToFs">Avbryt</button>
                            <button class="btn btn-primary" id="confirmSaveToFs">Spara</button>
                        </div>
                    </div>
                </div>
            `;

            // Remove any existing modal
            $('#saveToFsModal').remove();
            $('body').append(modalHtml);

            // Handle cancel/close
            $('#closeSaveToFsModal, #cancelSaveToFs').on('click', function () {
                $('#saveToFsModal').remove();
            });

            // Handle save
            $('#confirmSaveToFs').on('click', async function () {
                let fileName = $('#saveFileName').val().trim();
                const folderPath = $('#saveFolderPath').val();

                if (!fileName) {
                    alert('Ange ett filnamn.');
                    return;
                }

                // Ensure .words extension
                if (!fileName.endsWith('.words')) {
                    fileName += '.words';
                }

                const content = {
                    title: $docTitle.val(),
                    html: $editor.html(),
                    lastSaved: new Date().toISOString()
                };

                try {
                    await NorthFS.saveFile(fileName, folderPath, content);
                    state.currentFilePath = folderPath === '/' ? `/${fileName}` : `${folderPath}/${fileName}`;
                    $saveStatus.html('<i class="fas fa-check-circle"></i> Sparad till filsystemet');
                    $('#saveToFsModal').remove();
                } catch (e) {
                    console.error('Failed to save to filesystem:', e);
                    alert('Kunde inte spara filen: ' + e.message);
                }
            });

        } catch (e) {
            console.error('Failed to open save dialog:', e);
            alert('Kunde inte öppna sparadialogen: ' + e.message);
        }
    }

    function loadFromLocalStorage() {
        const saved = localStorage.getItem('northoffice-document');
        if (saved) {
            try {
                const data = JSON.parse(saved);
                $docTitle.val(data.title || 'Namnlöst dokument');
                $editor.html(data.content || '');
                updateCounts();
            } catch (e) {
                console.error('Failed to load saved document:', e);
            }
        }
    }

    async function loadFromFilesystem(filePath) {
        try {
            await NorthFS.init();
            const file = await NorthFS.getFile(filePath);
            if (file && file.content) {
                state.currentFilePath = filePath;
                $docTitle.val(file.content.title || file.name.replace('.words', ''));
                $editor.html(file.content.html || '');
                updateCounts();
                $saveStatus.html('<i class="fas fa-check-circle"></i> Öppnad från filsystemet');
            }
        } catch (e) {
            console.error('Failed to load from filesystem:', e);
        }
    }

    // Check if we should load a file from URL parameter
    async function initializeDocument() {
        const urlParams = new URLSearchParams(window.location.search);
        const filePath = urlParams.get('file');

        if (filePath && typeof NorthFS !== 'undefined') {
            await loadFromFilesystem(filePath);
        } else {
            loadFromLocalStorage();
        }
    }

    // Load saved document on startup
    initializeDocument();

    // ========================================
    // Formatting Commands
    // ========================================
    function execCommand(command, value = null) {
        document.execCommand(command, false, value);
        $editor.focus();
        updateButtonStates();
    }

    // Text formatting buttons
    $('#boldBtn').on('click', () => execCommand('bold'));
    $('#italicBtn').on('click', () => execCommand('italic'));
    $('#underlineBtn').on('click', () => execCommand('underline'));
    $('#strikeBtn').on('click', () => execCommand('strikeThrough'));

    // Alignment
    $('#alignLeftBtn').on('click', () => execCommand('justifyLeft'));
    $('#alignCenterBtn').on('click', () => execCommand('justifyCenter'));
    $('#alignRightBtn').on('click', () => execCommand('justifyRight'));
    $('#alignJustifyBtn').on('click', () => execCommand('justifyFull'));

    // Lists
    $('#ulBtn').on('click', () => execCommand('insertUnorderedList'));
    $('#olBtn').on('click', () => execCommand('insertOrderedList'));
    $('#indentBtn').on('click', () => execCommand('indent'));
    $('#outdentBtn').on('click', () => execCommand('outdent'));

    // Undo/Redo
    $('#undoBtn').on('click', () => execCommand('undo'));
    $('#redoBtn').on('click', () => execCommand('redo'));

    // Clear formatting
    $('#clearFormatBtn').on('click', () => execCommand('removeFormat'));

    // Horizontal rule
    $('#hrBtn').on('click', () => execCommand('insertHorizontalRule'));

    // Font family
    $('#fontFamily').on('change', function () {
        execCommand('fontName', $(this).val());
    });

    // Font size
    $('#fontSize').on('change', function () {
        const size = $(this).val();
        document.execCommand('fontSize', false, '7');
        const fontElements = $editor.find('font[size="7"]');
        fontElements.removeAttr('size').css('font-size', size);
        $editor.focus();
    });

    // Text color
    $('#textColorBtn').on('click', function () {
        $('#textColor').trigger('click');
    });

    $('#textColor').on('input', function () {
        const color = $(this).val();
        execCommand('foreColor', color);
        $('#textColorIndicator').css('background', color);
    });

    // Background color
    $('#bgColorBtn').on('click', function () {
        $('#bgColor').trigger('click');
    });

    $('#bgColor').on('input', function () {
        const color = $(this).val();
        execCommand('hiliteColor', color);
        $('#bgColorIndicator').css('background', color);
    });

    // Update button states based on selection
    function updateButtonStates() {
        $('#boldBtn').toggleClass('active', document.queryCommandState('bold'));
        $('#italicBtn').toggleClass('active', document.queryCommandState('italic'));
        $('#underlineBtn').toggleClass('active', document.queryCommandState('underline'));
        $('#strikeBtn').toggleClass('active', document.queryCommandState('strikeThrough'));
    }

    $editor.on('keyup mouseup', updateButtonStates);

    // ========================================
    // Keyboard Shortcuts
    // ========================================
    $(document).on('keydown', function (e) {
        if (e.ctrlKey || e.metaKey) {
            switch (e.key.toLowerCase()) {
                case 's':
                    e.preventDefault();
                    saveToLocalStorage();
                    break;
                case 'b':
                    e.preventDefault();
                    execCommand('bold');
                    break;
                case 'i':
                    e.preventDefault();
                    execCommand('italic');
                    break;
                case 'u':
                    e.preventDefault();
                    execCommand('underline');
                    break;
            }
        }
    });

    // ========================================
    // Modal Handling
    // ========================================
    function openModal(modalId) {
        $(`#${modalId}`).addClass('active');
    }

    function closeModal(modalId) {
        $(`#${modalId}`).removeClass('active');
    }

    // Link Modal
    $('#linkBtn').on('click', function () {
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            $('#linkText').val(selection.toString());
        }
        openModal('linkModal');
    });

    $('#closeLinkModal, #cancelLink').on('click', () => closeModal('linkModal'));

    $('#insertLink').on('click', function () {
        const text = $('#linkText').val();
        const url = $('#linkUrl').val();
        if (url) {
            const link = `<a href="${url}" target="_blank">${text || url}</a>`;
            execCommand('insertHTML', link);
        }
        closeModal('linkModal');
        $('#linkText').val('');
        $('#linkUrl').val('');
    });

    // Image Modal
    $('#imageBtn').on('click', () => openModal('imageModal'));
    $('#closeImageModal, #cancelImage').on('click', () => closeModal('imageModal'));

    $('#insertImage').on('click', function () {
        const url = $('#imageUrl').val();
        const alt = $('#imageAlt').val();
        if (url) {
            const img = `<img src="${url}" alt="${alt || ''}" style="max-width: 100%;">`;
            execCommand('insertHTML', img);
        }
        closeModal('imageModal');
        $('#imageUrl').val('');
        $('#imageAlt').val('');
    });

    // Table Modal
    $('#tableBtn').on('click', () => openModal('tableModal'));
    $('#closeTableModal, #cancelTable').on('click', () => closeModal('tableModal'));

    $('#insertTable').on('click', function () {
        const rows = parseInt($('#tableRows').val()) || 3;
        const cols = parseInt($('#tableCols').val()) || 3;

        let table = '<table><tbody>';
        for (let i = 0; i < rows; i++) {
            table += '<tr>';
            for (let j = 0; j < cols; j++) {
                const tag = i === 0 ? 'th' : 'td';
                table += `<${tag}>&nbsp;</${tag}>`;
            }
            table += '</tr>';
        }
        table += '</tbody></table>';

        execCommand('insertHTML', table);
        closeModal('tableModal');
    });

    // Close modals on overlay click
    $('.modal').on('click', function (e) {
        if (e.target === this) {
            $(this).removeClass('active');
        }
    });

    // ========================================
    // File Operations
    // ========================================
    // New document
    $('#newDocBtn').on('click', function () {
        if (state.hasUnsavedChanges) {
            if (!confirm('Du har osparade ändringar. Vill du skapa ett nytt dokument ändå?')) {
                return;
            }
        }
        $editor.html('');
        $docTitle.val('Namnlöst dokument');
        localStorage.removeItem('northoffice-document');
        updateCounts();
        $saveStatus.html('<i class="fas fa-check-circle"></i> Nytt dokument');
    });

    // Open document
    $('#openDocBtn').on('click', () => $('#fileInput').trigger('click'));

    $('#fileInput').on('change', function (e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function (e) {
            const content = e.target.result;
            if (file.name.endsWith('.html')) {
                $editor.html(content);
            } else {
                $editor.text(content);
            }
            $docTitle.val(file.name.replace(/\.[^/.]+$/, ''));
            updateCounts();
            $saveStatus.html('<i class="fas fa-check-circle"></i> Öppnad');
        };
        reader.readAsText(file);
        $(this).val('');
    });

    // Save document
    $('#saveDocBtn').on('click', function () {
        saveToLocalStorage();

        const title = $docTitle.val() || 'dokument';
        const content = $editor.html();
        const blob = new Blob([content], { type: 'text/html' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `${title}.html`;
        a.click();
        URL.revokeObjectURL(url);
    });

    // Save to filesystem
    $('#saveToFsBtn').on('click', function () {
        saveToFilesystemDialog();
    });

    // Export as text
    $('#exportPdfBtn').on('click', function () {
        const title = $docTitle.val() || 'dokument';
        const content = $editor.text();
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `${title}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    });

    // Print
    $('#printBtn').on('click', () => window.print());

    // ========================================
    // Zoom Controls
    // ========================================
    function setZoom(level) {
        state.zoom = Math.max(50, Math.min(200, level));
        const scale = state.zoom / 100;

        $('.page-container').css('transform', `scale(${scale})`);
        $('.page-container').css('transform-origin', 'top center');

        $zoomLevel.text(`${state.zoom}%`);
        $zoomSlider.val(state.zoom);
    }

    $zoomSlider.on('input', function () {
        setZoom(parseInt($(this).val()));
    });

    $('#zoomInBtn').on('click', () => setZoom(state.zoom + 10));
    $('#zoomOutBtn').on('click', () => setZoom(state.zoom - 10));

    // ========================================
    // Title input handling
    // ========================================
    $docTitle.on('input', markUnsaved);

    // ========================================
    // Initialize
    // ========================================
    updateCounts();
    console.log('NorthOffice initialized with jQuery', $.fn.jquery);
});
