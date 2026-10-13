import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getApiBranch, setApiBranch } from '../services/api.js';
import { useAuth } from './AuthContext.jsx';

// Which branch the app is showing. 'all' = every branch (admins); staff
// tied to a branch are pinned to it by the server, and the switcher hides.
// Pages don't read this directly - the api client sends it as a header and
// AppShell remounts the page when it changes, so every page refetches.
const BranchContext = createContext(null);

export function BranchProvider({ children }) {
  const { session } = useAuth();
  const [state, setState] = useState({ loaded: false, branches: [], pinnedBranchId: null, canViewAll: true, homeBranchId: null });
  const [branchId, setBranchId] = useState(getApiBranch());

  const reload = useCallback(async () => {
    try {
      const { data } = await api.get('/branches');
      setState({ loaded: true, branches: data.data || [], pinnedBranchId: data.pinnedBranchId, canViewAll: data.canViewAll, homeBranchId: data.homeBranchId });
    } catch {
      // Table not migrated yet / offline: behave as a single-branch shop.
      setState((s) => ({ ...s, loaded: true }));
    }
  }, []);

  useEffect(() => {
    if (session) reload();
  }, [session, reload]);

  // Settle on a valid choice once we know the branches and the user.
  useEffect(() => {
    if (!state.loaded) return;
    const active = state.branches.filter((b) => b.is_active);
    let next = getApiBranch();
    if (state.pinnedBranchId) next = state.pinnedBranchId;
    else if (next !== 'all' && !active.some((b) => b.id === next)) next = 'all';
    if (active.length <= 1 && !state.pinnedBranchId) next = 'all';
    if (next !== getApiBranch()) setApiBranch(next);
    setBranchId(next);
  }, [state]);

  const selectBranch = useCallback((id) => {
    setApiBranch(id);
    setBranchId(id || 'all');
  }, []);

  const value = useMemo(() => {
    const active = state.branches.filter((b) => b.is_active);
    return {
      ...state,
      activeBranches: active,
      multiBranch: active.length > 1,
      branchId,
      currentBranch: branchId === 'all' ? null : state.branches.find((b) => b.id === branchId) || null,
      selectBranch,
      reload,
    };
  }, [state, branchId, selectBranch, reload]);

  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>;
}

export function useBranch() {
  const ctx = useContext(BranchContext);
  if (!ctx) throw new Error('useBranch must be used within BranchProvider');
  return ctx;
}
