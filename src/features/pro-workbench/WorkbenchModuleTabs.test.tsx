import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { WorkbenchModuleTabs } from './WorkbenchModuleTabs';

describe('WorkbenchModuleTabs workflow attention', () => {
  it('marks only the one unresolved bottom-nav action without changing tab geometry', () => {
    const html = renderToStaticMarkup(
      <WorkbenchModuleTabs
        activeTab="profile"
        onTabChange={vi.fn()}
        idPrefix="mobile-preview"
        variant="bottom"
        attentionTab="production"
      />,
    );

    expect(html.match(/data-attention="required"/g)).toHaveLength(1);
    expect(html).toContain('data-testid="mobile-preview-production-tab"');
    expect(html).toContain('gellatti-next-action-attention');
    expect(html).toContain('min-h-[var(--pro-bottom-nav-height)]');
  });

  it('stops the attention animation while the required module is open', () => {
    const html = renderToStaticMarkup(
      <WorkbenchModuleTabs
        activeTab="production"
        onTabChange={vi.fn()}
        idPrefix="mobile-preview"
        variant="bottom"
        attentionTab="production"
        expanded
      />,
    );

    expect(html).not.toContain('data-attention="required"');
    expect(html).not.toContain('gellatti-next-action-attention');
  });
});
