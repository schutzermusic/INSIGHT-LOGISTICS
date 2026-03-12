import { useState, useCallback, useSyncExternalStore } from 'react';
import {
  getCollaborators as _getCollabs,
  saveCollaborators,
  addCollaborator as _addCollab,
  updateCollaborator as _updateCollab,
  deleteCollaborator as _deleteCollab,
  getSimulations as _getSims,
  saveSimulation as _saveSim,
  deleteSimulation as _deleteSim,
  clearSimulations as _clearSims,
} from '../data/store.js';

// Simple event emitter for store changes
let listeners = new Set();
function emitChange() {
  listeners.forEach((l) => l());
}
function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Collaborators
let collabSnapshot = _getCollabs();
function getCollabSnapshot() { return collabSnapshot; }

export function useCollaborators() {
  const collaborators = useSyncExternalStore(subscribe, getCollabSnapshot);

  const addCollaborator = useCallback((data) => {
    const result = _addCollab(data);
    collabSnapshot = _getCollabs();
    emitChange();
    return result;
  }, []);

  const updateCollaborator = useCallback((id, data) => {
    const result = _updateCollab(id, data);
    collabSnapshot = _getCollabs();
    emitChange();
    return result;
  }, []);

  const deleteCollaborator = useCallback((id) => {
    _deleteCollab(id);
    collabSnapshot = _getCollabs();
    emitChange();
  }, []);

  return { collaborators, addCollaborator, updateCollaborator, deleteCollaborator };
}

// Simulations
let simSnapshot = _getSims();
function getSimSnapshot() { return simSnapshot; }

export function useSimulations() {
  const simulations = useSyncExternalStore(subscribe, getSimSnapshot);

  const saveSimulation = useCallback((sim) => {
    const result = _saveSim(sim);
    simSnapshot = _getSims();
    emitChange();
    return result;
  }, []);

  const deleteSimulation = useCallback((id) => {
    _deleteSim(id);
    simSnapshot = _getSims();
    emitChange();
  }, []);

  const clearSimulations = useCallback(() => {
    _clearSims();
    simSnapshot = _getSims();
    emitChange();
  }, []);

  return { simulations, saveSimulation, deleteSimulation, clearSimulations };
}
