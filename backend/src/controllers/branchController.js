import { supabase } from '../config/supabaseClient.js';
import { ApiError } from '../middleware/errorHandler.js';
import { requireFields } from '../utils/validators.js';
import { logActivity } from '../utils/activityLog.js';
import { listBranches, clearBranchCache, pinnedBranchId } from '../utils/branches.js';

// GET /api/branches - every branch (inactive ones only for admins), plus
// what this user may pick: pinned staff get exactly one branch.
export async function getBranches(req, res, next) {
  try {
    const rows = await listBranches({ fresh: true });
    const isAdmin = ['super_admin', 'admin'].includes(req.adminUser?.role);
    const pinned = pinnedBranchId(req.adminUser);
    res.json({
      data: isAdmin ? rows : rows.filter((b) => b.is_active),
      pinnedBranchId: pinned,
      homeBranchId: req.adminUser?.branch_id || null,
      canViewAll: !pinned,
    });
  } catch (err) {
    next(err);
  }
}

function cleanCode(code) {
  const value = String(code || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
  if (!value || value.length > 10) throw new ApiError(400, 'Code must be 1-10 letters/digits (e.g. KDD)');
  return value;
}

export async function createBranch(req, res, next) {
  try {
    requireFields(req.body, ['name', 'code']);
    const { name, code, address, phone } = req.body;
    const { data, error } = await supabase
      .from('branches')
      .insert({ name: String(name).trim(), code: cleanCode(code), address: address || null, phone: phone || null, updated_by: req.user.id })
      .select()
      .single();
    if (error) {
      if (error.code === '23505') throw new ApiError(400, `Branch code "${cleanCode(code)}" is already in use.`);
      throw new ApiError(400, error.message);
    }
    clearBranchCache();
    await logActivity(req, { action: 'branch.create', entityType: 'branch', entityId: data.id, branchId: data.id, summary: `Added branch ${data.name} (${data.code})` });
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
}

export async function updateBranch(req, res, next) {
  try {
    const { name, code, address, phone, isActive, isDefault } = req.body;
    const { data: current, error: currentError } = await supabase.from('branches').select('*').eq('id', req.params.id).maybeSingle();
    if (currentError) throw new ApiError(400, currentError.message);
    if (!current) throw new ApiError(404, 'Branch not found');

    const update = { updated_at: new Date().toISOString(), updated_by: req.user.id };
    if (name !== undefined) update.name = String(name).trim();
    if (code !== undefined) update.code = cleanCode(code);
    if (address !== undefined) update.address = address || null;
    if (phone !== undefined) update.phone = phone || null;
    if (isActive !== undefined) {
      if (!isActive && current.is_default) throw new ApiError(400, 'The default branch cannot be deactivated - make another branch the default first.');
      update.is_active = !!isActive;
    }

    if (isDefault === true && !current.is_default) {
      // One default at a time (partial unique index): clear the old one first.
      const { error: clearError } = await supabase.from('branches').update({ is_default: false }).eq('is_default', true);
      if (clearError) throw new ApiError(400, clearError.message);
      update.is_default = true;
      update.is_active = true;
    }

    const { data, error } = await supabase.from('branches').update(update).eq('id', req.params.id).select().single();
    if (error) {
      if (error.code === '23505') throw new ApiError(400, `Branch code "${update.code}" is already in use.`);
      throw new ApiError(400, error.message);
    }
    clearBranchCache();
    await logActivity(req, { action: 'branch.update', entityType: 'branch', entityId: data.id, branchId: data.id, summary: `Updated branch ${data.name} (${data.code})` });
    res.json(data);
  } catch (err) {
    next(err);
  }
}
