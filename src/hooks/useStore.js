import { useState, useCallback, useEffect } from 'react';
import {
  getCollaborators as _getCollabs,
  addCollaborator as _addCollab,
  updateCollaborator as _updateCollab,
  deleteCollaborator as _deleteCollab,
  getSimulations as _getSims,
  saveSimulation as _saveSim,
  deleteSimulation as _deleteSim,
  clearSimulations as _clearSims,
} from '../data/store.js';

// Collaborators
export function useCollaborators() {
  const [collaborators, setCollaborators] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const data = await _getCollabs();
    setCollaborators(data);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const addCollaborator = useCallback(async (data) => {
    const result = await _addCollab(data);
    await refresh();
    return result;
  }, [refresh]);

  const updateCollaborator = useCallback(async (id, data) => {
    const result = await _updateCollab(id, data);
    await refresh();
    return result;
  }, [refresh]);

  const deleteCollaborator = useCallback(async (id) => {
    await _deleteCollab(id);
    await refresh();
  }, [refresh]);

  return { collaborators, loading, addCollaborator, updateCollaborator, deleteCollaborator };
}

// Simulations
export function useSimulations() {
  const [simulations, setSimulations] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const data = await _getSims();
    setSimulations(data);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const saveSimulation = useCallback(async (sim) => {
    const result = await _saveSim(sim);
    await refresh();
    return result;
  }, [refresh]);

  const deleteSimulation = useCallback(async (id) => {
    await _deleteSim(id);
    await refresh();
  }, [refresh]);

  const clearSimulations = useCallback(async () => {
    await _clearSims();
    await refresh();
  }, [refresh]);

  return { simulations, loading, saveSimulation, deleteSimulation, clearSimulations };
}
