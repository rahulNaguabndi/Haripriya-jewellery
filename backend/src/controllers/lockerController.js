import { supabase } from '../config/supabaseClient.js';
import { ApiError } from '../middleware/errorHandler.js';
import { requireFields } from '../utils/validators.js';

const METAL_TYPES = ['Gold', 'Silver'];

export async function listLockers(req, res, next) {
  try {
    const { data, error } = await supabase.from('lockers').select('*').order('display_order', { ascending: true });
    if (error) throw new ApiError(400, error.message);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

function validateMetalTypes(metalTypes) {
  if (!Array.isArray(metalTypes) || metalTypes.length === 0 || metalTypes.some((m) => !METAL_TYPES.includes(m))) {
    throw new ApiError(400, `metalTypes must be a non-empty array from: ${METAL_TYPES.join(', ')}`);
  }
}

// box_capacity is optional (null = unknown); when set, the visual locker
// view draws that many slots so empty space in the cabinet is visible.
function validateCapacity(boxCapacity) {
  if (boxCapacity == null) return;
  if (!Number.isInteger(boxCapacity) || boxCapacity < 1 || boxCapacity > 1000) {
    throw new ApiError(400, 'boxCapacity must be a whole number between 1 and 1000');
  }
}

export async function createLocker(req, res, next) {
  try {
    requireFields(req.body, ['name', 'metalTypes']);
    const { name, metalTypes, displayOrder, boxCapacity } = req.body;
    validateMetalTypes(metalTypes);
    validateCapacity(boxCapacity);

    const { data, error } = await supabase
      .from('lockers')
      .insert({
        name,
        metal_types: metalTypes,
        display_order: displayOrder ?? 0,
        box_capacity: boxCapacity ?? null,
        updated_by: req.user.id,
      })
      .select()
      .single();
    if (error) throw new ApiError(400, error.message);
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
}

export async function updateLocker(req, res, next) {
  try {
    const { name, metalTypes, displayOrder, boxCapacity } = req.body;
    if (metalTypes !== undefined) validateMetalTypes(metalTypes);
    validateCapacity(boxCapacity);

    const update = { updated_at: new Date().toISOString(), updated_by: req.user.id };
    if (name !== undefined) update.name = name;
    if (metalTypes !== undefined) update.metal_types = metalTypes;
    if (displayOrder !== undefined) update.display_order = displayOrder;
    if (boxCapacity !== undefined) update.box_capacity = boxCapacity;

    const { data, error } = await supabase.from('lockers').update(update).eq('id', req.params.id).select().maybeSingle();
    if (error) throw new ApiError(400, error.message);
    if (!data) throw new ApiError(404, 'Locker not found');
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function deleteLocker(req, res, next) {
  try {
    const { error } = await supabase.from('lockers').delete().eq('id', req.params.id);
    if (error) {
      if (error.code === '23503') {
        throw new ApiError(400, 'This locker still has boxes assigned to it - reassign or remove those boxes first.');
      }
      throw new ApiError(400, error.message);
    }
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}
