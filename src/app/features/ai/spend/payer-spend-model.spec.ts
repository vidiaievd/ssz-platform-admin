import {
  capabilityUsageRows,
  formatCredits,
  othersRow,
  parsePayerType,
  payerIds,
  payerRows,
  weekRows,
} from './payer-spend-model';
import {
  LEARNER,
  SCHOOL_A,
  SCHOOL_B,
  capabilitiesResponse,
  payersResponse,
  weeksResponse,
} from './payer-spend-fixtures';

describe('payer spend model', () => {
  it('reads only known payer kinds from the URL', () => {
    expect(parsePayerType('workspace')).toBe('workspace');
    expect(parsePayerType('platform')).toBe('platform');
    expect(parsePayerType('school')).toBeNull();
    expect(parsePayerType(null)).toBeNull();
  });

  it('asks for names of schools and learners only, once each', () => {
    const dto = payersResponse();
    dto.items.push(
      { ...dto.items[0] },
      { ...dto.items[0], payerType: 'platform', payerId: 'platform' },
    );
    expect(payerIds(dto)).toEqual({ schools: [SCHOOL_A, SCHOOL_B], users: [LEARNER] });
  });

  it('names a school with its slug and card link, a learner by name, the rest by id', () => {
    const rows = payerRows(payersResponse(), {
      schools: new Map([[SCHOOL_A, { name: 'Nordick', slug: 'nordick', kind: 'SCHOOL' }]]),
      users: new Map([[LEARNER, 'Olena']]),
    });
    expect(rows.map((r) => [r.name, r.detail, r.link])).toEqual([
      ['Nordick', 'nordick', `/schools/${SCHOOL_A}`],
      ['Olena', null, null],
      [null, null, null],
    ]);
  });

  it('shares are of the total in exact micros, and the top plus others adds up', () => {
    const dto = payersResponse();
    const rows = payerRows(dto, null);
    expect(rows[0].share).toBe(0.5);
    const others = othersRow(dto)!;
    expect(others.payers).toBe(3);
    const sum = rows.reduce((s, r) => s + r.creditMicros, 0) + others.creditMicros;
    expect(sum).toBe(796_163_000);
  });

  it('has no others row when the top holds every payer, and no share when nothing was charged', () => {
    expect(othersRow(payersResponse({ others: null }))).toBeNull();
    const zero = payersResponse({
      total: {
        calls: 2,
        credits: '0.000000',
        unpricedCalls: 2,
        tokens: payersResponse().total.tokens,
      },
    });
    expect(payerRows(zero, null)[0].share).toBeNull();
  });

  it('keeps the capability order of the server', () => {
    expect(capabilityUsageRows(capabilitiesResponse()).map((r) => r.capability)).toEqual([
      'review_draft',
      'student_assist',
    ]);
  });

  it('scales week bars to the busiest week; an empty week has none', () => {
    const rows = weekRows(weeksResponse());
    expect(rows.map((r) => r.bar)).toEqual([0, 1, 196.163 / 600]);
    expect(rows[0].calls).toBe(0);
  });

  it('formats credits with two decimals and dust as "< 0.01"', () => {
    expect(formatCredits(796_163_000, 'en')).toBe('796.16');
    expect(formatCredits(1_500, 'en')).toBe('< 0.01');
    expect(formatCredits(0, 'en')).toBe('0');
  });
});
