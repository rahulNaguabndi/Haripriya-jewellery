import { createContext, useCallback, useContext, useRef, useState } from 'react';
import Modal from './Modal.jsx';

const ConfirmContext = createContext(null);

// Branded replacement for window.confirm / window.prompt.
//   const confirm = useConfirm();
//   if (!(await confirm({ title, message, confirmLabel, danger }))) return;
//   const value = await confirm({ title, input: { label, defaultValue, type } }); // null if cancelled
export function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const [value, setValue] = useState('');
  const resolver = useRef(null);

  const confirm = useCallback((options) => {
    setValue(options.input?.defaultValue != null ? String(options.input.defaultValue) : '');
    setDialog(options);
    return new Promise((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  function close(result) {
    resolver.current?.(result);
    resolver.current = null;
    setDialog(null);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {dialog && (
        <Modal title={dialog.title || 'Are you sure?'} onClose={() => close(dialog.input ? null : false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              close(dialog.input ? value : true);
            }}
          >
            {dialog.message && <p style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--text-3)', marginTop: 0 }}>{dialog.message}</p>}
            {dialog.input && (
              <div className="field">
                <label>{dialog.input.label}</label>
                <input
                  autoFocus
                  type={dialog.input.type || 'text'}
                  min={dialog.input.min}
                  value={value}
                  placeholder={dialog.input.placeholder}
                  onChange={(e) => setValue(e.target.value)}
                />
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
              <button type="button" className="btn btn-ghost" onClick={() => close(dialog.input ? null : false)}>
                Cancel
              </button>
              <button type="submit" autoFocus={!dialog.input} className={`btn ${dialog.danger ? 'btn-danger' : 'btn-primary'}`}>
                {dialog.confirmLabel || 'Confirm'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmContext);
}
