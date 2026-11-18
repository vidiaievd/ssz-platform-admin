import { model, providers } from '../providers/provider-fixtures';
import { capabilities, gateGroup, gateResponse, thresholds } from './gate-fixtures';
import { directBinding, gateChecks, gateRows, gateSummary, visibleRows } from './review-gate-model';

const registry = {
  models: [model('m-sonnet', 'p-a', 'Sonnet'), model('m-flash', 'p-g', 'Gemini Flash')],
  providers,
};

describe('review gate model', () => {
  it('finds the review_direct binding and names its models', () => {
    const b = directBinding(capabilities(), registry);
    expect(b.kind).toBe('bound');
    if (b.kind !== 'bound') return;
    expect(b.primary.model?.displayName).toBe('Sonnet');
    expect(b.fallback?.id).toBe('m-flash');
    expect(directBinding(capabilities(null), registry)).toEqual({ kind: 'unbound' });
    expect(directBinding([], null)).toEqual({ kind: 'unbound' });
  });

  it('checks each threshold on the exact counts, not the rounded share', () => {
    // 0.849985 rounds to 0.85 but misses the gate.
    const near = gateGroup(
      't',
      'm',
      { accepted: 169997, edited: 0, discarded: 0, untouched: 30003 },
      { drafts: 200 },
    );
    expect(near.keptRate).toBe(0.85);
    expect(gateChecks(near, thresholds)).toEqual({ drafts: true, kept: false, discarded: true });

    const exact = gateGroup(
      't',
      'm',
      { accepted: 85, edited: 0, discarded: 10, untouched: 5 },
      { drafts: 99 },
    );
    expect(gateChecks(exact, thresholds)).toEqual({ drafts: false, kept: true, discarded: true });
  });

  it('has nothing to measure without remarks or without a template', () => {
    const none = gateGroup('t', 'm', { accepted: 0, edited: 0, discarded: 0, untouched: 0 });
    expect(gateChecks(none, thresholds)).toEqual({ drafts: false, kept: null, discarded: null });
    const old = gateGroup(null, 'm', { accepted: 10, edited: 0, discarded: 0, untouched: 0 });
    expect(gateChecks(old, thresholds).kept).toBeNull();
  });

  it('marks the rows of the bound models and keeps the server order', () => {
    const rows = gateRows(gateResponse(), directBinding(capabilities(), registry), registry);
    expect(rows.map((r) => [r.group.templateCode, r.group.modelId, r.role])).toEqual([
      ['short_answer', 'm-sonnet', 'primary'],
      ['translate', 'm-sonnet', 'primary'],
      ['translate', 'm-flash', 'fallback'],
      [null, 'm-sonnet', 'primary'],
    ]);
    expect(rows[1].checks).toEqual({ drafts: true, kept: true, discarded: false });
    expect(new Set(rows.map((r) => r.key)).size).toBe(4);
  });

  it('marks nothing while the binding is unknown', () => {
    const rows = gateRows(gateResponse(), { kind: 'error' }, null);
    expect(rows.every((r) => r.role === null)).toBe(true);
    expect(rows[0].model).toEqual({ id: 'm-sonnet', model: null, provider: null });
    expect(gateSummary(rows, { kind: 'error' })).toEqual({
      templates: 2,
      bound: null,
      notRecordedDrafts: 50,
    });
  });

  it('counts the verdicts of the bound primary model per template', () => {
    const binding = directBinding(capabilities(), registry);
    const rows = gateRows(gateResponse(), binding, registry);
    expect(gateSummary(rows, binding)).toEqual({
      templates: 2,
      bound: { passed: 1, failed: 1, insufficient: 0 },
      notRecordedDrafts: 50,
    });
    expect(visibleRows(rows, true)).toHaveLength(3);
    expect(visibleRows(rows, false)).toHaveLength(4);
  });
});
