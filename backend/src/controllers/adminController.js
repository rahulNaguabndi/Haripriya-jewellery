import { supabase } from '../config/supabaseClient.js';
import { ApiError } from '../middleware/errorHandler.js';
import { requireFields } from '../utils/validators.js';

export async function getInterestConfig(req, res, next) {
  try {
    const { data, error } = await supabase
      .from('interest_config')
      .select('*')
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new ApiError(400, error.message);
    if (!data) throw new ApiError(404, 'No active interest configuration found');
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function updateInterestConfig(req, res, next) {
  try {
    requireFields(req.body, ['tiers']);
    const { tiers, compoundingFrequency, configName } = req.body;

    if (!Array.isArray(tiers) || tiers.some((t) => typeof t.minAmount !== 'number' || typeof t.interestRate !== 'number')) {
      throw new ApiError(400, 'tiers must be an array of { minAmount, maxAmount, interestRate }');
    }

    const { data: current } = await supabase
      .from('interest_config')
      .select('*')
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let result;
    if (current) {
      const { data, error } = await supabase
        .from('interest_config')
        .update({
          tiers,
          compounding_frequency: compoundingFrequency || current.compounding_frequency,
          config_name: configName || current.config_name,
          updated_at: new Date().toISOString(),
          updated_by: req.user.id,
        })
        .eq('id', current.id)
        .select()
        .single();
      if (error) throw new ApiError(400, error.message);
      result = data;
    } else {
      const { data, error } = await supabase
        .from('interest_config')
        .insert({
          config_name: configName || 'default',
          is_active: true,
          tiers,
          compounding_frequency: compoundingFrequency || 'annual',
          updated_by: req.user.id,
        })
        .select()
        .single();
      if (error) throw new ApiError(400, error.message);
      result = data;
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getAllConfigs(req, res, next) {
  try {
    const { data, error } = await supabase.from('interest_config').select('*').order('created_at', { ascending: false });
    if (error) throw new ApiError(400, error.message);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function listAdminUsers(req, res, next) {
  try {
    const { data, error } = await supabase.from('admin_users').select('*').order('created_at', { ascending: false });
    if (error) throw new ApiError(400, error.message);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function createAdminUser(req, res, next) {
  try {
    requireFields(req.body, ['email', 'password', 'fullName']);
    const { email, password, fullName, role } = req.body;

    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (authError) throw new ApiError(400, authError.message);

    const { data, error } = await supabase
      .from('admin_users')
      .insert({
        supabase_user_id: authUser.user.id,
        email,
        full_name: fullName,
        role: role || 'staff',
        created_by: req.user.id,
      })
      .select()
      .single();

    if (error) throw new ApiError(400, error.message);
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
}

const VALID_ACCENTS = ['gold', 'ruby', 'emerald', 'sapphire'];

export async function updateMyTheme(req, res, next) {
  try {
    requireFields(req.body, ['mode', 'accent']);
    const { mode, accent } = req.body;

    if (!['light', 'dark'].includes(mode)) {
      throw new ApiError(400, `mode must be one of: light, dark`);
    }
    if (!VALID_ACCENTS.includes(accent)) {
      throw new ApiError(400, `accent must be one of: ${VALID_ACCENTS.join(', ')}`);
    }

    const { data, error } = await supabase
      .from('admin_users')
      .update({ theme_preference: { mode, accent } })
      .eq('supabase_user_id', req.user.id)
      .select()
      .maybeSingle();

    if (error) throw new ApiError(400, error.message);
    if (!data) throw new ApiError(404, 'Admin profile not found for this user');
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function getBrandTheme(req, res, next) {
  try {
    const { data, error } = await supabase
      .from('brand_theme')
      .select('*')
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new ApiError(400, error.message);
    if (!data) throw new ApiError(404, 'No active brand theme found');
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function updateBrandTheme(req, res, next) {
  try {
    requireFields(req.body, ['colors']);
    const { colors } = req.body;

    if (
      typeof colors !== 'object' ||
      colors === null ||
      typeof colors.light !== 'object' ||
      typeof colors.dark !== 'object'
    ) {
      throw new ApiError(400, 'colors must be an object with { light, dark } palettes');
    }

    const { data: current } = await supabase
      .from('brand_theme')
      .select('*')
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let result;
    if (current) {
      const { data, error } = await supabase
        .from('brand_theme')
        .update({ colors, updated_at: new Date().toISOString(), updated_by: req.user.id })
        .eq('id', current.id)
        .select()
        .single();
      if (error) throw new ApiError(400, error.message);
      result = data;
    } else {
      const { data, error } = await supabase
        .from('brand_theme')
        .insert({ is_active: true, colors, updated_by: req.user.id })
        .select()
        .single();
      if (error) throw new ApiError(400, error.message);
      result = data;
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function deactivateAdminUser(req, res, next) {
  try {
    const { data, error } = await supabase
      .from('admin_users')
      .update({ is_active: false })
      .eq('id', req.params.id)
      .select()
      .maybeSingle();

    if (error) throw new ApiError(400, error.message);
    if (!data) throw new ApiError(404, 'Admin user not found');
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}
