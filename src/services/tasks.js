import { supabase } from '../supabase.js';

export function mapTaskToUI(db) {
  if (!db) return null;
  return {
    id: db.id,
    title: db.title,
    department: db.department,
    assignee: db.assignee_code,
    status: db.status,
    progress: Number(db.progress || 0),
    priority: db.priority,
    due: db.due_date || '',
    notes: db.notes || '',
    attachmentUrl: db.attachment_url || '',
    fileName: db.file_name || '',
  };
}

export function mapTaskToDB(ui) {
  return {
    title: ui.title,
    department: ui.department,
    assignee_code: ui.assignee,
    status: ui.status || 'todo',
    progress: Number(ui.progress || 0),
    priority: ui.priority || 'medium',
    due_date: ui.due || null,
    notes: ui.notes || '',
    attachment_url: ui.attachmentUrl || null,
    file_name: ui.fileName || null,
  };
}

export async function getTasks(filters = {}) {
  try {
    let query = supabase.from('tasks').select('*');
    
    if (filters.department) {
      query = query.eq('department', filters.department);
    }
    if (filters.assignee) {
      query = query.eq('assignee_code', filters.assignee);
    }
    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    return data.map(mapTaskToUI);
  } catch (error) {
    console.error('[Tasks Service] getTasks error:', error);
    throw error;
  }
}

export async function createTask(task) {
  try {
    const dbData = mapTaskToDB(task);
    const { data, error } = await supabase
      .from('tasks')
      .insert(dbData)
      .select()
      .single();
      
    if (error) throw error;
    return mapTaskToUI(data);
  } catch (error) {
    console.error('[Tasks Service] createTask error:', error);
    throw error;
  }
}

export async function updateTask(id, updates) {
  try {
    const dbData = mapTaskToDB(updates);
    // Remove null or undefined fields we don't want to update unless explicitly passed
    Object.keys(dbData).forEach(key => {
      if (dbData[key] === undefined) delete dbData[key];
    });

    const { data, error } = await supabase
      .from('tasks')
      .update(dbData)
      .eq('id', id)
      .select()
      .single();
      
    if (error) throw error;
    return mapTaskToUI(data);
  } catch (error) {
    console.error(`[Tasks Service] updateTask (${id}) error:`, error);
    throw error;
  }
}

export async function deleteTask(id) {
  try {
    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', id);
      
    if (error) throw error;
    return true;
  } catch (error) {
    console.error(`[Tasks Service] deleteTask (${id}) error:`, error);
    throw error;
  }
}
