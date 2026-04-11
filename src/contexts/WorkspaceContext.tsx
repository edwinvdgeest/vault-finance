import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { getCurrentWorkspace, setWorkspace as storageSetWorkspace, listWorkspaces, type WorkspaceDescriptor } from '../lib/storage';

interface WorkspaceContextValue {
  workspace: string;
  workspaces: WorkspaceDescriptor[];
  setWorkspace: (ws: string) => Promise<void>;
  isSwitching: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspace, setWorkspaceState] = useState<string>(() => getCurrentWorkspace());
  const [workspaces, setWorkspaces] = useState<WorkspaceDescriptor[]>([]);
  const [isSwitching, setIsSwitching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listWorkspaces().then(list => {
      if (!cancelled) setWorkspaces(list);
    });
    return () => { cancelled = true; };
  }, []);

  const setWorkspace = useCallback(async (ws: string) => {
    if (ws === workspace) return;
    setIsSwitching(true);
    try {
      await storageSetWorkspace(ws);
      setWorkspaceState(ws);
    } finally {
      setIsSwitching(false);
    }
  }, [workspace]);

  return (
    <WorkspaceContext.Provider value={{ workspace, workspaces, setWorkspace, isSwitching }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within <WorkspaceProvider>');
  return ctx;
}
