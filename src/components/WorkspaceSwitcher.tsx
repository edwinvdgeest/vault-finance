import { useWorkspace } from '../contexts/WorkspaceContext';

export default function WorkspaceSwitcher() {
  const { workspace, workspaces, setWorkspace, isSwitching } = useWorkspace();

  if (workspaces.length <= 1) return null;

  const current = workspaces.find(w => w.slug === workspace) ?? workspaces[0];

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.25rem',
        padding: '0.25rem',
        borderRadius: '0.5rem',
        background: 'rgba(255,255,255,0.05)',
        border: `1px solid ${current?.accent ?? 'rgba(255,255,255,0.1)'}40`,
        opacity: isSwitching ? 0.6 : 1,
        transition: 'opacity 150ms',
      }}
      role="radiogroup"
      aria-label="Workspace"
    >
      {workspaces.map(ws => {
        const active = ws.slug === workspace;
        return (
          <button
            key={ws.slug}
            role="radio"
            aria-checked={active}
            disabled={isSwitching}
            onClick={() => setWorkspace(ws.slug)}
            style={{
              padding: '0.35rem 0.7rem',
              fontSize: '0.75rem',
              fontWeight: 600,
              borderRadius: '0.375rem',
              border: 'none',
              cursor: isSwitching ? 'wait' : 'pointer',
              color: active ? 'white' : 'rgba(255,255,255,0.6)',
              background: active ? `${ws.accent}33` : 'transparent',
              boxShadow: active ? `inset 0 0 0 1px ${ws.accent}80` : 'none',
              fontFamily: 'inherit',
              whiteSpace: 'nowrap',
              transition: 'background 150ms, color 150ms',
            }}
            title={ws.label}
          >
            {ws.label}
          </button>
        );
      })}
    </div>
  );
}
