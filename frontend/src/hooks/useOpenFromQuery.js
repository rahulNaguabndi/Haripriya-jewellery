import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

// `?new=1` (set by the N / B keyboard shortcuts) opens a page's "create"
// dialog once, then drops the param so a refresh doesn't reopen it.
export function useOpenFromQuery(open, param = 'new') {
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get(param) === '1') {
      open();
      const next = new URLSearchParams(searchParams);
      next.delete(param);
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
}
