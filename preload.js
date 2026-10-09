const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    saveAs:            (text)     => ipcRenderer.invoke('save-as', text),
    newNote:           ()         => ipcRenderer.invoke('new-note'),
    openFile:          ()         => ipcRenderer.invoke('open-file'),
    getNotes:          ()         => ipcRenderer.invoke('get-notes'),
    saveNoteJson:      (note)     => ipcRenderer.invoke('save-note-json', note),
    deleteNote:        (id)       => ipcRenderer.invoke('delete-note', id),
    setUnsavedChanges: (unsaved)  => ipcRenderer.invoke('set-unsaved-changes', unsaved),
    onMenuAction:      (channel, callback) => ipcRenderer.on(channel, callback),
    getSettings:       ()         => ipcRenderer.invoke('get-settings'),
    saveSettings:      (settings) => ipcRenderer.invoke('save-settings', settings),
    showNotification:  (title, body) => ipcRenderer.send('show-notification', { title, body }),
    exportNotePDF:     (data)     => ipcRenderer.invoke('export-note-pdf', data),
    getTrashNotes:     ()         => ipcRenderer.invoke('get-trash-notes'),
    restoreNote:       (id)       => ipcRenderer.invoke('restore-note', id),
    deleteNoteForever: (id)       => ipcRenderer.invoke('delete-note-forever', id),
    emptyTrash:        ()         => ipcRenderer.invoke('empty-trash'),
});