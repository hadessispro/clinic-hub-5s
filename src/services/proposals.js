import { supabase } from '../supabase.js';

export function mapProposalToUI(db) {
  if (!db) return null;
  return {
    id: db.id,
    type: db.proposal_type,
    title: db.title,
    department: db.department,
    requester: db.requester_code,
    amount: Number(db.amount || 0),
    attachmentUrl: db.attachment_url || '',
    fileName: db.file_name || '',
    status: db.status || 'pending',
    reason: db.reason,
    createdAt: db.created_at,
  };
}

export function mapProposalToDB(ui) {
  return {
    proposal_type: ui.type,
    title: ui.title,
    department: ui.department,
    requester_code: ui.requester,
    amount: ui.amount || 0,
    attachment_url: ui.attachmentUrl || null,
    file_name: ui.fileName || null,
    status: ui.status || 'pending',
    reason: ui.reason,
  };
}

export async function getProposals(filters = {}) {
  try {
    let query = supabase.from('proposals').select('*');
    if (filters.requester) {
      query = query.eq('requester_code', filters.requester);
    }
    if (filters.department) {
      query = query.eq('department', filters.department);
    }
    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    return data.map(mapProposalToUI);
  } catch (error) {
    console.error('[Proposals Service] getProposals error:', error);
    throw error;
  }
}

export async function createProposal(proposal) {
  try {
    const dbData = mapProposalToDB(proposal);
    const { data, error } = await supabase
      .from('proposals')
      .insert(dbData)
      .select()
      .single();
      
    if (error) throw error;
    return mapProposalToUI(data);
  } catch (error) {
    console.error('[Proposals Service] createProposal error:', error);
    throw error;
  }
}

export async function updateProposal(id, updates) {
  try {
    const dbData = mapProposalToDB(updates);
    
    // Clean fields we don't want to update unless explicitly passed
    Object.keys(dbData).forEach(key => {
      if (dbData[key] === undefined) delete dbData[key];
    });

    const { data, error } = await supabase
      .from('proposals')
      .update(dbData)
      .eq('id', id)
      .select()
      .single();
      
    if (error) throw error;
    return mapProposalToUI(data);
  } catch (error) {
    console.error(`[Proposals Service] updateProposal (${id}) error:`, error);
    throw error;
  }
}

export async function deleteProposal(id) {
  try {
    const { error } = await supabase
      .from('proposals')
      .delete()
      .eq('id', id);
      
    if (error) throw error;
    return true;
  } catch (error) {
    console.error(`[Proposals Service] deleteProposal (${id}) error:`, error);
    throw error;
  }
}
