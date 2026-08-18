import React from 'react';
import { PatchDiff } from '@pierre/diffs/react';

import { useOptionalThemeSystem } from '@/contexts/useThemeSystem';
import { ensurePierreThemeRegistered } from '@/lib/shiki/appThemeRegistry';
import { getDefaultTheme } from '@/lib/theme/themes';
import { cn } from '@/lib/utils';

const PATCH_DIFF_CSS = `
  [data-diff-header],
  [data-diff] {
    [data-separator] {
      height: 24px !important;
    }
  }
`;

const PATCH_DIFF_METRICS = {
  hunkLineCount: 50,
  lineHeight: 24,
  diffHeaderHeight: 44,
  hunkSeparatorHeight: 24,
  spacing: 0,
};

const usePierreThemeConfig = () => {
  const themeSystem = useOptionalThemeSystem();
  const fallbackLightTheme = React.useMemo(() => getDefaultTheme(false), []);
  const fallbackDarkTheme = React.useMemo(() => getDefaultTheme(true), []);
  const availableThemes = React.useMemo(
    () => themeSystem?.availableThemes ?? [fallbackLightTheme, fallbackDarkTheme],
    [fallbackDarkTheme, fallbackLightTheme, themeSystem?.availableThemes],
  );
  const lightThemeId = themeSystem?.lightThemeId ?? fallbackLightTheme.metadata.id;
  const darkThemeId = themeSystem?.darkThemeId ?? fallbackDarkTheme.metadata.id;
  const lightTheme = availableThemes.find((theme) => theme.metadata.id === lightThemeId) ?? fallbackLightTheme;
  const darkTheme = availableThemes.find((theme) => theme.metadata.id === darkThemeId) ?? fallbackDarkTheme;

  ensurePierreThemeRegistered(lightTheme);
  ensurePierreThemeRegistered(darkTheme);

  return {
    theme: { light: lightTheme.metadata.id, dark: darkTheme.metadata.id },
    themeType: themeSystem?.currentTheme.metadata.variant === 'dark' ? ('dark' as const) : ('light' as const),
  };
};

class PatchDiffErrorBoundary extends React.Component<{
  resetKey: string;
  fallback: React.ReactNode;
  children: React.ReactNode;
}, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidUpdate(previous: { resetKey: string }) {
    if (previous.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  componentDidCatch(error: Error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('Patch diff rendering failed; rendering the raw patch instead.', error);
    }
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

interface PatchDiffViewerProps {
  patch: string;
  viewMode?: 'unified' | 'side-by-side';
  hideFileHeader?: boolean;
  className?: string;
  fallback?: React.ReactNode;
}

const RawPatch = ({ patch }: { patch: string }) => (
  <pre className="m-0 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-[var(--syntax-base-background)] p-2 typography-code text-[var(--syntax-base-foreground)]">
    {patch}
  </pre>
);

export const PatchDiffViewer = React.memo(({
  patch,
  viewMode = 'unified',
  hideFileHeader = false,
  className,
  fallback,
}: PatchDiffViewerProps) => {
  const { theme, themeType } = usePierreThemeConfig();
  const options = React.useMemo(() => ({
    diffStyle: viewMode === 'side-by-side' ? ('split' as const) : ('unified' as const),
    diffIndicators: 'none' as const,
    hunkSeparators: 'line-info-basic' as const,
    lineDiffType: 'none' as const,
    disableFileHeader: hideFileHeader,
    maxLineDiffLength: 1000,
    expansionLineCount: 20,
    overflow: 'wrap' as const,
    theme,
    themeType,
    unsafeCSS: PATCH_DIFF_CSS,
  }), [hideFileHeader, theme, themeType, viewMode]);
  const rawFallback = fallback ?? <RawPatch patch={patch} />;

  return (
    <div className={cn('typography-code', className)}>
      <PatchDiffErrorBoundary resetKey={patch} fallback={rawFallback}>
        <PatchDiff patch={patch} metrics={PATCH_DIFF_METRICS} options={options} className="block w-full" />
      </PatchDiffErrorBoundary>
    </div>
  );
});

PatchDiffViewer.displayName = 'PatchDiffViewer';
