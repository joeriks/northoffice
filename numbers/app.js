/**
 * Numbers - Online Spreadsheet Application
 * Built with jQuery 4.0.0
 */

$(function () {
    'use strict';

    // ========================================
    // Configuration
    // ========================================
    const CONFIG = {
        defaultRows: 50,
        defaultCols: 26,
        maxRows: 1000,
        maxCols: 52
    };

    // ========================================
    // State
    // ========================================
    const state = {
        isDark: false,
        rows: CONFIG.defaultRows,
        cols: CONFIG.defaultCols,
        data: {},          // {A1: {value: '', formula: '', format: {}}}
        selectedCell: null,
        selectedRange: [],
        isEditing: false,
        clipboard: null,
        currentFilePath: null  // Path in virtual filesystem
    };

    // Cache DOM
    const $spreadsheet = $('#spreadsheet');
    const $head = $('#spreadsheetHead');
    const $body = $('#spreadsheetBody');
    const $formulaInput = $('#formulaInput');
    const $cellReference = $('#cellReference');
    const $sheetTitle = $('#sheetTitle');

    // ========================================
    // Utility Functions
    // ========================================
    function colToLetter(col) {
        let letter = '';
        while (col >= 0) {
            letter = String.fromCharCode(65 + (col % 26)) + letter;
            col = Math.floor(col / 26) - 1;
        }
        return letter;
    }

    function letterToCol(letter) {
        let col = 0;
        for (let i = 0; i < letter.length; i++) {
            col = col * 26 + (letter.charCodeAt(i) - 64);
        }
        return col - 1;
    }

    function getCellId(row, col) {
        return colToLetter(col) + (row + 1);
    }

    function parseCellId(cellId) {
        const match = cellId.match(/^([A-Z]+)(\d+)$/);
        if (!match) return null;
        return {
            col: letterToCol(match[1]),
            row: parseInt(match[2]) - 1
        };
    }

    // ========================================
    // Spreadsheet Generation
    // ========================================
    function generateSpreadsheet() {
        // Generate header
        let headerHtml = '<tr><th></th>';
        for (let c = 0; c < state.cols; c++) {
            headerHtml += `<th data-col="${c}">${colToLetter(c)}<div class="col-resize"></div></th>`;
        }
        headerHtml += '</tr>';
        $head.html(headerHtml);

        // Generate body
        let bodyHtml = '';
        for (let r = 0; r < state.rows; r++) {
            bodyHtml += `<tr><th data-row="${r}">${r + 1}</th>`;
            for (let c = 0; c < state.cols; c++) {
                const cellId = getCellId(r, c);
                const cellData = state.data[cellId] || {};
                const displayValue = cellData.displayValue || cellData.value || '';
                bodyHtml += `<td data-cell="${cellId}" data-row="${r}" data-col="${c}" tabindex="0">${displayValue}</td>`;
            }
            bodyHtml += '</tr>';
        }
        $body.html(bodyHtml);
    }

    // ========================================
    // Cell Selection
    // ========================================
    function selectCell(cellId) {
        // Remove previous selection
        $('.spreadsheet td.selected').removeClass('selected');
        $('.spreadsheet th.selected').removeClass('selected');

        state.selectedCell = cellId;
        const $cell = $(`td[data-cell="${cellId}"]`);
        $cell.addClass('selected').focus();

        // Highlight row and column headers
        const pos = parseCellId(cellId);
        if (pos) {
            $(`th[data-row="${pos.row}"]`).addClass('selected');
            $(`th[data-col="${pos.col}"]`).addClass('selected');
        }

        // Update formula bar
        const cellData = state.data[cellId] || {};
        $cellReference.text(cellId);
        $formulaInput.val(cellData.formula || cellData.value || '');

        // Update status
        $('#selectionInfo').text(`Markerad: ${cellId}`);
        updateStatusCalculations();
    }

    function updateStatusCalculations() {
        const values = [];
        if (state.selectedCell) {
            const cellData = state.data[state.selectedCell];
            if (cellData && !isNaN(parseFloat(cellData.value))) {
                values.push(parseFloat(cellData.value));
            }
        }

        // Also include any multi-selected cells
        state.selectedRange.forEach(cellId => {
            const cellData = state.data[cellId];
            if (cellData && !isNaN(parseFloat(cellData.value))) {
                values.push(parseFloat(cellData.value));
            }
        });

        const sum = values.reduce((a, b) => a + b, 0);
        const avg = values.length ? (sum / values.length) : 0;

        $('#statusSum').text(sum.toFixed(2));
        $('#statusAvg').text(avg.toFixed(2));
        $('#statusCount').text(values.length);
    }

    // ========================================
    // Cell Editing
    // ========================================
    function startEditing(cellId) {
        if (state.isEditing) return;
        state.isEditing = true;

        const $cell = $(`td[data-cell="${cellId}"]`);
        const cellData = state.data[cellId] || {};
        const value = cellData.formula || cellData.value || '';

        $cell.addClass('editing');
        $cell.html(`<input type="text" value="${escapeHtml(value)}" />`);
        const $input = $cell.find('input');
        $input.focus().select();

        $input.on('blur', function () {
            finishEditing(cellId, $(this).val());
        });

        $input.on('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                finishEditing(cellId, $(this).val());
                // Move to next row
                const pos = parseCellId(cellId);
                if (pos && pos.row < state.rows - 1) {
                    selectCell(getCellId(pos.row + 1, pos.col));
                }
            } else if (e.key === 'Tab') {
                e.preventDefault();
                finishEditing(cellId, $(this).val());
                // Move to next column
                const pos = parseCellId(cellId);
                if (pos && pos.col < state.cols - 1) {
                    selectCell(getCellId(pos.row, pos.col + 1));
                }
            } else if (e.key === 'Escape') {
                cancelEditing(cellId);
            }
        });
    }

    function finishEditing(cellId, value) {
        if (!state.isEditing) return;
        state.isEditing = false;

        const $cell = $(`td[data-cell="${cellId}"]`);
        $cell.removeClass('editing');

        // Initialize cell data if needed
        if (!state.data[cellId]) {
            state.data[cellId] = { value: '', formula: '', format: {} };
        }

        // Check if it's a formula
        if (value.startsWith('=')) {
            state.data[cellId].formula = value;
            state.data[cellId].value = evaluateFormula(value, cellId);
            state.data[cellId].displayValue = formatValue(state.data[cellId].value, state.data[cellId].format);
        } else {
            state.data[cellId].formula = '';
            state.data[cellId].value = value;
            state.data[cellId].displayValue = formatValue(value, state.data[cellId].format);
        }

        $cell.text(state.data[cellId].displayValue);
        $formulaInput.val(state.data[cellId].formula || state.data[cellId].value);

        // Recalculate dependent cells
        recalculateAll();
        saveToLocalStorage();
        updateStatusCalculations();
    }

    function cancelEditing(cellId) {
        state.isEditing = false;
        const $cell = $(`td[data-cell="${cellId}"]`);
        $cell.removeClass('editing');
        const cellData = state.data[cellId] || {};
        $cell.text(cellData.displayValue || cellData.value || '');
    }

    function escapeHtml(str) {
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ========================================
    // Formula Evaluation
    // ========================================
    function evaluateFormula(formula, currentCell) {
        try {
            let expr = formula.substring(1).toUpperCase();

            // Handle SUM function
            expr = expr.replace(/SUM\(([A-Z]+\d+):([A-Z]+\d+)\)/g, (match, start, end) => {
                return sumRange(start, end);
            });

            // Handle AVG/AVERAGE function
            expr = expr.replace(/(?:AVG|AVERAGE)\(([A-Z]+\d+):([A-Z]+\d+)\)/g, (match, start, end) => {
                return avgRange(start, end);
            });

            // Handle MIN function
            expr = expr.replace(/MIN\(([A-Z]+\d+):([A-Z]+\d+)\)/g, (match, start, end) => {
                return minRange(start, end);
            });

            // Handle MAX function
            expr = expr.replace(/MAX\(([A-Z]+\d+):([A-Z]+\d+)\)/g, (match, start, end) => {
                return maxRange(start, end);
            });

            // Handle COUNT function
            expr = expr.replace(/COUNT\(([A-Z]+\d+):([A-Z]+\d+)\)/g, (match, start, end) => {
                return countRange(start, end);
            });

            // Replace cell references with values
            expr = expr.replace(/([A-Z]+)(\d+)/g, (match, col, row) => {
                const cellId = col + row;
                if (cellId === currentCell) return 0; // Prevent circular reference
                const cellData = state.data[cellId];
                const val = cellData ? cellData.value : 0;
                return isNaN(parseFloat(val)) ? 0 : parseFloat(val);
            });

            // Evaluate expression safely
            const result = Function('"use strict"; return (' + expr + ')')();
            return isNaN(result) ? '#ERROR' : result;
        } catch (e) {
            return '#ERROR';
        }
    }

    function getRangeValues(start, end) {
        const startPos = parseCellId(start);
        const endPos = parseCellId(end);
        if (!startPos || !endPos) return [];

        const values = [];
        for (let r = Math.min(startPos.row, endPos.row); r <= Math.max(startPos.row, endPos.row); r++) {
            for (let c = Math.min(startPos.col, endPos.col); c <= Math.max(startPos.col, endPos.col); c++) {
                const cellId = getCellId(r, c);
                const cellData = state.data[cellId];
                if (cellData && !isNaN(parseFloat(cellData.value))) {
                    values.push(parseFloat(cellData.value));
                }
            }
        }
        return values;
    }

    function sumRange(start, end) {
        return getRangeValues(start, end).reduce((a, b) => a + b, 0);
    }

    function avgRange(start, end) {
        const values = getRangeValues(start, end);
        return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    }

    function minRange(start, end) {
        const values = getRangeValues(start, end);
        return values.length ? Math.min(...values) : 0;
    }

    function maxRange(start, end) {
        const values = getRangeValues(start, end);
        return values.length ? Math.max(...values) : 0;
    }

    function countRange(start, end) {
        return getRangeValues(start, end).length;
    }

    function recalculateAll() {
        Object.keys(state.data).forEach(cellId => {
            const cellData = state.data[cellId];
            if (cellData.formula) {
                cellData.value = evaluateFormula(cellData.formula, cellId);
                cellData.displayValue = formatValue(cellData.value, cellData.format);
                $(`td[data-cell="${cellId}"]`).text(cellData.displayValue);
            }
        });
    }

    // ========================================
    // Value Formatting
    // ========================================
    function formatValue(value, format) {
        if (!format || !format.type) return value;

        const num = parseFloat(value);
        if (isNaN(num)) return value;

        switch (format.type) {
            case 'number':
                return num.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            case 'currency':
                return num.toLocaleString('sv-SE', { style: 'currency', currency: 'SEK' });
            case 'percent':
                return (num * 100).toFixed(1) + '%';
            default:
                return value;
        }
    }

    function applyFormat(type) {
        if (!state.selectedCell) return;
        if (!state.data[state.selectedCell]) {
            state.data[state.selectedCell] = { value: '', formula: '', format: {} };
        }
        state.data[state.selectedCell].format = { type };
        const cellData = state.data[state.selectedCell];
        cellData.displayValue = formatValue(cellData.value, cellData.format);
        $(`td[data-cell="${state.selectedCell}"]`).text(cellData.displayValue);
        saveToLocalStorage();
    }

    // ========================================
    // Event Handlers
    // ========================================
    // Cell click
    $body.on('click', 'td', function () {
        const cellId = $(this).data('cell');
        if (state.selectedCell !== cellId || !state.isEditing) {
            selectCell(cellId);
        }
    });

    // Cell double-click to edit
    $body.on('dblclick', 'td', function () {
        const cellId = $(this).data('cell');
        startEditing(cellId);
    });

    // Keyboard navigation
    $body.on('keydown', 'td', function (e) {
        const cellId = $(this).data('cell');
        const pos = parseCellId(cellId);
        if (!pos) return;

        if (state.isEditing) return;

        switch (e.key) {
            case 'ArrowUp':
                e.preventDefault();
                if (pos.row > 0) selectCell(getCellId(pos.row - 1, pos.col));
                break;
            case 'ArrowDown':
                e.preventDefault();
                if (pos.row < state.rows - 1) selectCell(getCellId(pos.row + 1, pos.col));
                break;
            case 'ArrowLeft':
                e.preventDefault();
                if (pos.col > 0) selectCell(getCellId(pos.row, pos.col - 1));
                break;
            case 'ArrowRight':
                e.preventDefault();
                if (pos.col < state.cols - 1) selectCell(getCellId(pos.row, pos.col + 1));
                break;
            case 'Enter':
                e.preventDefault();
                startEditing(cellId);
                break;
            case 'Delete':
            case 'Backspace':
                e.preventDefault();
                delete state.data[cellId];
                $(this).text('');
                recalculateAll();
                saveToLocalStorage();
                break;
            default:
                // Start editing if typing
                if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
                    e.preventDefault();
                    if (!state.data[cellId]) state.data[cellId] = { value: '', formula: '', format: {} };
                    state.data[cellId].value = '';
                    startEditing(cellId);
                    $(`td[data-cell="${cellId}"] input`).val(e.key);
                }
        }
    });

    // Formula input
    $formulaInput.on('keydown', function (e) {
        if (e.key === 'Enter' && state.selectedCell) {
            e.preventDefault();
            const value = $(this).val();
            finishEditing(state.selectedCell, value);
            $(`td[data-cell="${state.selectedCell}"]`).focus();
        }
    });

    $formulaInput.on('focus', function () {
        if (state.selectedCell && !state.isEditing) {
            state.isEditing = true;
        }
    });

    // ========================================
    // Toolbar Actions
    // ========================================
    // Format buttons
    $('#formatNumberBtn').on('click', () => applyFormat('number'));
    $('#formatCurrencyBtn').on('click', () => applyFormat('currency'));
    $('#formatPercentBtn').on('click', () => applyFormat('percent'));

    // Add/remove rows and columns
    $('#addRowBtn').on('click', function () {
        state.rows = Math.min(state.rows + 1, CONFIG.maxRows);
        generateSpreadsheet();
    });

    $('#addColBtn').on('click', function () {
        state.cols = Math.min(state.cols + 1, CONFIG.maxCols);
        generateSpreadsheet();
    });

    $('#deleteRowBtn').on('click', function () {
        if (state.rows > 1) {
            state.rows--;
            generateSpreadsheet();
        }
    });

    $('#deleteColBtn').on('click', function () {
        if (state.cols > 1) {
            state.cols--;
            generateSpreadsheet();
        }
    });

    // Cell formatting
    $('#boldBtn').on('click', function () {
        $(this).toggleClass('active');
        if (state.selectedCell) {
            const $cell = $(`td[data-cell="${state.selectedCell}"]`);
            $cell.css('font-weight', $(this).hasClass('active') ? 'bold' : 'normal');
        }
    });

    $('#italicBtn').on('click', function () {
        $(this).toggleClass('active');
        if (state.selectedCell) {
            const $cell = $(`td[data-cell="${state.selectedCell}"]`);
            $cell.css('font-style', $(this).hasClass('active') ? 'italic' : 'normal');
        }
    });

    // Colors
    $('#textColorBtn').on('click', () => $('#textColor').trigger('click'));
    $('#textColor').on('input', function () {
        if (state.selectedCell) {
            $(`td[data-cell="${state.selectedCell}"]`).css('color', $(this).val());
            $('#textColorBtn .color-indicator').css('background', $(this).val());
        }
    });

    $('#bgColorBtn').on('click', () => $('#bgColor').trigger('click'));
    $('#bgColor').on('input', function () {
        if (state.selectedCell) {
            $(`td[data-cell="${state.selectedCell}"]`).css('background-color', $(this).val());
            $('#bgColorBtn .color-indicator').css('background', $(this).val());
        }
    });

    // Alignment
    $('#alignLeftBtn').on('click', function () {
        if (state.selectedCell) $(`td[data-cell="${state.selectedCell}"]`).css('text-align', 'left');
    });
    $('#alignCenterBtn').on('click', function () {
        if (state.selectedCell) $(`td[data-cell="${state.selectedCell}"]`).css('text-align', 'center');
    });
    $('#alignRightBtn').on('click', function () {
        if (state.selectedCell) $(`td[data-cell="${state.selectedCell}"]`).css('text-align', 'right');
    });

    // ========================================
    // File Operations
    // ========================================
    $('#newSheetBtn').on('click', function () {
        if (confirm('Skapa nytt kalkylark? Osparade ändringar går förlorade.')) {
            state.data = {};
            $sheetTitle.val('Namnlöst kalkylark');
            generateSpreadsheet();
            localStorage.removeItem('numbers-sheet');
        }
    });

    $('#saveSheetBtn').on('click', function () {
        saveToLocalStorage();
        const data = JSON.stringify({ title: $sheetTitle.val(), data: state.data, rows: state.rows, cols: state.cols });
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = ($sheetTitle.val() || 'kalkylark') + '.json';
        a.click();
        URL.revokeObjectURL(url);
    });

    $('#exportCsvBtn').on('click', function () {
        let csv = '';
        for (let r = 0; r < state.rows; r++) {
            const row = [];
            for (let c = 0; c < state.cols; c++) {
                const cellId = getCellId(r, c);
                const cellData = state.data[cellId];
                const value = cellData ? (cellData.value || '') : '';
                row.push('"' + String(value).replace(/"/g, '""') + '"');
            }
            csv += row.join(';') + '\n';
        }
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = ($sheetTitle.val() || 'kalkylark') + '.csv';
        a.click();
        URL.revokeObjectURL(url);
    });

    // ========================================
    // Theme Toggle
    // ========================================
    $('#themeToggle').on('click', function () {
        state.isDark = !state.isDark;
        $('html').attr('data-theme', state.isDark ? 'dark' : 'light');
        $(this).find('i').toggleClass('fa-moon fa-sun');
        localStorage.setItem('numbers-theme', state.isDark ? 'dark' : 'light');
    });

    // ========================================
    // Local Storage
    // ========================================
    function saveToLocalStorage() {
        const data = { title: $sheetTitle.val(), data: state.data, rows: state.rows, cols: state.cols };
        localStorage.setItem('numbers-sheet', JSON.stringify(data));

        // Also save to virtual filesystem if we have a file path
        if (state.currentFilePath && typeof NorthFS !== 'undefined') {
            saveToFilesystem();
        }

        $('#saveStatus').text('Sparat');
    }

    async function saveToFilesystem() {
        if (!state.currentFilePath) return;

        const content = {
            title: $sheetTitle.val(),
            data: state.data,
            rows: state.rows,
            cols: state.cols,
            lastSaved: new Date().toISOString()
        };

        const pathParts = state.currentFilePath.split('/');
        const fileName = pathParts.pop();
        const parentPath = pathParts.join('/') || '/';

        await NorthFS.saveFile(fileName, parentPath, content);
    }

    function loadFromLocalStorage() {
        const saved = localStorage.getItem('numbers-sheet');
        if (saved) {
            try {
                const data = JSON.parse(saved);
                $sheetTitle.val(data.title || 'Namnlöst kalkylark');
                state.data = data.data || {};
                state.rows = data.rows || CONFIG.defaultRows;
                state.cols = data.cols || CONFIG.defaultCols;
            } catch (e) {
                console.error('Failed to load:', e);
            }
        }

        const theme = localStorage.getItem('numbers-theme');
        if (theme === 'dark') {
            state.isDark = true;
            $('html').attr('data-theme', 'dark');
            $('#themeToggle i').removeClass('fa-moon').addClass('fa-sun');
        }
    }

    async function loadFromFilesystem(filePath) {
        try {
            await NorthFS.init();
            const file = await NorthFS.getFile(filePath);
            if (file && file.content) {
                state.currentFilePath = filePath;
                $sheetTitle.val(file.content.title || file.name.replace('.numbers', ''));
                state.data = file.content.data || {};
                state.rows = file.content.rows || CONFIG.defaultRows;
                state.cols = file.content.cols || CONFIG.defaultCols;
                $('#saveStatus').text('Öppnad från filsystemet');
            }
        } catch (e) {
            console.error('Failed to load from filesystem:', e);
        }
    }

    // ========================================
    // Initialize
    // ========================================
    async function initialize() {
        const urlParams = new URLSearchParams(window.location.search);
        const filePath = urlParams.get('file');

        if (filePath && typeof NorthFS !== 'undefined') {
            await loadFromFilesystem(filePath);
        } else {
            loadFromLocalStorage();
        }

        generateSpreadsheet();
        selectCell('A1');
        console.log('Numbers initialized with jQuery', $.fn.jquery);
    }

    initialize();
});
