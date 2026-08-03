import { supabase } from '../supabase.js';

/* ── Inventory Items Mapping ── */
export function mapItemToUI(db) {
  if (!db) return null;
  return {
    id: db.id,
    name: db.name,
    category: db.category,
    unit: db.unit,
    stock: Number(db.stock || 0),
    minStock: Number(db.min_stock || 0),
    location: db.location || '',
    supplier: db.supplier || '',
    lastImport: db.last_import || '',
    notes: db.notes || '',
  };
}

export function mapItemToDB(ui) {
  return {
    name: ui.name,
    category: ui.category,
    unit: ui.unit,
    stock: Number(ui.stock || 0),
    min_stock: Number(ui.minStock || 0),
    location: ui.location || '',
    supplier: ui.supplier || '',
    last_import: ui.lastImport || null,
    notes: ui.notes || '',
  };
}

/* ── Purchase Requests Mapping ── */
export function mapPurchaseRequestToUI(db) {
  if (!db) return null;
  return {
    id: db.id,
    itemName: db.item_name,
    category: db.category,
    quantity: Number(db.quantity || 1),
    unit: db.unit,
    requester: db.requester_code,
    department: db.department,
    status: db.status || 'pending',
    reason: db.reason,
    createdAt: db.created_at,
  };
}

export function mapPurchaseRequestToDB(ui) {
  return {
    item_name: ui.itemName,
    category: ui.category,
    quantity: Number(ui.quantity || 1),
    unit: ui.unit,
    requester_code: ui.requester,
    department: ui.department,
    status: ui.status || 'pending',
    reason: ui.reason,
  };
}

/* ── Service API ── */
export async function getInventoryItems() {
  try {
    const { data, error } = await supabase
      .from('inventory_items')
      .select('*')
      .order('name');
      
    if (error) throw error;
    return data.map(mapItemToUI);
  } catch (error) {
    console.error('[Inventory Service] getInventoryItems error:', error);
    throw error;
  }
}

export async function updateInventoryItem(id, updates) {
  try {
    const dbData = mapItemToDB(updates);
    Object.keys(dbData).forEach(key => {
      if (dbData[key] === undefined) delete dbData[key];
    });

    const { data, error } = await supabase
      .from('inventory_items')
      .update(dbData)
      .eq('id', id)
      .select()
      .single();
      
    if (error) throw error;
    return mapItemToUI(data);
  } catch (error) {
    console.error(`[Inventory Service] updateInventoryItem (${id}) error:`, error);
    throw error;
  }
}

export async function createInventoryItem(item) {
  try {
    const dbData = mapItemToDB(item);
    const { data, error } = await supabase
      .from('inventory_items')
      .insert(dbData)
      .select()
      .single();
      
    if (error) throw error;
    return mapItemToUI(data);
  } catch (error) {
    console.error('[Inventory Service] createInventoryItem error:', error);
    throw error;
  }
}

export async function getPurchaseRequests() {
  try {
    const { data, error } = await supabase
      .from('purchase_requests')
      .select('*')
      .order('created_at', { ascending: false });
      
    if (error) throw error;
    return data.map(mapPurchaseRequestToUI);
  } catch (error) {
    console.error('[Inventory Service] getPurchaseRequests error:', error);
    throw error;
  }
}

export async function createPurchaseRequest(request) {
  try {
    const dbData = mapPurchaseRequestToDB(request);
    const { data, error } = await supabase
      .from('purchase_requests')
      .insert(dbData)
      .select()
      .single();
      
    if (error) throw error;
    return mapPurchaseRequestToUI(data);
  } catch (error) {
    console.error('[Inventory Service] createPurchaseRequest error:', error);
    throw error;
  }
}

export async function updatePurchaseRequest(id, updates) {
  try {
    const dbData = mapPurchaseRequestToDB(updates);
    Object.keys(dbData).forEach(key => {
      if (dbData[key] === undefined) delete dbData[key];
    });

    const { data, error } = await supabase
      .from('purchase_requests')
      .update(dbData)
      .eq('id', id)
      .select()
      .single();
      
    if (error) throw error;
    return mapPurchaseRequestToUI(data);
  } catch (error) {
    console.error(`[Inventory Service] updatePurchaseRequest (${id}) error:`, error);
    throw error;
  }
}
