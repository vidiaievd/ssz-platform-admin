import { PlanFeatureResponseDto } from '../../api/subscription/models/plan-feature-response-dto';
import {
  EditorRow,
  codeProblem,
  editorFeatures,
  editorRows,
  editorValid,
  rowProblems,
  rowsForAudience,
} from './plan-editor-model';

function feature(
  featureKey: string,
  monthlyCredits: string | null = null,
  enabled = true,
  limits: Record<string, number> = {},
): PlanFeatureResponseDto {
  return { featureKey, enabled, monthlyCredits, limits };
}

const rowOf = (rows: readonly EditorRow[], key: string) => rows.find((r) => r.key === key)!;

function set(rows: EditorRow[], key: string, change: Partial<EditorRow>): EditorRow[] {
  return rows.map((r) => (r.key === key ? { ...r, ...change } : r));
}

describe('editorRows', () => {
  it('lists every catalog key of the audience, with what the version gives', () => {
    const rows = editorRows('workspace', [
      feature('ai.practice', '300', true, { perLearnerMonthlyCredits: 20 }),
      feature('ai.authoring', null),
      feature('school.review_ai_policy', null, false),
      feature('seats.students', null, true, { max: 25 }),
    ]);
    expect(rows.map((r) => r.key)).toEqual([
      'ai.review_draft',
      'ai.review_direct',
      'ai.student_assist',
      'ai.practice',
      'ai.authoring',
      'ai.voice_review',
      'ai.voice_review_pronunciation',
      'school.review_ai_policy',
      'seats.students',
    ]);
    expect(rowOf(rows, 'ai.practice')).toMatchObject({
      state: 'on',
      credits: '300',
      unmetered: false,
      limits: { perLearnerMonthlyCredits: '20' },
    });
    // On without credits = unmetered, ticked.
    expect(rowOf(rows, 'ai.authoring')).toMatchObject({ state: 'on', unmetered: true });
    expect(rowOf(rows, 'school.review_ai_policy').state).toBe('off');
    expect(rowOf(rows, 'seats.students')).toMatchObject({ state: 'on', limits: { max: '25' } });
    expect(rowOf(rows, 'ai.review_draft')).toMatchObject({ state: 'absent', original: null });
  });

  it('leaves seats out for self-study plans, but keeps a listed one as foreign', () => {
    expect(editorRows('individual', []).some((r) => r.key === 'seats.students')).toBe(false);
    const rows = editorRows('individual', [feature('seats.students', null, true, { max: 5 })]);
    expect(rowOf(rows, 'seats.students').foreign).toBe(true);
    expect(rowProblems(rowOf(rows, 'seats.students'))).toEqual([
      { field: 'state', problem: 'foreign' },
    ]);
  });

  it('keeps a key the panel does not know, after the catalog, and sends it back as it was', () => {
    const unknown = feature('scheduling', null, true, { slots: 3 });
    const rows = editorRows('workspace', [unknown]);
    expect(rows.at(-1)).toMatchObject({ key: 'scheduling', kind: null, state: 'on' });
    expect(rowProblems(rows.at(-1)!)).toEqual([]);
    expect(editorFeatures(rows)).toEqual([unknown]);
  });
});

describe('rowProblems', () => {
  const base = editorRows('workspace', []);

  it('asks for credits on a metered key unless "unmetered" is ticked', () => {
    const on = set(base, 'ai.practice', { state: 'on' });
    expect(rowProblems(rowOf(on, 'ai.practice'))).toEqual([
      { field: 'credits', problem: 'required' },
    ]);
    expect(rowProblems(rowOf(set(on, 'ai.practice', { unmetered: true }), 'ai.practice'))).toEqual(
      [],
    );
    for (const bad of ['-1', '1.1234567', '1e3', '12,5', '1234567890123']) {
      expect(rowProblems(rowOf(set(on, 'ai.practice', { credits: bad }), 'ai.practice'))).toEqual([
        { field: 'credits', problem: 'invalid' },
      ]);
    }
    expect(rowProblems(rowOf(set(on, 'ai.practice', { credits: ' 0.5 ' }), 'ai.practice'))).toEqual(
      [],
    );
  });

  it('requires the seat limit and takes only whole numbers there', () => {
    const on = set(base, 'seats.students', { state: 'on' });
    expect(rowProblems(rowOf(on, 'seats.students'))).toEqual([
      { field: 'limit', limit: 'max', problem: 'required' },
    ]);
    const half = set(on, 'seats.students', { limits: { max: '2.5' } });
    expect(rowProblems(rowOf(half, 'seats.students'))).toEqual([
      { field: 'limit', limit: 'max', problem: 'invalid' },
    ]);
    expect(
      rowProblems(rowOf(set(on, 'seats.students', { limits: { max: '0' } }), 'seats.students')),
    ).toEqual([]);
  });

  it('takes optional limits empty, and any non-negative number when given', () => {
    const on = set(base, 'ai.practice', { state: 'on', unmetered: true });
    const limit = (value: string) =>
      rowProblems(
        rowOf(
          set(on, 'ai.practice', { limits: { perLearnerMonthlyCredits: value } }),
          'ai.practice',
        ),
      );
    expect(limit('')).toEqual([]);
    expect(limit('7.5')).toEqual([]);
    expect(limit('-3')).toEqual([
      { field: 'limit', limit: 'perLearnerMonthlyCredits', problem: 'invalid' },
    ]);
    expect(limit('ten')).toHaveLength(1);
  });

  it('checks nothing on a key that is off or left out', () => {
    const off = set(base, 'seats.students', { state: 'off' });
    expect(rowProblems(rowOf(off, 'seats.students'))).toEqual([]);
    expect(editorValid(base)).toBe(true);
  });
});

describe('editorFeatures', () => {
  it('sends the complete list by key: left-out keys go, off carries only the switch', () => {
    let rows = editorRows('workspace', [
      feature('school.review_ai_policy', null, true),
      feature('ai.review_draft', '50'),
    ]);
    rows = set(rows, 'ai.review_draft', { state: 'off' });
    rows = set(rows, 'seats.students', { state: 'on', limits: { max: ' 30 ' } });
    rows = set(rows, 'ai.practice', {
      state: 'on',
      credits: ' 300 ',
      limits: { perLearnerMonthlyCredits: '' },
    });
    rows = set(rows, 'ai.authoring', { state: 'on', unmetered: true, credits: '99' });

    expect(editorFeatures(rows)).toEqual([
      feature('ai.authoring', null),
      feature('ai.practice', '300'),
      feature('ai.review_draft', null, false),
      feature('school.review_ai_policy', null, true),
      feature('seats.students', null, true, { max: 30 }),
    ]);
  });
});

describe('rowsForAudience', () => {
  it('keeps what was set on shared keys and drops the old audience’s own', () => {
    let rows = editorRows('workspace', []);
    rows = set(rows, 'ai.practice', { state: 'on', credits: '10' });
    rows = set(rows, 'seats.students', { state: 'on', limits: { max: '5' } });
    const individual = rowsForAudience(rows, 'individual');
    expect(individual.some((r) => r.key === 'seats.students')).toBe(false);
    expect(rowOf(individual, 'ai.practice')).toMatchObject({ state: 'on', credits: '10' });
    const back = rowsForAudience(individual, 'workspace');
    expect(rowOf(back, 'seats.students').state).toBe('absent');
  });
});

describe('codeProblem', () => {
  it('follows subscription’s plan code rule', () => {
    expect(codeProblem('')).toBe('required');
    expect(codeProblem('  ')).toBe('required');
    expect(codeProblem('school_plus')).toBeNull();
    expect(codeProblem(' school_plus ')).toBeNull();
    for (const bad of ['a', 'School', '1school', 'school-plus', 'x'.repeat(65), '_school']) {
      expect(codeProblem(bad)).toBe('invalid');
    }
  });
});
