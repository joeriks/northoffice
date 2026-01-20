/**
 * NorthOffice Virtual File System
 * Using IndexedDB for persistent storage
 */

const NorthFS = (function () {
    'use strict';

    const DB_NAME = 'NorthOfficeFS';
    const DB_VERSION = 1;
    const STORE_NAME = 'files';

    let db = null;

    // File types
    const FILE_TYPES = {
        FOLDER: 'folder',
        WORDS: 'words',
        NUMBERS: 'numbers',
        TEXT: 'text',
        UNKNOWN: 'unknown'
    };

    // Get file type from extension
    function getFileType(name) {
        if (!name || name.endsWith('/')) return FILE_TYPES.FOLDER;
        const ext = name.split('.').pop().toLowerCase();
        switch (ext) {
            case 'words': return FILE_TYPES.WORDS;
            case 'numbers': return FILE_TYPES.NUMBERS;
            case 'txt': return FILE_TYPES.TEXT;
            default: return FILE_TYPES.UNKNOWN;
        }
    }

    // Get icon for file type
    function getFileIcon(type) {
        switch (type) {
            case FILE_TYPES.FOLDER: return 'fa-folder';
            case FILE_TYPES.WORDS: return 'fa-file-word';
            case FILE_TYPES.NUMBERS: return 'fa-file-excel';
            case FILE_TYPES.TEXT: return 'fa-file-alt';
            default: return 'fa-file';
        }
    }

    // Get color for file type
    function getFileColor(type) {
        switch (type) {
            case FILE_TYPES.FOLDER: return '#f59e0b';
            case FILE_TYPES.WORDS: return '#6366f1';
            case FILE_TYPES.NUMBERS: return '#10b981';
            case FILE_TYPES.TEXT: return '#64748b';
            default: return '#94a3b8';
        }
    }

    // Initialize database
    async function init() {
        return new Promise((resolve, reject) => {
            if (db) {
                resolve(db);
                return;
            }

            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => reject(request.error);

            request.onsuccess = () => {
                db = request.result;
                resolve(db);
            };

            request.onupgradeneeded = (event) => {
                const database = event.target.result;

                if (!database.objectStoreNames.contains(STORE_NAME)) {
                    const store = database.createObjectStore(STORE_NAME, { keyPath: 'path' });
                    store.createIndex('parent', 'parent', { unique: false });
                    store.createIndex('type', 'type', { unique: false });
                    store.createIndex('name', 'name', { unique: false });
                }
            };
        });
    }

    // Ensure root folder exists
    async function ensureRoot() {
        const root = await getFile('/');
        if (!root) {
            await createFolder('/', '');
        }
    }

    // Create a folder
    async function createFolder(name, parentPath) {
        await init();

        const path = parentPath === '/' ? `/${name}` :
            parentPath === '' ? '/' :
                `${parentPath}/${name}`;

        const folder = {
            path: path,
            name: name || 'Root',
            parent: parentPath || null,
            type: FILE_TYPES.FOLDER,
            created: new Date().toISOString(),
            modified: new Date().toISOString()
        };

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put(folder);

            request.onsuccess = () => resolve(folder);
            request.onerror = () => reject(request.error);
        });
    }

    // Create or update a file
    async function saveFile(name, parentPath, content, metadata = {}) {
        await init();

        const path = parentPath === '/' ? `/${name}` : `${parentPath}/${name}`;
        const type = getFileType(name);

        const file = {
            path: path,
            name: name,
            parent: parentPath,
            type: type,
            content: content,
            size: JSON.stringify(content).length,
            created: metadata.created || new Date().toISOString(),
            modified: new Date().toISOString(),
            ...metadata
        };

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put(file);

            request.onsuccess = () => resolve(file);
            request.onerror = () => reject(request.error);
        });
    }

    // Get a file or folder by path
    async function getFile(path) {
        await init();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(path);

            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
    }

    // List contents of a folder
    async function listFolder(folderPath) {
        await init();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const index = store.index('parent');
            const request = index.getAll(folderPath);

            request.onsuccess = () => {
                const items = request.result || [];
                // Sort: folders first, then by name
                items.sort((a, b) => {
                    if (a.type === FILE_TYPES.FOLDER && b.type !== FILE_TYPES.FOLDER) return -1;
                    if (a.type !== FILE_TYPES.FOLDER && b.type === FILE_TYPES.FOLDER) return 1;
                    return a.name.localeCompare(b.name);
                });
                resolve(items);
            };
            request.onerror = () => reject(request.error);
        });
    }

    // Delete a file or folder
    async function deleteFile(path) {
        await init();

        // If it's a folder, delete all contents first
        const file = await getFile(path);
        if (file && file.type === FILE_TYPES.FOLDER) {
            const contents = await listFolder(path);
            for (const item of contents) {
                await deleteFile(item.path);
            }
        }

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.delete(path);

            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }

    // Rename a file or folder
    async function renameFile(oldPath, newName) {
        await init();

        const file = await getFile(oldPath);
        if (!file) throw new Error('File not found');

        const parentPath = file.parent;
        const newPath = parentPath === '/' ? `/${newName}` : `${parentPath}/${newName}`;

        // If it's a folder, we need to update all children paths too
        if (file.type === FILE_TYPES.FOLDER) {
            const contents = await listFolder(oldPath);
            for (const item of contents) {
                const newItemPath = item.path.replace(oldPath, newPath);
                item.path = newItemPath;
                item.parent = newPath;
                await new Promise((resolve, reject) => {
                    const transaction = db.transaction([STORE_NAME], 'readwrite');
                    const store = transaction.objectStore(STORE_NAME);
                    store.put(item);
                    transaction.oncomplete = resolve;
                    transaction.onerror = reject;
                });
            }
        }

        // Delete old entry
        await deleteFile(oldPath);

        // Create new entry
        file.path = newPath;
        file.name = newName;
        file.modified = new Date().toISOString();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put(file);

            request.onsuccess = () => resolve(file);
            request.onerror = () => reject(request.error);
        });
    }

    // Move a file or folder
    async function moveFile(sourcePath, destFolderPath) {
        const file = await getFile(sourcePath);
        if (!file) throw new Error('File not found');

        const newPath = destFolderPath === '/' ? `/${file.name}` : `${destFolderPath}/${file.name}`;

        // Delete old
        await deleteFile(sourcePath);

        // Create at new location
        file.path = newPath;
        file.parent = destFolderPath;
        file.modified = new Date().toISOString();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put(file);

            request.onsuccess = () => resolve(file);
            request.onerror = () => reject(request.error);
        });
    }

    // Search files by name
    async function searchFiles(query) {
        await init();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();

            request.onsuccess = () => {
                const all = request.result || [];
                const results = all.filter(item =>
                    item.name.toLowerCase().includes(query.toLowerCase())
                );
                resolve(results);
            };
            request.onerror = () => reject(request.error);
        });
    }

    // Get all files (for stats)
    async function getAllFiles() {
        await init();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    // Format file size
    function formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    // Format date
    function formatDate(isoString) {
        const date = new Date(isoString);
        return date.toLocaleDateString('sv-SE') + ' ' + date.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
    }

    // Public API
    return {
        init,
        ensureRoot,
        createFolder,
        saveFile,
        getFile,
        listFolder,
        deleteFile,
        renameFile,
        moveFile,
        searchFiles,
        getAllFiles,
        getFileType,
        getFileIcon,
        getFileColor,
        formatSize,
        formatDate,
        FILE_TYPES
    };
})();

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = NorthFS;
}
