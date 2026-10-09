window.addEventListener('DOMContentLoaded', async () => {
    const noteEl        = document.getElementById('note');
    const titleInput    = document.getElementById('note-title');
    const saveBtn       = document.getElementById('save');
    const saveAsBtn     = document.getElementById('save-as');
    const openFileBtn   = document.getElementById('open-file');
    const newNoteBtn    = document.getElementById('new-note');
    const allNotesBtn   = document.getElementById('all-notes');
    const trashNotesBtn = document.getElementById('trash-notes');
    const emptyTrashBtn = document.getElementById('empty-trash');
    const noteList      = document.getElementById('note-list');
    const statusEl      = document.getElementById('save_status');
    const searchInput   = document.getElementById('search');

    // ── Dark mode ─────────────────────────────────────────────────────────────
    const darkModeBtn = document.getElementById('dark-mode-toggle');
    let isDarkMode = false;

    function applyDarkMode(enable) {
        isDarkMode = enable;
        document.body.classList.toggle('dark-mode', enable);
        darkModeBtn.textContent = enable ? 'Light Mode' : 'Dark Mode';
    }

    // ── Font size ─────────────────────────────────────────────────────────────
    let currentFontSize = 16;

    function applyFontSize(size) {
        currentFontSize = Math.min(42, Math.max(10, size));
        noteEl.style.fontSize = `${currentFontSize}px`;
    }

    // ── Load settings ─────────────────────────────────────────────────────────
    const settings = await window.electronAPI.getSettings();
    applyFontSize(settings.fontSize || 16);
    applyDarkMode(settings.darkMode || false);

    // ── Word / character count ────────────────────────────────────────────────
    function updateWordCount() {
        const text = noteEl.innerText || '';
        const words = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
        document.getElementById('word-count').textContent =
            `Words: ${words} | Characters: ${text.length}`;
    }

    // ── State ─────────────────────────────────────────────────────────────────
    let notes            = [];
    let currentNoteId    = null;
    let lastSavedContent = '';
    let debounceTimer    = null;
    let viewMode         = 'notes';

    // ── Per-note password storage ─────────────────────────────────────────────
    function pwKey(id) { return 'note_pw_' + id; }
    function getNotePassword(id) {
        const val = localStorage.getItem(pwKey(id));
        return (val !== null && val !== '') ? val : '';
    }
    function setNotePassword(id, pw) {
        if (pw && pw.trim() !== '') {
            localStorage.setItem(pwKey(id), pw.trim());
        } else {
            localStorage.removeItem(pwKey(id));
        }
    }
    function noteIsLocked(id) { return getNotePassword(id) !== ''; }

    // ── Lock-screen overlay ───────────────────────────────────────────────────
    const lockScreen = document.getElementById('lock-screen');
    const lockInput  = document.getElementById('lock-input');
    const lockSubmit = document.getElementById('lock-submit');
    const lockError  = document.getElementById('lock-error');

    let _pendingUnlockId      = null;
    let _pendingUnlockResolve = null;

    function _finishUnlock(success) {
        lockScreen.style.display = 'none';
        lockInput.value          = '';
        lockError.textContent    = '';
        _pendingUnlockId         = null;
        const resolve            = _pendingUnlockResolve;
        _pendingUnlockResolve    = null;
        if (resolve) resolve(success);
    }

    lockSubmit.addEventListener('click', () => {
        if (_pendingUnlockId === null) return;
        const expected = getNotePassword(_pendingUnlockId);
        if (lockInput.value === expected) {
            _finishUnlock(true);
        } else {
            lockError.textContent = 'Incorrect password.';
            lockInput.value = '';
            lockInput.focus();
        }
    });

    lockInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') lockSubmit.click();
    });

    function promptUnlock(id) {
        if (_pendingUnlockResolve) _finishUnlock(false);

        return new Promise(resolve => {
            _pendingUnlockId      = id;
            _pendingUnlockResolve = resolve;
            lockInput.value       = '';
            lockError.textContent = '';
            lockScreen.style.display = 'flex';
            setTimeout(() => lockInput.focus(), 50);
        });
    }

    // ── Set-password modal ────────────────────────────────────────────────────
    const modalOverlay    = document.getElementById('lock-modal-overlay');
    const modalTitle      = document.getElementById('lock-modal-title');
    const modalNewInput   = document.getElementById('lock-modal-new');
    const modalConfirmInp = document.getElementById('lock-modal-confirm');
    const modalCurrentInp = document.getElementById('lock-modal-current');
    const modalError      = document.getElementById('lock-modal-error');
    const modalRemoveBtn  = document.getElementById('lock-modal-remove');
    const modalCancelBtn  = document.getElementById('lock-modal-cancel');
    const modalSaveBtn    = document.getElementById('lock-modal-confirm-btn');
    const setLockBtn      = document.getElementById('set-lock');

    let _modalNoteId = null;

    function openLockModal() {
        if (!currentNoteId) return;
        _modalNoteId = currentNoteId;

        const hasLock = noteIsLocked(_modalNoteId);
        modalTitle.textContent         = hasLock ? 'Change / Remove Password' : 'Set Note Password';
        modalNewInput.value            = '';
        modalConfirmInp.value          = '';
        modalCurrentInp.value          = '';
        modalError.textContent         = '';
        modalCurrentInp.style.display  = hasLock ? 'block' : 'none';
        modalRemoveBtn.style.display   = hasLock ? 'inline-block' : 'none';

        modalOverlay.classList.add('visible');
        setTimeout(() => (hasLock ? modalCurrentInp : modalNewInput).focus(), 50);
    }

    function closeLockModal() {
        modalOverlay.classList.remove('visible');
        _modalNoteId = null;
    }

    modalCancelBtn.addEventListener('click', closeLockModal);
    modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeLockModal(); });

    modalSaveBtn.addEventListener('click', () => {
        if (!_modalNoteId) return;
        const hasLock   = noteIsLocked(_modalNoteId);
        const currentPw = modalCurrentInp.value;
        const newPw     = modalNewInput.value.trim();
        const confirmPw = modalConfirmInp.value.trim();

        if (hasLock && currentPw !== getNotePassword(_modalNoteId)) {
            modalError.textContent = 'Current password is incorrect.';
            return;
        }
        if (newPw === '') {
            modalError.textContent = 'New password cannot be empty.';
            return;
        }
        if (newPw !== confirmPw) {
            modalError.textContent = 'Passwords do not match.';
            return;
        }

        setNotePassword(_modalNoteId, newPw);
        closeLockModal();
        updateLockButton();
        renderNotesList(searchInput.value);
        statusEl.textContent = 'Note password saved.';
        statusEl.style.color = 'gray';
    });

    modalRemoveBtn.addEventListener('click', () => {
        if (!_modalNoteId) return;
        if (modalCurrentInp.value !== getNotePassword(_modalNoteId)) {
            modalError.textContent = 'Current password is incorrect.';
            return;
        }
        setNotePassword(_modalNoteId, '');
        closeLockModal();
        updateLockButton();
        renderNotesList(searchInput.value);
        statusEl.textContent = 'Note lock removed.';
        statusEl.style.color = 'gray';
    });

    setLockBtn.addEventListener('click', () => openLockModal());

    function updateLockButton() {
        if (!currentNoteId) {
            setLockBtn.textContent = '🔓 Lock Note';
            setLockBtn.classList.remove('locked');
            return;
        }
        const locked = noteIsLocked(currentNoteId);
        setLockBtn.textContent = locked ? '🔒 Locked' : '🔓 Lock Note';
        setLockBtn.classList.toggle('locked', locked);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // ── Sidebar ───────────────────────────────────────────────────────────────
    function renderNotesList(filter = '') {
        noteList.innerHTML = '';

        const filtered = filter.trim() === ''
            ? notes
            : notes.filter(n =>
                (n.title || '').toLowerCase().includes(filter.toLowerCase()) ||
                (n.content || '').toLowerCase().includes(filter.toLowerCase())
            );

        filtered.forEach(note => {
            const item = document.createElement('div');
            item.className = 'note-item' + (note.id === currentNoteId ? ' active' : '');

            if (viewMode === 'trash') {
                const isLocked = noteIsLocked(note.id);
                item.innerHTML = `
                    <button class="note-item-restore" data-id="${escapeHtml(note.id)}">Restore</button>
                    <button class="note-item-delete" data-id="${escapeHtml(note.id)}">&times;</button>
                    ${isLocked ? '<span class="note-item-lock-badge">🔒</span>' : ''}
                    <div class="note-item-title">${escapeHtml(note.title || 'Untitled')}</div>
                    <div class="note-item-date">Deleted ${new Date(note.deletedAt).toLocaleDateString()}</div>
                `;

                item.querySelector('.note-item-restore').addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await restoreNote(note.id);
                });

                item.querySelector('.note-item-delete').addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await deleteNoteForever(note.id);
                });
            } else {
                const isLocked = noteIsLocked(note.id);
                item.innerHTML = `
                    <button class="note-item-delete" data-id="${escapeHtml(note.id)}">&times;</button>
                    ${isLocked ? '<span class="note-item-lock-badge">🔒</span>' : ''}
                    <div class="note-item-title">${escapeHtml(note.title || 'Untitled')}</div>
                    <div class="note-item-date">${new Date(note.updatedAt).toLocaleDateString()}</div>
                `;

                item.addEventListener('click', async (e) => {
                    if (e.target.classList.contains('note-item-delete')) return;
                    await switchNote(note.id);
                });

                item.querySelector('.note-item-delete').addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await deleteNote(note.id);
                });
            }

            noteList.appendChild(item);
        });
    }

    // ── Load note into editor ─────────────────────────────────────────────────
    function loadNoteIntoEditor(note) {
        currentNoteId        = note.id;
        titleInput.value     = note.title   || '';
        noteEl.innerHTML     = note.content || '';
        lastSavedContent     = note.content || '';
        statusEl.textContent = '';
        updateWordCount();
        updateLockButton();
        renderNotesList(searchInput.value);
    }

    // ── Switch note ───────────────────────────────────────────────────────────
    async function switchNote(id) {
        if (id === currentNoteId) return;

        if (_pendingUnlockResolve) {
            _finishUnlock(false);
            await new Promise(r => setTimeout(r, 0));
        }

        if (noteEl.innerHTML !== lastSavedContent) {
            const result = await window.electronAPI.newNote();
            if (!result.confirmed) return;
        }

        const note = notes.find(n => n.id === id);
        if (!note) return;

        if (noteIsLocked(id)) {
            const unlocked = await promptUnlock(id);
            if (!unlocked) return;
        }

        loadNoteIntoEditor(note);
    }

    // ── Save ──────────────────────────────────────────────────────────────────
    async function saveCurrentNote() {
        if (!currentNoteId) return;
        clearTimeout(debounceTimer);

        const note = {
            id:      currentNoteId,
            title:   titleInput.value.trim() || 'Untitled',
            content: noteEl.innerHTML
        };

        await window.electronAPI.saveNoteJson(note);
        lastSavedContent = noteEl.innerHTML;

        const idx = notes.findIndex(n => n.id === currentNoteId);
        if (idx !== -1) {
            notes[idx] = { ...notes[idx], ...note, updatedAt: new Date().toISOString() };
        }

        renderNotesList(searchInput.value);
        statusEl.style.color = 'gray';
        statusEl.textContent = `Saved at ${new Date().toLocaleTimeString()}`;
    }

    // ── Delete (soft — moves to trash) ────────────────────────────────────────
    async function deleteNote(id) {
        const result = await window.electronAPI.newNote();
        if (!result.confirmed) return;

        await window.electronAPI.deleteNote(id);
        notes = notes.filter(n => n.id !== id);

        if (currentNoteId === id) {
            currentNoteId        = null;
            titleInput.value     = '';
            noteEl.innerHTML     = '';
            lastSavedContent     = '';
            statusEl.textContent = 'Note moved to Trash.';
            updateLockButton();
        }

        renderNotesList(searchInput.value);
    }

    // ── Restore from trash ────────────────────────────────────────────────────
    async function restoreNote(id) {
        await window.electronAPI.restoreNote(id);
        notes = await window.electronAPI.getTrashNotes();
        renderNotesList(searchInput.value);
        statusEl.textContent = 'Note restored.';
    }

    // ── Delete forever ────────────────────────────────────────────────────────
    async function deleteNoteForever(id) {
        await window.electronAPI.deleteNoteForever(id);
        setNotePassword(id, '');
        notes = notes.filter(note => note.id !== id);
        renderNotesList(searchInput.value);
        statusEl.textContent = 'Note permanently deleted.';
    }

    // ── Export ────────────────────────────────────────────────────────────────
    async function exportNote() {
        const title   = titleInput.value.trim() || 'Untitled';
        const divider = '\u2500'.repeat(title.length);
        const result  = await window.electronAPI.saveAs(`${title}\n${divider}\n\n${noteEl.innerText}`);
        if (result.success) statusEl.textContent = 'Exported ✔';
    }

    // ── Import ────────────────────────────────────────────────────────────────
    async function importFile() {
        const result = await window.electronAPI.openFile();
        if (!result.success) return;

        const now = new Date().toISOString();
        const imported = {
            id:        Date.now().toString(),
            title:     result.filePath.split(/[\\/]/).pop().replace(/\.txt$/i, ''),
            content:   result.content,
            createdAt: now,
            updatedAt: now
        };

        const saveResult = await window.electronAPI.saveNoteJson(imported);
        if (!saveResult.success) {
            statusEl.textContent = 'Import failed ✖';
            statusEl.style.color = '#e05252';
            return;
        }

        notes.unshift(imported);
        loadNoteIntoEditor(imported);
        statusEl.textContent = 'Imported ✔';
    }

    // ── Format toolbar ────────────────────────────────────────────────────────
    document.getElementById('fmt-bold').addEventListener('click', () => {
        document.execCommand('bold');
        noteEl.focus();
    });
    document.getElementById('fmt-italic').addEventListener('click', () => {
        document.execCommand('italic');
        noteEl.focus();
    });
    document.getElementById('fmt-underline').addEventListener('click', () => {
        document.execCommand('underline');
        noteEl.focus();
    });
    document.getElementById('fmt-strikethrough').addEventListener('click', () => {
        document.execCommand('strikeThrough');
        noteEl.focus();
    });

    // ── Font size ─────────────────────────────────────────────────────────────
    document.getElementById('font-increase').addEventListener('click', async () => {
        applyFontSize(currentFontSize + 2);
        await window.electronAPI.saveSettings({ fontSize: currentFontSize });
    });
    document.getElementById('font-decrease').addEventListener('click', async () => {
        applyFontSize(currentFontSize - 2);
        await window.electronAPI.saveSettings({ fontSize: currentFontSize });
    });

    // ── Dark mode ─────────────────────────────────────────────────────────────
    darkModeBtn.addEventListener('click', async () => {
        applyDarkMode(!isDarkMode);
        await window.electronAPI.saveSettings({ darkMode: isDarkMode });
    });

    // ── New note ──────────────────────────────────────────────────────────────
    newNoteBtn.addEventListener('click', async () => {
        if (noteEl.innerHTML !== lastSavedContent) {
            const result = await window.electronAPI.newNote();
            if (!result.confirmed) return;
        }

        // If in trash view, switch back to notes first
        if (viewMode === 'trash') {
            viewMode = 'notes';
            emptyTrashBtn.hidden = true;
            titleInput.disabled = false;
            noteEl.contentEditable = 'true';
            allNotesBtn.classList.remove('active-view');
            trashNotesBtn.classList.remove('active-view');
            notes = await window.electronAPI.getNotes();
        }

        const newNote = {
            id:        Date.now().toString(),
            title:     'Untitled',
            content:   '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        await window.electronAPI.saveNoteJson(newNote);
        notes.unshift(newNote);
        loadNoteIntoEditor(newNote);
        titleInput.focus();
        statusEl.textContent = 'New note created.';
    });

    // ── Save / SaveAs / Open ──────────────────────────────────────────────────
    saveBtn.addEventListener('click', async () => {
        await saveCurrentNote();
        window.electronAPI.showNotification('Note Saved', `"${titleInput.value || 'Untitled'}" has been saved.`);
    });
    saveAsBtn.addEventListener('click',   exportNote);
    openFileBtn.addEventListener('click', importFile);

    // ── Export PDF ────────────────────────────────────────────────────────────
    document.getElementById('export-pdf').addEventListener('click', async () => {
        const title   = titleInput.value.trim() || 'Untitled';
        const content = noteEl.innerText;
        const result  = await window.electronAPI.exportNotePDF({ title, content });
        if (result.success) {
            statusEl.textContent = 'PDF exported ✔';
            statusEl.style.color = 'gray';
        } else if (result.error) {
            statusEl.textContent = 'PDF export failed ✖';
            statusEl.style.color = '#e05252';
        }
    });

    // ── Auto-save ─────────────────────────────────────────────────────────────
    noteEl.addEventListener('input', () => {
        updateWordCount();
        statusEl.textContent = 'Unsaved changes...';
        statusEl.style.color = 'gray';
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(saveCurrentNote, 5000);
    });

    titleInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(saveCurrentNote, 5000);
    });

    // ── Search ────────────────────────────────────────────────────────────────
    searchInput.addEventListener('input', () => renderNotesList(searchInput.value));

    // ── All Notes view ────────────────────────────────────────────────────────
    allNotesBtn.addEventListener('click', async () => {
        viewMode = 'notes';
        notes = await window.electronAPI.getNotes();
        emptyTrashBtn.hidden = true;
        titleInput.disabled = false;
        noteEl.contentEditable = 'true';
        allNotesBtn.classList.add('active-view');
        trashNotesBtn.classList.remove('active-view');
        renderNotesList(searchInput.value);
    });

    // ── Trash view ────────────────────────────────────────────────────────────
    trashNotesBtn.addEventListener('click', async () => {
        viewMode = 'trash';
        notes = await window.electronAPI.getTrashNotes();
        currentNoteId = null;
        titleInput.value = '';
        noteEl.innerHTML = '';
        titleInput.disabled = true;
        noteEl.contentEditable = 'false';
        emptyTrashBtn.hidden = false;
        trashNotesBtn.classList.add('active-view');
        allNotesBtn.classList.remove('active-view');
        updateLockButton();
        renderNotesList(searchInput.value);
    });

    // ── Empty trash ───────────────────────────────────────────────────────────
    emptyTrashBtn.addEventListener('click', async () => {
        await window.electronAPI.emptyTrash();
        notes = [];
        renderNotesList(searchInput.value);
        statusEl.textContent = 'Trash emptied.';
    });

    // ── Menu actions ──────────────────────────────────────────────────────────
    window.electronAPI.onMenuAction('menu-new-note',  () => newNoteBtn.click());
    window.electronAPI.onMenuAction('menu-open-file', () => openFileBtn.click());
    window.electronAPI.onMenuAction('menu-save',      () => saveBtn.click());
    window.electronAPI.onMenuAction('menu-save-as',   () => saveAsBtn.click());

    // ── Init ──────────────────────────────────────────────────────────────────
    notes = await window.electronAPI.getNotes();

    if (notes.length > 0) {
        const mostRecent = notes.reduce((a, b) =>
            new Date(a.updatedAt) > new Date(b.updatedAt) ? a : b
        );
        loadNoteIntoEditor(mostRecent);
    } else {
        newNoteBtn.click();
    }

    renderNotesList(searchInput.value);
});