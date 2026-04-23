/**
 * Data Store — Supabase persistence layer
 */

import { supabase } from '../services/supabase.js';

// ---- Collaborators ----

export async function getCollaborators() {
  const { data, error } = await supabase
    .from('collaborators')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) { console.error('[Store] getCollaborators:', error.message); return []; }
  return data.map(row => ({
    id: row.id,
    createdAt: row.created_at,
    ...row.data,
  }));
}

export async function saveCollaborators(list) {
  // Replace all collaborators (used for bulk updates)
  const { error: delError } = await supabase.from('collaborators').delete().gte('created_at', '1970-01-01');
  if (delError) { console.error('[Store] saveCollaborators delete:', delError.message); return; }

  if (list.length > 0) {
    const rows = list.map(c => ({
      name: c.name || c.nome,
      role: c.role || c.cargo,
      daily_cost: c.dailyCost || c.daily_cost || c.custoDiario || 0,
      data: c,
    }));
    const { error } = await supabase.from('collaborators').insert(rows);
    if (error) console.error('[Store] saveCollaborators insert:', error.message);
  }
}

export async function addCollaborator(collab) {
  const row = {
    name: collab.name || collab.nome || '',
    role: collab.role || collab.cargo || '',
    daily_cost: collab.dailyCost || collab.custoDiario || 0,
    data: collab,
  };
  const { data, error } = await supabase.from('collaborators').insert(row).select().single();
  if (error) { console.error('[Store] addCollaborator:', error.message); return null; }
  return { ...collab, id: data.id, createdAt: data.created_at };
}

export async function updateCollaborator(id, updates) {
  const { data: existing, error: fetchErr } = await supabase
    .from('collaborators')
    .select('data')
    .eq('id', id)
    .single();
  if (fetchErr) { console.error('[Store] updateCollaborator fetch:', fetchErr.message); return null; }

  const merged = { ...existing.data, ...updates };
  const { data, error } = await supabase
    .from('collaborators')
    .update({
      name: merged.name || merged.nome || '',
      role: merged.role || merged.cargo || '',
      daily_cost: merged.dailyCost || merged.custoDiario || 0,
      data: merged,
    })
    .eq('id', id)
    .select()
    .single();
  if (error) { console.error('[Store] updateCollaborator:', error.message); return null; }
  return { ...merged, id: data.id, updatedAt: data.updated_at };
}

export async function deleteCollaborator(id) {
  const { error } = await supabase.from('collaborators').delete().eq('id', id);
  if (error) console.error('[Store] deleteCollaborator:', error.message);
}

export async function getCollaboratorById(id) {
  const { data, error } = await supabase
    .from('collaborators')
    .select('*')
    .eq('id', id)
    .single();
  if (error) return null;
  return { id: data.id, createdAt: data.created_at, ...data.data };
}

// ---- Simulations ----

export async function getSimulations() {
  const { data, error } = await supabase
    .from('simulations')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) { console.error('[Store] getSimulations:', error.message); return []; }
  return data.map(row => ({
    id: row.id,
    createdAt: row.created_at,
    ...row.data,
  }));
}

export async function saveSimulation(sim) {
  const row = {
    origin: sim.origem || sim.origin || '',
    destination: sim.destino || sim.destination || '',
    type: sim.type || 'simulation',
    modal: sim.modal || '',
    data: sim,
  };
  const { data, error } = await supabase.from('simulations').insert(row).select().single();
  if (error) { console.error('[Store] saveSimulation:', error.message); return null; }
  return { ...sim, id: data.id, createdAt: data.created_at };
}

export async function deleteSimulation(id) {
  const { error } = await supabase.from('simulations').delete().eq('id', id);
  if (error) console.error('[Store] deleteSimulation:', error.message);
}

export async function clearSimulations() {
  const { error } = await supabase.from('simulations').delete().gte('created_at', '1970-01-01');
  if (error) console.error('[Store] clearSimulations:', error.message);
}
