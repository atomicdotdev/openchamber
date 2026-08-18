import React from 'react';

import { PatchDiffViewer } from '@/components/diff/PatchDiffViewer';
import type { DiffViewMode } from '../DiffViewToggle';
import { PlainDiffFallback } from './PlainDiffFallback';

// Loaded lazily from ToolPart: this is the only part of the tool card that
// needs @pierre/diffs' rendering stack (Shiki core + regex engines), so the
// eager chat graph stays free of it and the chunk downloads on the first
// rendered tool diff.

export interface ToolPartDiffPreviewProps {
    diff: string;
    diffViewMode: DiffViewMode;
}

const ToolPartDiffPreview: React.FC<ToolPartDiffPreviewProps> = React.memo(({ diff, diffViewMode }) => {
    return (
        <PatchDiffViewer
            patch={diff}
            viewMode={diffViewMode}
            hideFileHeader
            className="px-1 pb-1 pt-0"
            fallback={<PlainDiffFallback diff={diff} />}
        />
    );
});

ToolPartDiffPreview.displayName = 'ToolPartDiffPreview';

export default ToolPartDiffPreview;
