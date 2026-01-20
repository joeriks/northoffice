/**
 * Files - File Manager for NorthOffice
 * Built with jQuery 4.0.0
 */

$(function () {
    'use strict';

    // State
    const state = {
        currentPath: '/',
        selectedFile: null,
        isDark: false,
        viewMode: 'grid' // 'grid' or 'list'
    };

    // Cache DOM
    const $filesGrid = $('#filesGrid');
    const $emptyState = $('#emptyState');
    const $breadcrumb = $('#breadcrumb');
    const $itemCount = $('#itemCount');
    const $selectedInfo = $('#selectedInfo');
    const $contextMenu = $('#contextMenu');

    // ========================================
    // Initialize
    // ========================================
    async function init() {
        await NorthFS.init();
        await NorthFS.ensureRoot();

        // Create default folders if empty
        const rootContents = await NorthFS.listFolder('/');
        if (rootContents.length === 0) {
            await NorthFS.createFolder('Dokument', '/');
            await NorthFS.createFolder('Kalkylark', '/');
        }

        await loadFolder('/');
        loadTheme();
    }

    // ========================================
    // Load and Render Folder
    // ========================================
    async function loadFolder(path) {
        state.currentPath = path;
        state.selectedFile = null;
        updateToolbarState();

        const items = await NorthFS.listFolder(path);
        renderBreadcrumb(path);
        renderFiles(items);

        $itemCount.text(`${items.length} objekt`);
        $selectedInfo.text('');
    }

    function renderBreadcrumb(path) {
        const parts = path.split('/').filter(p => p);
        let html = `<span class="breadcrumb-item" data-path="/">Root</span>`;

        let currentPath = '';
        parts.forEach((part, index) => {
            currentPath += '/' + part;
            html += `<span class="breadcrumb-separator">/</span>`;
            html += `<span class="breadcrumb-item" data-path="${currentPath}">${part}</span>`;
        });

        $breadcrumb.html(html);
    }

    function renderFiles(items) {
        if (items.length === 0) {
            $filesGrid.hide();
            $emptyState.show();
            return;
        }

        $emptyState.hide();
        $filesGrid.show();

        let html = '';
        items.forEach(item => {
            const icon = NorthFS.getFileIcon(item.type);
            const color = NorthFS.getFileColor(item.type);
            const isFolder = item.type === NorthFS.FILE_TYPES.FOLDER;

            if (state.viewMode === 'grid') {
                html += `
                    <div class="file-item" data-path="${item.path}" data-type="${item.type}">
                        <i class="fas ${icon} file-icon" style="color: ${color}"></i>
                        <span class="file-name">${escapeHtml(item.name)}</span>
                    </div>
                `;
            } else {
                html += `
                    <div class="file-item" data-path="${item.path}" data-type="${item.type}">
                        <i class="fas ${icon} file-icon" style="color: ${color}"></i>
                        <span class="file-name">${escapeHtml(item.name)}</span>
                        <div class="file-meta">
                            <span>${isFolder ? 'Mapp' : NorthFS.formatSize(item.size || 0)}</span>
                            <span>${NorthFS.formatDate(item.modified)}</span>
                        </div>
                    </div>
                `;
            }
        });

        $filesGrid.html(html);
    }

    function escapeHtml(str) {
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // ========================================
    // File Selection & Navigation
    // ========================================
    $filesGrid.on('click', '.file-item', function (e) {
        e.stopPropagation();

        $('.file-item').removeClass('selected');
        $(this).addClass('selected');

        state.selectedFile = $(this).data('path');
        updateToolbarState();

        const type = $(this).data('type');
        $selectedInfo.text(state.selectedFile);
    });

    $filesGrid.on('dblclick', '.file-item', async function () {
        const path = $(this).data('path');
        const type = $(this).data('type');

        if (type === NorthFS.FILE_TYPES.FOLDER) {
            await loadFolder(path);
        } else {
            openFile(path, type);
        }
    });

    // Click on empty space deselects
    $filesGrid.on('click', function (e) {
        if (e.target === this) {
            $('.file-item').removeClass('selected');
            state.selectedFile = null;
            updateToolbarState();
            $selectedInfo.text('');
        }
    });

    // Breadcrumb navigation
    $breadcrumb.on('click', '.breadcrumb-item', async function () {
        const path = $(this).data('path');
        await loadFolder(path);
    });

    // ========================================
    // Open Files
    // ========================================
    function openFile(path, type) {
        // Store the file path to open
        sessionStorage.setItem('northoffice-open-file', path);

        switch (type) {
            case NorthFS.FILE_TYPES.WORDS:
                window.location.href = '../words/index.html?file=' + encodeURIComponent(path);
                break;
            case NorthFS.FILE_TYPES.NUMBERS:
                window.location.href = '../numbers/index.html?file=' + encodeURIComponent(path);
                break;
            default:
                alert('Denna filtyp kan inte öppnas');
        }
    }

    // ========================================
    // Create New Items
    // ========================================
    // New Folder
    $('#newFolderBtn').on('click', () => {
        $('#folderName').val('');
        $('#newFolderModal').addClass('active');
        setTimeout(() => $('#folderName').focus(), 100);
    });

    $('#closeNewFolder, #cancelNewFolder').on('click', () => {
        $('#newFolderModal').removeClass('active');
    });

    $('#confirmNewFolder').on('click', async () => {
        const name = $('#folderName').val().trim();
        if (!name) return;

        await NorthFS.createFolder(name, state.currentPath);
        $('#newFolderModal').removeClass('active');
        await loadFolder(state.currentPath);
    });

    $('#folderName').on('keydown', function (e) {
        if (e.key === 'Enter') $('#confirmNewFolder').click();
        if (e.key === 'Escape') $('#cancelNewFolder').click();
    });

    // New Words document
    $('#newWordsBtn').on('click', async () => {
        const name = 'Nytt dokument.words';
        const content = {
            title: 'Nytt dokument',
            html: '',
            created: new Date().toISOString()
        };
        await NorthFS.saveFile(name, state.currentPath, content);
        await loadFolder(state.currentPath);
    });

    // New Numbers spreadsheet
    $('#newNumbersBtn').on('click', async () => {
        const name = 'Nytt kalkylark.numbers';
        const content = {
            title: 'Nytt kalkylark',
            data: {},
            rows: 50,
            cols: 26,
            created: new Date().toISOString()
        };
        await NorthFS.saveFile(name, state.currentPath, content);
        await loadFolder(state.currentPath);
    });

    // ========================================
    // Rename
    // ========================================
    function openRenameModal() {
        if (!state.selectedFile) return;

        NorthFS.getFile(state.selectedFile).then(file => {
            $('#newName').val(file.name);
            $('#renameModal').addClass('active');
            setTimeout(() => {
                const input = $('#newName')[0];
                input.focus();
                // Select name without extension
                const lastDot = file.name.lastIndexOf('.');
                if (lastDot > 0) {
                    input.setSelectionRange(0, lastDot);
                } else {
                    input.select();
                }
            }, 100);
        });
    }

    $('#renameBtn').on('click', openRenameModal);

    $('#closeRename, #cancelRename').on('click', () => {
        $('#renameModal').removeClass('active');
    });

    $('#confirmRename').on('click', async () => {
        const newName = $('#newName').val().trim();
        if (!newName || !state.selectedFile) return;

        await NorthFS.renameFile(state.selectedFile, newName);
        $('#renameModal').removeClass('active');
        await loadFolder(state.currentPath);
    });

    $('#newName').on('keydown', function (e) {
        if (e.key === 'Enter') $('#confirmRename').click();
        if (e.key === 'Escape') $('#cancelRename').click();
    });

    // ========================================
    // Delete
    // ========================================
    function openDeleteModal() {
        if (!state.selectedFile) return;

        NorthFS.getFile(state.selectedFile).then(file => {
            const typeText = file.type === NorthFS.FILE_TYPES.FOLDER ? 'mappen' : 'filen';
            $('#deleteMessage').text(`Är du säker på att du vill ta bort ${typeText} "${file.name}"?`);
            $('#deleteModal').addClass('active');
        });
    }

    $('#deleteBtn').on('click', openDeleteModal);

    $('#closeDelete, #cancelDelete').on('click', () => {
        $('#deleteModal').removeClass('active');
    });

    $('#confirmDelete').on('click', async () => {
        if (!state.selectedFile) return;

        await NorthFS.deleteFile(state.selectedFile);
        $('#deleteModal').removeClass('active');
        state.selectedFile = null;
        await loadFolder(state.currentPath);
    });

    // ========================================
    // Context Menu
    // ========================================
    $filesGrid.on('contextmenu', '.file-item', function (e) {
        e.preventDefault();

        // Select the item
        $('.file-item').removeClass('selected');
        $(this).addClass('selected');
        state.selectedFile = $(this).data('path');
        updateToolbarState();

        // Show context menu
        $contextMenu.css({
            left: e.pageX + 'px',
            top: e.pageY + 'px'
        }).addClass('active');
    });

    $(document).on('click', () => {
        $contextMenu.removeClass('active');
    });

    $('#ctxOpen').on('click', async () => {
        if (state.selectedFile) {
            const file = await NorthFS.getFile(state.selectedFile);
            if (file.type === NorthFS.FILE_TYPES.FOLDER) {
                await loadFolder(state.selectedFile);
            } else {
                openFile(state.selectedFile, file.type);
            }
        }
    });

    $('#ctxRename').on('click', openRenameModal);
    $('#ctxDelete').on('click', openDeleteModal);

    // ========================================
    // View Mode
    // ========================================
    $('#gridViewBtn').on('click', function () {
        state.viewMode = 'grid';
        $(this).addClass('active');
        $('#listViewBtn').removeClass('active');
        $filesGrid.removeClass('list-view');
        loadFolder(state.currentPath);
    });

    $('#listViewBtn').on('click', function () {
        state.viewMode = 'list';
        $(this).addClass('active');
        $('#gridViewBtn').removeClass('active');
        $filesGrid.addClass('list-view');
        loadFolder(state.currentPath);
    });

    // ========================================
    // Search
    // ========================================
    let searchTimeout;
    $('#searchInput').on('input', function () {
        clearTimeout(searchTimeout);
        const query = $(this).val().trim();

        if (!query) {
            loadFolder(state.currentPath);
            return;
        }

        searchTimeout = setTimeout(async () => {
            const results = await NorthFS.searchFiles(query);
            renderFiles(results);
            $itemCount.text(`${results.length} sökresultat`);
        }, 300);
    });

    // ========================================
    // Theme
    // ========================================
    function loadTheme() {
        const theme = localStorage.getItem('northoffice-theme');
        if (theme === 'dark') {
            state.isDark = true;
            $('html').attr('data-theme', 'dark');
            $('#themeToggle i').removeClass('fa-moon').addClass('fa-sun');
        }
    }

    $('#themeToggle').on('click', function () {
        state.isDark = !state.isDark;
        $('html').attr('data-theme', state.isDark ? 'dark' : 'light');
        $(this).find('i').toggleClass('fa-moon fa-sun');
        localStorage.setItem('northoffice-theme', state.isDark ? 'dark' : 'light');
    });

    // ========================================
    // Toolbar State
    // ========================================
    function updateToolbarState() {
        const hasSelection = state.selectedFile !== null;
        $('#renameBtn').prop('disabled', !hasSelection);
        $('#deleteBtn').prop('disabled', !hasSelection);
    }

    // ========================================
    // Keyboard Shortcuts
    // ========================================
    $(document).on('keydown', function (e) {
        // Don't trigger if in input
        if ($(e.target).is('input')) return;

        if (e.key === 'Delete' && state.selectedFile) {
            openDeleteModal();
        }
        if (e.key === 'F2' && state.selectedFile) {
            openRenameModal();
        }
        if (e.key === 'Enter' && state.selectedFile) {
            NorthFS.getFile(state.selectedFile).then(file => {
                if (file.type === NorthFS.FILE_TYPES.FOLDER) {
                    loadFolder(state.selectedFile);
                } else {
                    openFile(state.selectedFile, file.type);
                }
            });
        }
        if (e.key === 'Backspace' && state.currentPath !== '/') {
            // Go up one level
            const parentPath = state.currentPath.split('/').slice(0, -1).join('/') || '/';
            loadFolder(parentPath);
        }
    });

    // ========================================
    // Close modals on overlay click
    // ========================================
    $('.modal').on('click', function (e) {
        if (e.target === this) {
            $(this).removeClass('active');
        }
    });

    // Initialize
    init().then(() => {
        console.log('Files initialized with jQuery', $.fn.jquery);
    });
});
