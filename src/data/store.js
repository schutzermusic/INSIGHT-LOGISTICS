/**
 * Data Store — LocalStorage persistence layer
 */

const PREFIX = 'mob_';

function getKey(key) {
    return `${PREFIX}${key}`;
}

function load(key) {
    try {
        const data = localStorage.getItem(getKey(key));
        return data ? JSON.parse(data) : null;
    } catch {
        return null;
    }
}

function save(key, data) {
    localStorage.setItem(getKey(key), JSON.stringify(data));
}

// ---- Collaborators ----
export function getCollaborators() {
    return load('collaborators') || [];
}

export function saveCollaborators(list) {
    save('collaborators', list);
}

export function addCollaborator(collab) {
    const list = getCollaborators();
    collab.id = generateId();
    collab.createdAt = new Date().toISOString();
    list.push(collab);
    saveCollaborators(list);
    return collab;
}

export function updateCollaborator(id, data) {
    const list = getCollaborators();
    const idx = list.findIndex(c => c.id === id);
    if (idx === -1) return null;
    list[idx] = { ...list[idx], ...data, updatedAt: new Date().toISOString() };
    saveCollaborators(list);
    return list[idx];
}

export function deleteCollaborator(id) {
    const list = getCollaborators().filter(c => c.id !== id);
    saveCollaborators(list);
}

export function getCollaboratorById(id) {
    return getCollaborators().find(c => c.id === id) || null;
}

// ---- Simulations ----
export function getSimulations() {
    return load('simulations') || [];
}

export function saveSimulation(sim) {
    const list = getSimulations();
    sim.id = generateId();
    sim.createdAt = new Date().toISOString();
    list.unshift(sim); // Most recent first
    // Keep only last 50
    if (list.length > 50) list.length = 50;
    save('simulations', list);
    return sim;
}

export function deleteSimulation(id) {
    const list = getSimulations().filter(s => s.id !== id);
    save('simulations', list);
}

export function clearSimulations() {
    save('simulations', []);
}

// ---- Helpers ----
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}
