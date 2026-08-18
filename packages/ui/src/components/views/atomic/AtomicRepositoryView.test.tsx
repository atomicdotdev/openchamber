import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { I18nProvider } from '@/lib/i18n';
import { AtomicRepositoryView } from './AtomicRepositoryView';

describe('AtomicRepositoryView', () => {
  test('renders a missing directory as unavailable rather than loading forever', () => {
    const markup = renderToStaticMarkup(<I18nProvider><AtomicRepositoryView directory="" /></I18nProvider>);

    expect(markup).toContain('This is not an Atomic repository');
  });
});
