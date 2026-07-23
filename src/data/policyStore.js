/**
 * Policy config store — read/update the singleton configuration rows that drive
 * routing and operational cost (§22). Each of these tables is seeded with one
 * default row; the admin Settings screen edits that row in place.
 *
 * Monetary columns are stored in integer centavos (`*_c`); the UI works in BRL
 * and converts at the edge with src/domain/money.js.
 */

import { supabase } from '../services/supabase.js';

/** Config tables the Settings screen manages. */
export const CONFIG_TABLES = {
  connectionBuffers: 'connection_buffer_policies',
  searchLimits: 'search_limit_policies',
  meals: 'meal_policies',
  hotels: 'hotel_policies',
  localTransport: 'local_transport_policies',
  vehicle: 'vehicle_assumptions',
  fuel: 'fuel_prices',
};

/**
 * Fetch the (first/default) row of a config table.
 * @param {string} table
 * @returns {Promise<object|null>}
 */
export async function getConfig(table) {
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .order('created_at', { ascending: true })
    .limit(1);
  if (error) {
    console.error(`[policyStore] getConfig(${table}):`, error.message);
    return null;
  }
  return data?.[0] || null;
}

/**
 * Update a config row by id with a column patch.
 * @param {string} table
 * @param {string} id
 * @param {object} patch — raw column values (centavos for money columns)
 * @returns {Promise<object|null>}
 */
export async function updateConfig(table, id, patch) {
  const { data, error } = await supabase
    .from(table)
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) {
    console.error(`[policyStore] updateConfig(${table}):`, error.message);
    throw new Error(error.message);
  }
  return data;
}
