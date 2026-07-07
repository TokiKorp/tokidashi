// Chrome de la fenêtre overlay : sans décorations système (GDD §9), il faut
// notre propre poignée de déplacement (data-tauri-drag-region) et un bouton
// pour fermer. L'attribut doit être posé sur chaque élément de la zone : Tauri
// ne déclenche le drag que si la cible du mousedown le porte.

import type { ReactNode } from 'react';
import { isTauri } from '../state/persist';

export async function closeApp(): Promise<void> {
  if (isTauri()) {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().close();
  } else {
    window.close();
  }
}

interface DragBarProps {
  title: ReactNode;
  children?: ReactNode;
}

export function DragBar({ title, children }: DragBarProps) {
  return (
    <div className="drag-bar" data-tauri-drag-region>
      <span className="drag-grip" data-tauri-drag-region>⠿</span>
      <span className="drag-title" data-tauri-drag-region>{title}</span>
      {children}
      <button
        className="btn-close"
        title="Fermer Tokidachi (il sera gelé)"
        onClick={() => void closeApp()}
      >
        ✕
      </button>
    </div>
  );
}
