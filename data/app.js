/**
 * NorthOffice Data - Database Application
 * Using Dexie.js for IndexedDB wrapper
 */

$(function () {
    'use strict';

    // =====================================================
    // Database Setup with Dexie
    // =====================================================

    const db = new Dexie('NorthOfficeData');

    // Schema versioning - We'll use a flexible schema
    db.version(1).stores({
        _tables: '++id, name, created, modified',
        _fields: '++id, tableId, name, type, required, defaultValue, order',
        _relations: '++id, fromTableId, fromFieldId, toTableId, toFieldId, type',
        _data: '++id, tableId, *data'
    });

    // =====================================================
    // Application State
    // =====================================================

    const state = {
        tables: [],
        relations: [],
        currentTable: null,
        currentTableFields: [],
        currentTableData: [],
        currentRecordIndex: 0,
        selectedRows: new Set(),
        currentView: 'design', // 'design', 'form', 'table'
        isEditMode: false, // Edit mode for adding/removing fields in form/table views
        isDirty: false,
        theme: localStorage.getItem('dataTheme') || 'dark'
    };

    // =====================================================
    // Field Types
    // =====================================================

    const FIELD_TYPES = {
        string: { label: 'Text', icon: 'fa-font', defaultValue: '' },
        number: { label: 'Heltal', icon: 'fa-hashtag', defaultValue: 0 },
        decimal: { label: 'Decimal', icon: 'fa-percentage', defaultValue: 0.0 },
        boolean: { label: 'Ja/Nej', icon: 'fa-toggle-on', defaultValue: false },
        date: { label: 'Datum', icon: 'fa-calendar', defaultValue: '' },
        text: { label: 'Lång text', icon: 'fa-align-left', defaultValue: '' }
    };

    // =====================================================
    // Initialization
    // =====================================================

    async function init() {
        applyTheme();
        await loadTables();
        await loadRelations();
        renderTableList();
        renderRelationList();
        updateDbStats();
        setupEventListeners();
    }

    // =====================================================
    // Theme Management
    // =====================================================

    function applyTheme() {
        if (state.theme === 'light') {
            document.body.setAttribute('data-theme', 'light');
            $('#themeToggle i').removeClass('fa-moon').addClass('fa-sun');
        } else {
            document.body.removeAttribute('data-theme');
            $('#themeToggle i').removeClass('fa-sun').addClass('fa-moon');
        }
    }

    function toggleTheme() {
        state.theme = state.theme === 'dark' ? 'light' : 'dark';
        localStorage.setItem('dataTheme', state.theme);
        applyTheme();
    }

    // =====================================================
    // Data Operations
    // =====================================================

    async function loadTables() {
        state.tables = await db._tables.toArray();
    }

    async function loadRelations() {
        state.relations = await db._relations.toArray();
    }

    async function createTable(name) {
        const table = {
            name: name,
            created: new Date().toISOString(),
            modified: new Date().toISOString()
        };
        table.id = await db._tables.add(table);
        state.tables.push(table);
        return table;
    }

    async function updateTable(tableId, updates) {
        updates.modified = new Date().toISOString();
        await db._tables.update(tableId, updates);
        const index = state.tables.findIndex(t => t.id === tableId);
        if (index !== -1) {
            Object.assign(state.tables[index], updates);
        }
    }

    async function deleteTable(tableId) {
        // Delete all fields
        await db._fields.where('tableId').equals(tableId).delete();
        // Delete all data
        await db._data.where('tableId').equals(tableId).delete();
        // Delete relations
        await db._relations.where('fromTableId').equals(tableId).or('toTableId').equals(tableId).delete();
        // Delete table
        await db._tables.delete(tableId);

        state.tables = state.tables.filter(t => t.id !== tableId);
        state.relations = state.relations.filter(r => r.fromTableId !== tableId && r.toTableId !== tableId);
    }

    async function loadTableFields(tableId) {
        state.currentTableFields = await db._fields.where('tableId').equals(tableId).sortBy('order');
    }

    async function saveField(field) {
        if (field.id) {
            await db._fields.update(field.id, field);
        } else {
            field.id = await db._fields.add(field);
        }
        return field;
    }

    async function deleteField(fieldId) {
        await db._fields.delete(fieldId);
        state.currentTableFields = state.currentTableFields.filter(f => f.id !== fieldId);
    }

    async function loadTableData(tableId) {
        state.currentTableData = await db._data.where('tableId').equals(tableId).toArray();
    }

    async function saveRecord(record) {
        if (record.id) {
            await db._data.update(record.id, record);
        } else {
            record.id = await db._data.add(record);
        }
        return record;
    }

    async function deleteRecord(recordId) {
        await db._data.delete(recordId);
        state.currentTableData = state.currentTableData.filter(r => r.id !== recordId);
    }

    async function saveRelation(relation) {
        if (relation.id) {
            await db._relations.update(relation.id, relation);
        } else {
            relation.id = await db._relations.add(relation);
        }
        state.relations.push(relation);
        return relation;
    }

    async function deleteRelation(relationId) {
        await db._relations.delete(relationId);
        state.relations = state.relations.filter(r => r.id !== relationId);
    }

    // =====================================================
    // UI Rendering
    // =====================================================

    function renderTableList() {
        const $list = $('#tableList');
        $list.empty();

        if (state.tables.length === 0) {
            $list.html('<div class="empty-list" style="padding: 16px; color: var(--color-text-muted); font-size: 13px; text-align: center;">Inga tabeller ännu</div>');
            return;
        }

        state.tables.forEach(table => {
            const isActive = state.currentTable && state.currentTable.id === table.id;
            const $item = $(`
                <div class="table-item ${isActive ? 'active' : ''}" data-table-id="${table.id}">
                    <i class="fas fa-table"></i>
                    <span>${escapeHtml(table.name)}</span>
                </div>
            `);
            $list.append($item);
        });

        updateDbStats();
    }

    function renderRelationList() {
        const $list = $('#relationList');
        $list.empty();

        if (state.relations.length === 0) {
            return;
        }

        state.relations.forEach(relation => {
            const fromTable = state.tables.find(t => t.id === relation.fromTableId);
            const toTable = state.tables.find(t => t.id === relation.toTableId);

            if (!fromTable || !toTable) return;

            const typeLabel = {
                'one-to-one': '1:1',
                'one-to-many': '1:N',
                'many-to-many': 'N:N'
            }[relation.type] || relation.type;

            const $item = $(`
                <div class="relation-item" data-relation-id="${relation.id}">
                    <i class="fas fa-link relation-icon"></i>
                    <span>${escapeHtml(fromTable.name)} ${typeLabel} ${escapeHtml(toTable.name)}</span>
                    <button class="delete-relation" title="Ta bort">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `);
            $list.append($item);
        });
    }

    function renderDesignView() {
        const $list = $('#fieldsList');
        $list.empty();

        state.currentTableFields.forEach((field, index) => {
            const $row = createFieldRow(field, index);
            $list.append($row);
        });
    }

    function createFieldRow(field, index) {
        const typeOptions = Object.entries(FIELD_TYPES)
            .map(([key, val]) => `<option value="${key}" ${field.type === key ? 'selected' : ''}>${val.label}</option>`)
            .join('');

        return $(`
            <div class="field-row" data-field-id="${field.id || 'new-' + index}" data-index="${index}">
                <input type="text" class="field-name" value="${escapeHtml(field.name || '')}" placeholder="Fältnamn">
                <select class="field-type">
                    ${typeOptions}
                </select>
                <input type="checkbox" class="field-required" ${field.required ? 'checked' : ''}>
                <input type="text" class="field-default" value="${escapeHtml(field.defaultValue || '')}" placeholder="Standardvärde">
                <div class="field-actions">
                    <button class="move-up" title="Flytta upp"><i class="fas fa-chevron-up"></i></button>
                    <button class="move-down" title="Flytta ned"><i class="fas fa-chevron-down"></i></button>
                    <button class="delete" title="Ta bort"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `);
    }

    function renderFormView() {
        const $container = $('#formContainer');
        $container.empty();

        if (state.currentTableFields.length === 0 && !state.isEditMode) {
            $container.html('<p style="text-align: center; color: var(--color-text-muted);">Lägg till fält i designvyn eller aktivera redigeringsläge</p>');
            return;
        }

        const record = state.currentTableData[state.currentRecordIndex] || {};

        state.currentTableFields.forEach(field => {
            const value = record.data ? (record.data[field.name] ?? field.defaultValue ?? '') : (field.defaultValue ?? '');
            const $field = createFormField(field, value);
            $container.append($field);
        });

        // Add "Add field" button in edit mode
        if (state.isEditMode) {
            const $addBtn = $(`
                <button class="add-field-btn form-add-field">
                    <i class="fas fa-plus"></i> Lägg till fält
                </button>
            `);
            $addBtn.on('click', async () => {
                await handleAddField();
                renderFormView();
            });
            $container.append($addBtn);
        }

        updateRecordIndicator();
    }

    function createFormField(field, value) {
        const requiredMark = field.required ? '<span class="required">*</span>' : '';
        let inputHtml = '';

        switch (field.type) {
            case 'text':
                inputHtml = `<textarea class="form-input" data-field="${escapeHtml(field.name)}" rows="4">${escapeHtml(String(value))}</textarea>`;
                break;
            case 'boolean':
                inputHtml = `<input type="checkbox" class="form-input" data-field="${escapeHtml(field.name)}" ${value ? 'checked' : ''}>`;
                break;
            case 'date':
                inputHtml = `<input type="date" class="form-input" data-field="${escapeHtml(field.name)}" value="${escapeHtml(String(value))}">`;
                break;
            case 'number':
                inputHtml = `<input type="number" class="form-input" data-field="${escapeHtml(field.name)}" value="${escapeHtml(String(value))}" step="1">`;
                break;
            case 'decimal':
                inputHtml = `<input type="number" class="form-input" data-field="${escapeHtml(field.name)}" value="${escapeHtml(String(value))}" step="0.01">`;
                break;
            default:
                inputHtml = `<input type="text" class="form-input" data-field="${escapeHtml(field.name)}" value="${escapeHtml(String(value))}">`;
        }

        // Add delete button in edit mode
        const editControls = state.isEditMode ? `
            <button class="field-delete-btn" data-field-id="${field.id}" title="Ta bort fält">
                <i class="fas fa-trash"></i>
            </button>
        ` : '';

        const $field = $(`
            <div class="form-field ${state.isEditMode ? 'edit-mode' : ''}" data-field-id="${field.id}">
                <div class="form-field-header">
                    <label>${escapeHtml(field.name)}${requiredMark}</label>
                    ${editControls}
                </div>
                ${inputHtml}
            </div>
        `);

        // Add delete handler
        if (state.isEditMode) {
            $field.find('.field-delete-btn').on('click', async function () {
                if (confirm(`Vill du ta bort fältet "${field.name}"?`)) {
                    await deleteField(field.id);
                    await loadTableFields(state.currentTable.id);
                    renderFormView();
                    showStatus('Fält borttaget');
                }
            });
        }

        return $field;
    }

    function renderDataTableView() {
        renderDataGridHeader();
        renderDataGridBody();
        updateRowCount();
    }

    function renderDataGridHeader() {
        const $head = $('#dataGridHead');
        $head.empty();

        if (state.currentTableFields.length === 0 && !state.isEditMode) return;

        let headerHtml = '<tr><th><input type="checkbox" id="selectAll"></th>';
        state.currentTableFields.forEach(field => {
            if (state.isEditMode) {
                headerHtml += `<th class="editable-header">
                    <span>${escapeHtml(field.name)}</span>
                    <button class="header-delete-btn" data-field-id="${field.id}" title="Ta bort fält">
                        <i class="fas fa-times"></i>
                    </button>
                </th>`;
            } else {
                headerHtml += `<th>${escapeHtml(field.name)}</th>`;
            }
        });

        // Add "+" button for adding new column in edit mode
        if (state.isEditMode) {
            headerHtml += `<th class="add-column-header">
                <button class="add-column-btn" title="Lägg till kolumn">
                    <i class="fas fa-plus"></i>
                </button>
            </th>`;
        }

        headerHtml += '</tr>';
        $head.html(headerHtml);

        // Add event handlers for edit mode
        if (state.isEditMode) {
            $head.find('.header-delete-btn').on('click', async function (e) {
                e.stopPropagation();
                const fieldId = parseInt($(this).data('field-id'));
                const field = state.currentTableFields.find(f => f.id === fieldId);
                if (field && confirm(`Vill du ta bort fältet "${field.name}"?`)) {
                    await deleteField(fieldId);
                    await loadTableFields(state.currentTable.id);
                    renderDataTableView();
                    showStatus('Fält borttaget');
                }
            });

            $head.find('.add-column-btn').on('click', async function () {
                await handleAddField();
                renderDataTableView();
            });
        }
    }

    function renderDataGridBody() {
        const $body = $('#dataGridBody');
        $body.empty();

        if (state.currentTableFields.length === 0) {
            $body.html('<tr><td colspan="100" style="text-align: center; color: var(--color-text-muted); padding: 32px;">Lägg till fält i designvyn först</td></tr>');
            return;
        }

        if (state.currentTableData.length === 0) {
            $body.html('<tr><td colspan="100" style="text-align: center; color: var(--color-text-muted); padding: 32px;">Inga poster ännu. Klicka på "Ny rad" för att lägga till.</td></tr>');
            return;
        }

        const searchTerm = $('#searchInput').val()?.toLowerCase() || '';

        state.currentTableData.forEach((record, index) => {
            // Filter by search
            if (searchTerm) {
                const matchesSearch = state.currentTableFields.some(field => {
                    const value = record.data?.[field.name] ?? '';
                    return String(value).toLowerCase().includes(searchTerm);
                });
                if (!matchesSearch) return;
            }

            const isSelected = state.selectedRows.has(record.id);
            let rowHtml = `<tr data-record-id="${record.id}" class="${isSelected ? 'selected' : ''}">`;
            rowHtml += `<td><input type="checkbox" class="row-select" ${isSelected ? 'checked' : ''}></td>`;

            state.currentTableFields.forEach(field => {
                const value = record.data?.[field.name] ?? '';
                const displayValue = field.type === 'boolean' ? (value ? '✓' : '✗') : escapeHtml(String(value));
                rowHtml += `<td><div class="editable-cell" contenteditable="true" data-field="${escapeHtml(field.name)}" data-record-id="${record.id}">${displayValue}</div></td>`;
            });

            rowHtml += '</tr>';
            $body.append(rowHtml);
        });

        updateRowCount();
    }

    function updateRecordIndicator() {
        const total = state.currentTableData.length;
        const current = total > 0 ? state.currentRecordIndex + 1 : 0;
        $('#recordIndicator').text(`Post ${current} av ${total}`);
    }

    function updateRowCount() {
        const visibleRows = $('#dataGridBody tr[data-record-id]').length;
        const total = state.currentTableData.length;
        $('#rowCount').text(`${visibleRows} av ${total} poster`);
    }

    function updateDbStats() {
        $('#dbSize').text(state.tables.length);
    }

    function updateTableInfo() {
        if (state.currentTable) {
            const fieldCount = state.currentTableFields.length;
            const recordCount = state.currentTableData.length;
            $('#tableInfo').text(`${state.currentTable.name}: ${fieldCount} fält, ${recordCount} poster`);
        } else {
            $('#tableInfo').text('Ingen tabell vald');
        }
    }

    function showStatus(message, isError = false) {
        const $status = $('#saveStatus');
        $status.text(message);
        $status.parent().find('i').removeClass('fa-check-circle fa-exclamation-circle')
            .addClass(isError ? 'fa-exclamation-circle' : 'fa-check-circle')
            .css('color', isError ? 'var(--color-danger)' : 'var(--color-success)');
    }

    // =====================================================
    // View Management
    // =====================================================

    function showWelcomeScreen() {
        $('#welcomeScreen').removeClass('hidden');
        $('#tableDesigner').addClass('hidden');
        state.currentTable = null;
        state.currentTableFields = [];
        state.currentTableData = [];
        updateTableInfo();
    }

    function showTableDesigner(table) {
        $('#welcomeScreen').addClass('hidden');
        $('#tableDesigner').removeClass('hidden');
        $('#tableNameInput').val(table.name);
        switchView('design');
    }

    function switchView(view) {
        state.currentView = view;

        // Update buttons
        $('.view-btn').removeClass('active');
        $(`#${view}ViewBtn`).addClass('active');

        // Hide all views
        $('#designView, #formView, #dataTableView').addClass('hidden');

        // Show selected view
        switch (view) {
            case 'design':
                $('#designView').removeClass('hidden');
                renderDesignView();
                break;
            case 'form':
                $('#formView').removeClass('hidden');
                renderFormView();
                break;
            case 'table':
                $('#dataTableView').removeClass('hidden');
                renderDataTableView();
                break;
        }
    }

    function toggleEditMode() {
        state.isEditMode = !state.isEditMode;
        $('#editModeBtn').toggleClass('active', state.isEditMode);

        // Re-render current view with edit mode
        switch (state.currentView) {
            case 'form':
                renderFormView();
                break;
            case 'table':
                renderDataTableView();
                break;
        }

        showStatus(state.isEditMode ? 'Redigeringsläge aktiverat' : 'Redigeringsläge inaktiverat');
    }

    // =====================================================
    // Event Handlers
    // =====================================================

    function setupEventListeners() {
        // Theme toggle
        $('#themeToggle').on('click', toggleTheme);

        // New table
        $('#addTableBtn, #newDbBtn, #welcomeNewTableBtn').on('click', handleNewTable);

        // Table selection
        $('#tableList').on('click', '.table-item', handleTableSelect);

        // View toggle
        $('#designViewBtn').on('click', () => switchView('design'));
        $('#formViewBtn').on('click', () => switchView('form'));
        $('#tableViewBtn').on('click', () => switchView('table'));

        // Edit mode toggle
        $('#editModeBtn').on('click', toggleEditMode);

        // Table name change
        $('#tableNameInput').on('change', handleTableNameChange);

        // Save table
        $('#saveTableBtn').on('click', handleSaveTable);

        // Delete table
        $('#deleteTableBtn').on('click', handleDeleteTable);

        // Add field
        $('#addFieldBtn').on('click', handleAddField);

        // Field operations
        $('#fieldsList').on('change', '.field-name, .field-type, .field-required, .field-default', handleFieldChange);
        $('#fieldsList').on('click', '.delete', handleDeleteField);
        $('#fieldsList').on('click', '.move-up', handleMoveFieldUp);
        $('#fieldsList').on('click', '.move-down', handleMoveFieldDown);

        // Form navigation
        $('#prevRecordBtn').on('click', () => navigateRecord(-1));
        $('#nextRecordBtn').on('click', () => navigateRecord(1));
        $('#newRecordBtn').on('click', handleNewRecord);
        $('#deleteRecordBtn').on('click', handleDeleteCurrentRecord);
        $('#saveRecordBtn').on('click', handleSaveRecord);

        // Table view operations
        $('#addRowBtn').on('click', handleAddRow);
        $('#deleteRowBtn').on('click', handleDeleteSelectedRows);
        $('#searchInput').on('input', renderDataGridBody);
        $('#dataGridHead').on('change', '#selectAll', handleSelectAll);
        $('#dataGridBody').on('change', '.row-select', handleRowSelect);
        $('#dataGridBody').on('blur', '.editable-cell', handleCellEdit);

        // Relations
        $('#addRelationBtn').on('click', showRelationModal);
        $('#closeRelationModal, #cancelRelation').on('click', hideRelationModal);
        $('#saveRelation').on('click', handleSaveRelation);
        $('#fromTable').on('change', updateFromFields);
        $('#toTable').on('change', updateToFields);
        $('#relationList').on('click', '.delete-relation', handleDeleteRelation);

        // Import/Export
        $('#importBtn').on('click', showImportModal);
        $('#closeImportModal').on('click', hideImportModal);
        $('#browseFileBtn').on('click', () => $('#importFileInput').click());
        $('#importFileInput').on('change', handleImportFile);
        $('#exportBtn').on('click', handleExport);

        // Drag and drop for import
        const $dropzone = $('#importDropzone');
        $dropzone.on('dragover', (e) => {
            e.preventDefault();
            $dropzone.addClass('drag-over');
        });
        $dropzone.on('dragleave', () => {
            $dropzone.removeClass('drag-over');
        });
        $dropzone.on('drop', handleDrop);
    }

    async function handleNewTable() {
        const name = `Tabell ${state.tables.length + 1}`;
        const table = await createTable(name);
        renderTableList();
        await selectTable(table.id);
    }

    async function handleTableSelect(e) {
        const tableId = parseInt($(e.currentTarget).data('table-id'));
        await selectTable(tableId);
    }

    async function selectTable(tableId) {
        state.currentTable = state.tables.find(t => t.id === tableId);
        if (!state.currentTable) return;

        await loadTableFields(tableId);
        await loadTableData(tableId);
        state.currentRecordIndex = 0;
        state.selectedRows.clear();

        renderTableList();
        showTableDesigner(state.currentTable);
        updateTableInfo();
    }

    async function handleTableNameChange() {
        if (!state.currentTable) return;
        const newName = $('#tableNameInput').val().trim();
        if (newName) {
            await updateTable(state.currentTable.id, { name: newName });
            renderTableList();
            showStatus('Tabellnamn sparat');
        }
    }

    async function handleSaveTable() {
        if (!state.currentTable) return;

        try {
            // Save all fields
            const $rows = $('.field-row');
            const fields = [];

            $rows.each(function (index) {
                const $row = $(this);
                const name = $row.find('.field-name').val().trim();
                if (!name) return;

                const fieldIdAttr = $row.data('field-id');
                // Parse field ID - handle both numeric IDs and "new-X" strings
                let fieldId = undefined;
                if (fieldIdAttr !== undefined && fieldIdAttr !== null) {
                    const parsed = parseInt(fieldIdAttr, 10);
                    if (!isNaN(parsed) && String(fieldIdAttr).indexOf('new-') === -1) {
                        fieldId = parsed;
                    }
                }

                fields.push({
                    id: fieldId,
                    tableId: state.currentTable.id,
                    name: name,
                    type: $row.find('.field-type').val(),
                    required: $row.find('.field-required').is(':checked'),
                    defaultValue: $row.find('.field-default').val(),
                    order: index
                });
            });

            // Delete removed fields
            const currentFieldIds = fields.filter(f => f.id).map(f => f.id);
            for (const field of state.currentTableFields) {
                if (!currentFieldIds.includes(field.id)) {
                    await deleteField(field.id);
                }
            }

            // Save fields
            for (const field of fields) {
                await saveField(field);
            }

            await loadTableFields(state.currentTable.id);
            renderDesignView(); // Re-render to update field IDs in the DOM
            showStatus('Tabell sparad');
            updateTableInfo();
        } catch (error) {
            console.error('Error saving table:', error);
            showStatus('Fel vid sparning', true);
        }
    }

    async function handleDeleteTable() {
        if (!state.currentTable) return;
        if (!confirm(`Vill du verkligen ta bort tabellen "${state.currentTable.name}"?`)) return;

        try {
            await deleteTable(state.currentTable.id);
            renderTableList();
            renderRelationList();
            showWelcomeScreen();
            showStatus('Tabell borttagen');
        } catch (error) {
            console.error('Error deleting table:', error);
            showStatus('Fel vid borttagning', true);
        }
    }

    async function handleAddField() {
        const newField = {
            tableId: state.currentTable.id,
            name: `Fält ${state.currentTableFields.length + 1}`,
            type: 'string',
            required: false,
            defaultValue: '',
            order: state.currentTableFields.length
        };

        // Save to database immediately
        const savedField = await saveField(newField);
        state.currentTableFields.push(savedField);

        // Re-render design view to show new field with correct ID
        renderDesignView();

        // Focus the new field's name input
        const $rows = $('.field-row');
        $rows.last().find('.field-name').focus().select();

        showStatus('Fält tillagt');
    }

    // Debounce timer for field changes
    let fieldSaveTimeout = null;

    function handleFieldChange(e) {
        state.isDirty = true;

        // Clear previous timeout
        clearTimeout(fieldSaveTimeout);

        // Save after 500ms of inactivity
        fieldSaveTimeout = setTimeout(async () => {
            const $row = $(e.target).closest('.field-row');
            if (!$row.length) return;

            const fieldIdAttr = $row.data('field-id');
            let fieldId = undefined;
            if (fieldIdAttr !== undefined && fieldIdAttr !== null) {
                const parsed = parseInt(fieldIdAttr, 10);
                if (!isNaN(parsed) && String(fieldIdAttr).indexOf('new-') === -1) {
                    fieldId = parsed;
                }
            }

            const name = $row.find('.field-name').val().trim();
            if (!name) return; // Don't save empty field names

            const field = {
                id: fieldId,
                tableId: state.currentTable.id,
                name: name,
                type: $row.find('.field-type').val(),
                required: $row.find('.field-required').is(':checked'),
                defaultValue: $row.find('.field-default').val(),
                order: $row.index()
            };

            const savedField = await saveField(field);

            // Update the data-field-id attribute if this was a new field
            if (!fieldId && savedField.id) {
                $row.data('field-id', savedField.id);
                $row.attr('data-field-id', savedField.id);
            }

            // Update state
            const index = state.currentTableFields.findIndex(f => f.id === savedField.id);
            if (index !== -1) {
                state.currentTableFields[index] = savedField;
            }

            showStatus('Fält sparat');
        }, 500);
    }

    async function handleDeleteField(e) {
        const $row = $(e.target).closest('.field-row');
        const fieldId = $row.data('field-id');

        if (typeof fieldId === 'number') {
            await deleteField(fieldId);
        }

        $row.remove();
        state.isDirty = true;
    }

    function handleMoveFieldUp(e) {
        const $row = $(e.target).closest('.field-row');
        const $prev = $row.prev('.field-row');
        if ($prev.length) {
            $row.insertBefore($prev);
            state.isDirty = true;
        }
    }

    function handleMoveFieldDown(e) {
        const $row = $(e.target).closest('.field-row');
        const $next = $row.next('.field-row');
        if ($next.length) {
            $row.insertAfter($next);
            state.isDirty = true;
        }
    }

    function navigateRecord(direction) {
        const newIndex = state.currentRecordIndex + direction;
        if (newIndex >= 0 && newIndex < state.currentTableData.length) {
            state.currentRecordIndex = newIndex;
            renderFormView();
        }
    }

    async function handleNewRecord() {
        const newRecord = {
            tableId: state.currentTable.id,
            data: {}
        };

        // Set default values
        state.currentTableFields.forEach(field => {
            newRecord.data[field.name] = field.defaultValue ?? '';
        });

        const saved = await saveRecord(newRecord);
        state.currentTableData.push(saved);
        state.currentRecordIndex = state.currentTableData.length - 1;
        renderFormView();
        updateTableInfo();
        showStatus('Ny post skapad');
    }

    async function handleSaveRecord() {
        if (state.currentTableData.length === 0) {
            await handleNewRecord();
            return;
        }

        const record = state.currentTableData[state.currentRecordIndex];
        if (!record) return;

        // Validate required fields
        let isValid = true;
        $('.form-input').each(function () {
            const $input = $(this);
            const fieldName = $input.data('field');
            const field = state.currentTableFields.find(f => f.name === fieldName);

            if (field && field.required) {
                const value = $input.attr('type') === 'checkbox' ? $input.is(':checked') : $input.val();
                if (!value && value !== 0) {
                    $input.addClass('invalid');
                    isValid = false;
                } else {
                    $input.removeClass('invalid');
                }
            }
        });

        if (!isValid) {
            showStatus('Fyll i alla obligatoriska fält', true);
            return;
        }

        // Collect data
        const data = {};
        $('.form-input').each(function () {
            const $input = $(this);
            const fieldName = $input.data('field');
            const field = state.currentTableFields.find(f => f.name === fieldName);

            if (field) {
                switch (field.type) {
                    case 'boolean':
                        data[fieldName] = $input.is(':checked');
                        break;
                    case 'number':
                        data[fieldName] = parseInt($input.val()) || 0;
                        break;
                    case 'decimal':
                        data[fieldName] = parseFloat($input.val()) || 0;
                        break;
                    default:
                        data[fieldName] = $input.val();
                }
            }
        });

        record.data = data;
        await saveRecord(record);
        showStatus('Post sparad');
    }

    async function handleDeleteCurrentRecord() {
        if (state.currentTableData.length === 0) return;

        const record = state.currentTableData[state.currentRecordIndex];
        if (!record) return;

        if (!confirm('Vill du verkligen ta bort denna post?')) return;

        await deleteRecord(record.id);

        if (state.currentRecordIndex >= state.currentTableData.length) {
            state.currentRecordIndex = Math.max(0, state.currentTableData.length - 1);
        }

        renderFormView();
        updateTableInfo();
        showStatus('Post borttagen');
    }

    async function handleAddRow() {
        await handleNewRecord();
        renderDataTableView();
    }

    async function handleDeleteSelectedRows() {
        if (state.selectedRows.size === 0) return;
        if (!confirm(`Vill du ta bort ${state.selectedRows.size} valda poster?`)) return;

        for (const recordId of state.selectedRows) {
            await deleteRecord(recordId);
        }

        state.selectedRows.clear();
        renderDataTableView();
        updateTableInfo();
        showStatus('Poster borttagna');
    }

    function handleSelectAll(e) {
        const isChecked = $(e.target).is(':checked');

        if (isChecked) {
            state.currentTableData.forEach(r => state.selectedRows.add(r.id));
        } else {
            state.selectedRows.clear();
        }

        $('.row-select').prop('checked', isChecked);
        $('#dataGridBody tr').toggleClass('selected', isChecked);
    }

    function handleRowSelect(e) {
        const $row = $(e.target).closest('tr');
        const recordId = $row.data('record-id');
        const isChecked = $(e.target).is(':checked');

        if (isChecked) {
            state.selectedRows.add(recordId);
            $row.addClass('selected');
        } else {
            state.selectedRows.delete(recordId);
            $row.removeClass('selected');
        }
    }

    async function handleCellEdit(e) {
        const $cell = $(e.target);
        const recordId = $cell.data('record-id');
        const fieldName = $cell.data('field');
        const newValue = $cell.text().trim();

        const record = state.currentTableData.find(r => r.id === recordId);
        if (!record) return;

        const field = state.currentTableFields.find(f => f.name === fieldName);
        if (!field) return;

        // Parse value based on type
        let parsedValue;
        switch (field.type) {
            case 'number':
                parsedValue = parseInt(newValue) || 0;
                break;
            case 'decimal':
                parsedValue = parseFloat(newValue) || 0;
                break;
            case 'boolean':
                parsedValue = newValue === '✓' || newValue.toLowerCase() === 'ja' || newValue === 'true';
                break;
            default:
                parsedValue = newValue;
        }

        if (!record.data) record.data = {};
        record.data[fieldName] = parsedValue;

        await saveRecord(record);
        showStatus('Ändring sparad');
    }

    // =====================================================
    // Relation Modal
    // =====================================================

    function showRelationModal() {
        populateTableSelects();
        $('#relationModal').removeClass('hidden');
    }

    function hideRelationModal() {
        $('#relationModal').addClass('hidden');
    }

    function populateTableSelects() {
        const options = state.tables.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('');
        $('#fromTable, #toTable').html(options);
        updateFromFields();
        updateToFields();
    }

    async function updateFromFields() {
        const tableId = parseInt($('#fromTable').val());
        const fields = await db._fields.where('tableId').equals(tableId).toArray();
        const options = fields.map(f => `<option value="${f.id}">${escapeHtml(f.name)}</option>`).join('');
        $('#fromField').html(options);
    }

    async function updateToFields() {
        const tableId = parseInt($('#toTable').val());
        const fields = await db._fields.where('tableId').equals(tableId).toArray();
        const options = fields.map(f => `<option value="${f.id}">${escapeHtml(f.name)}</option>`).join('');
        $('#toField').html(options);
    }

    async function handleSaveRelation() {
        const relation = {
            fromTableId: parseInt($('#fromTable').val()),
            fromFieldId: parseInt($('#fromField').val()),
            toTableId: parseInt($('#toTable').val()),
            toFieldId: parseInt($('#toField').val()),
            type: $('#relationType').val()
        };

        await saveRelation(relation);
        renderRelationList();
        hideRelationModal();
        showStatus('Relation skapad');
    }

    async function handleDeleteRelation(e) {
        const relationId = parseInt($(e.target).closest('.relation-item').data('relation-id'));
        await deleteRelation(relationId);
        renderRelationList();
        showStatus('Relation borttagen');
    }

    // =====================================================
    // Import/Export
    // =====================================================

    function showImportModal() {
        $('#importModal').removeClass('hidden');
    }

    function hideImportModal() {
        $('#importModal').addClass('hidden');
    }

    function handleDrop(e) {
        e.preventDefault();
        $('#importDropzone').removeClass('drag-over');

        const files = e.originalEvent.dataTransfer.files;
        if (files.length > 0) {
            importFile(files[0]);
        }
    }

    function handleImportFile(e) {
        const file = e.target.files[0];
        if (file) {
            importFile(file);
        }
    }

    async function importFile(file) {
        try {
            const text = await file.text();
            const data = JSON.parse(text);

            if (data.tables) {
                for (const tableData of data.tables) {
                    const table = await createTable(tableData.name);

                    if (tableData.fields) {
                        for (let i = 0; i < tableData.fields.length; i++) {
                            const field = tableData.fields[i];
                            await saveField({
                                tableId: table.id,
                                name: field.name,
                                type: field.type || 'string',
                                required: field.required || false,
                                defaultValue: field.defaultValue || '',
                                order: i
                            });
                        }
                    }

                    if (tableData.records) {
                        for (const record of tableData.records) {
                            await saveRecord({
                                tableId: table.id,
                                data: record
                            });
                        }
                    }
                }
            }

            await loadTables();
            renderTableList();
            hideImportModal();
            showStatus('Data importerad');
        } catch (error) {
            console.error('Import error:', error);
            showStatus('Fel vid import', true);
        }
    }

    async function handleExport() {
        const exportData = {
            version: 1,
            exported: new Date().toISOString(),
            tables: []
        };

        for (const table of state.tables) {
            const fields = await db._fields.where('tableId').equals(table.id).toArray();
            const records = await db._data.where('tableId').equals(table.id).toArray();

            exportData.tables.push({
                name: table.name,
                fields: fields.map(f => ({
                    name: f.name,
                    type: f.type,
                    required: f.required,
                    defaultValue: f.defaultValue
                })),
                records: records.map(r => r.data)
            });
        }

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `northoffice-data-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);

        showStatus('Data exporterad');
    }

    // =====================================================
    // Utility Functions
    // =====================================================

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // =====================================================
    // Initialize App
    // =====================================================

    init().catch(console.error);
});
