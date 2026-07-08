import { useCallback, useRef, useState } from 'react';
import { useTokidachi } from '../state/store';
import { TRANSLATIONS } from './translations';

export function useConfirm() {
  const { language } = useTokidachi();
  const t = TRANSLATIONS[language];
  const [message, setMessage] = useState<string | null>(null);
  const resolver = useRef<((value: boolean) => void) | undefined>(undefined);

  const confirm = useCallback((msg: string) => {
    setMessage(msg);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = (value: boolean) => {
    setMessage(null);
    resolver.current?.(value);
    resolver.current = undefined;
  };

  const dialog = message !== null ? (
    <div className="panel-backdrop" onClick={(e) => { e.stopPropagation(); settle(false); }}>
      <div className="panel" onClick={(e) => e.stopPropagation()} style={{ width: 'min(92vw, 320px)' }}>
        <p style={{ whiteSpace: 'pre-line' }}>{message}</p>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button className="btn-secondary btn-mini" onClick={() => settle(false)}>{t.dialog_cancel}</button>
          <button className="btn-danger btn-mini" onClick={() => settle(true)}>{t.dialog_confirm}</button>
        </div>
      </div>
    </div>
  ) : null;

  return { confirm, dialog };
}
