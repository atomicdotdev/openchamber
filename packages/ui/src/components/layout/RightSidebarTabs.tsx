import React from 'react';

import { AtomicVaultPanel } from '@/components/views/atomic/AtomicVaultPanel';
import { useProjectsStore } from '@/stores/useProjectsStore';

export const ProjectContextPanel: React.FC<{
  onActionComplete?: () => void;
  onOpenPlan?: (plan: { id: string; title: string }) => void;
}> = () => {
  const activeProjectId = useProjectsStore((state) => state.activeProjectId);
  const projects = useProjectsStore((state) => state.projects);

  const activeProject = React.useMemo(() => {
    if (activeProjectId) {
      return projects.find((project) => project.id === activeProjectId) ?? projects[0] ?? null;
    }
    return projects[0] ?? null;
  }, [activeProjectId, projects]);

  return (
    /* The vault panel owns its own scroller; a scroller here would nest. */
    <div className="h-full min-h-0 overflow-hidden bg-background">
      <AtomicVaultPanel directory={activeProject?.path ?? null} />
    </div>
  );
};
