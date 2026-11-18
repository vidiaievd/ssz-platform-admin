import { gemini, modelSpend, spendResponse, speech, whisper } from './spend-fixtures';
import {
  MAX_CHART_SERIES,
  audioHours,
  formatMoney,
  microsIn,
  modelSpendRows,
  spendChart,
  spendTotals,
  toMicros,
} from './spend-model';

describe('spend model', () => {
  it('reads decimal strings as integer micros', () => {
    expect(toMicros('0.486234')).toBe(486_234);
    expect(toMicros('12')).toBe(12_000_000);
    expect(toMicros('1.5')).toBe(1_500_000);
    expect(toMicros('-0.000001')).toBe(-1);
    expect(toMicros('1e3')).toBe(0);
    expect(
      microsIn([
        { amount: '0.1', currency: 'USD' },
        { amount: '0.2', currency: 'USD' },
        { amount: '5', currency: 'EUR' },
      ]),
    ).toBe(300_000); // no float drift: 0.1 + 0.2
  });

  it('shows fractions of a cent, and a tiny amount as "less than"', () => {
    expect(formatMoney(486_234, 'USD', 'en')).toBe('$0.4862');
    expect(formatMoney(12_000_000, 'USD', 'en')).toBe('$12.00');
    expect(formatMoney(0, 'USD', 'en')).toBe('$0.00');
    expect(formatMoney(40, 'USD', 'en')).toBe('< $0.0001');
  });

  it('turns audio into hours', () => {
    expect(audioHours(1_750_221)).toBe(0.49);
  });

  it('builds rows with shares of the USD total; a removed model keeps its id', () => {
    const removed = modelSpend('m-gone', null, { calls: 1 });
    const rows = modelSpendRows(spendResponse([speech, gemini, whisper, removed]));
    expect(rows.map((r) => r.name)).toEqual([
      'Azure Speech',
      'Gemini Flash',
      'NB-Whisper',
      'm-gone',
    ]);
    expect(rows[0].share).toBeCloseTo(486_234 / 655_796, 6);
    expect(rows[0].byCapability.map((c) => c.capability)).toEqual([
      'voice_review',
      'sound_session',
    ]);
    expect(rows[2].share).toBe(0);
    expect(rows[3]).toMatchObject({ removed: true, providerName: null, modality: null });
  });

  it('has no share when the period cost nothing in USD', () => {
    const body = spendResponse([whisper]);
    body.totals.cost = [];
    expect(modelSpendRows(body)[0].share).toBeNull();
  });

  it('names the models whose calls had no price', () => {
    const totals = spendTotals(spendResponse());
    expect(totals.usdMicros).toBe(655_796);
    expect(totals.unpricedModels).toEqual(['Gemini Flash']);
  });

  it('stacks cost per day only for models that cost something', () => {
    const chart = spendChart(spendResponse());
    expect(chart.days).toEqual(['2026-11-12', '2026-11-13', '2026-11-14']);
    expect(chart.series.map((s) => s.key)).toEqual(['m-azure-speech', 'm-gemini']);
    expect(chart.series[0].values).toEqual([0.2, 0, 0.286234]);
    expect(chart.series[1].values).toEqual([0, 0, 0.169562]);
    expect(chart.otherCurrency).toBe(false);
  });

  it('keeps a model on its colour when another period reorders the models', () => {
    const a = spendChart(spendResponse([speech, gemini]));
    const b = spendChart(spendResponse([gemini, speech]));
    const slotOf = (c: typeof a, key: string) => c.series.find((s) => s.key === key)?.slot;
    expect(slotOf(a, 'm-gemini')).toBe(slotOf(b, 'm-gemini'));
    expect(slotOf(a, 'm-azure-speech')).toBe(slotOf(b, 'm-azure-speech'));
  });

  it('folds models past the colour limit into "Other"', () => {
    const many = Array.from({ length: MAX_CHART_SERIES + 2 }, (_, i) =>
      modelSpend(`m-${i}`, `Model ${i}`, { cost: [{ amount: '1.000000', currency: 'USD' }] }),
    );
    const body = spendResponse(many);
    body.daily = [
      {
        day: '2026-11-14',
        calls: 10,
        cost: [],
        byModel: many.map((m) => ({ modelId: m.modelId, calls: 1, cost: m.cost })),
      },
    ];
    const chart = spendChart(body);
    expect(chart.series).toHaveLength(MAX_CHART_SERIES);
    const other = chart.series[chart.series.length - 1];
    expect(other).toMatchObject({ key: 'other', name: null, slot: null, values: [3] });
  });

  it('notes money in another currency that the chart leaves out', () => {
    const body = spendResponse();
    body.totals.cost = [...body.totals.cost, { amount: '2.000000', currency: 'EUR' }];
    expect(spendChart(body).otherCurrency).toBe(true);
  });
});
