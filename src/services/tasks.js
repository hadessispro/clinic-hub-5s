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
  let dbTasks = [];
  try {
    let query = supabase.from('tasks').select('*');
    if (filters.department) query = query.eq('department', filters.department);
    if (filters.assignee) query = query.eq('assignee_code', filters.assignee);
    if (filters.status) query = query.eq('status', filters.status);
    
    const { data, error } = await query.order('created_at', { ascending: false });
    if (!error && data) {
      dbTasks = data.map(mapTaskToUI);
    }
  } catch (error) {
    console.warn('[Tasks Service] getTasks Supabase fetch warning:', error);
  }

  // Merge with locally created custom tasks
  let localCustomTasks = [];
  try {
    localCustomTasks = JSON.parse(localStorage.getItem('clinic_custom_tasks') || '[]');
  } catch (e) { localCustomTasks = []; }

  const combinedMap = new Map();
  dbTasks.forEach(t => combinedMap.set(t.id, t));
  localCustomTasks.forEach(t => combinedMap.set(t.id, t));

  const deletedIds = JSON.parse(localStorage.getItem('clinic_deleted_task_ids') || '[]');
  return Array.from(combinedMap.values()).filter(t => !deletedIds.includes(t.id));
}

export async function createTask(task) {
  const newTask = {
    id: task.id || 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    title: task.title || 'Công việc mới',
    department: task.department || 'all',
    assignee: task.assignee || '',
    status: task.status || 'todo',
    progress: Number(task.progress || 0),
    priority: task.priority || 'medium',
    due: task.due || '',
    hour: task.hour || '9 AM',
    notes: task.notes || '',
    attachmentUrl: task.attachmentUrl || '',
    fileName: task.fileName || ''
  };

  // 1. Save to local custom tasks backup first
  try {
    const localTasks = JSON.parse(localStorage.getItem('clinic_custom_tasks') || '[]');
    localTasks.unshift(newTask);
    localStorage.setItem('clinic_custom_tasks', JSON.stringify(localTasks));
  } catch (e) { console.warn('Save local task backup error:', e); }

  // 2. Try inserting to Supabase DB in background
  try {
    const dbData = mapTaskToDB(newTask);
    const { data, error } = await supabase
      .from('tasks')
      .insert(dbData)
      .select()
      .single();
      
    if (!error && data) {
      return mapTaskToUI(data);
    }
  } catch (error) {
    console.warn('[Tasks Service] Supabase createTask warning, used local sync:', error);
  }

  return newTask;
}

export async function updateTask(id, updates) {
  // Update in local backup
  try {
    const localTasks = JSON.parse(localStorage.getItem('clinic_custom_tasks') || '[]');
    const idx = localTasks.findIndex(t => t.id === id);
    if (idx !== -1) {
      localTasks[idx] = { ...localTasks[idx], ...updates };
      localStorage.setItem('clinic_custom_tasks', JSON.stringify(localTasks));
    }
  } catch (e) { console.warn('Update local task error:', e); }

  // Try updating in Supabase DB
  try {
    const dbData = mapTaskToDB(updates);
    Object.keys(dbData).forEach(key => {
      if (dbData[key] === undefined) delete dbData[key];
    });

    const { data, error } = await supabase
      .from('tasks')
      .update(dbData)
      .eq('id', id)
      .select()
      .single();
      
    if (!error && data) {
      return mapTaskToUI(data);
    }
  } catch (error) {
    console.warn(`[Tasks Service] updateTask (${id}) Supabase warning:`, error);
  }

  return { id, ...updates };
}

export async function deleteTask(id) {
  try {
    // 1. Add to local deletion blacklist
    const deletedIds = JSON.parse(localStorage.getItem('clinic_deleted_task_ids') || '[]');
    if (id && !deletedIds.includes(id)) {
      deletedIds.push(id);
      localStorage.setItem('clinic_deleted_task_ids', JSON.stringify(deletedIds));
    }

    // 2. Remove from local custom tasks
    const localTasks = JSON.parse(localStorage.getItem('clinic_custom_tasks') || '[]');
    const filtered = localTasks.filter(t => t.id !== id);
    localStorage.setItem('clinic_custom_tasks', JSON.stringify(filtered));

    // 3. Delete from Supabase DB
    await supabase.from('tasks').delete().eq('id', id);
  } catch (error) {
    console.warn(`[Tasks Service] deleteTask (${id}) exception caught:`, error);
  }
  return true;
}
