import { transitionsFrom } from './lifecycle-transitions';

describe('lifecycle transitions', () => {
  const names = (status: Parameters<typeof transitionsFrom>[0]) =>
    transitionsFrom(status).map((r) => r.transition);

  it('offers the moves each status allows, as organization does', () => {
    expect(names('active')).toEqual(['suspend', 'close']);
    expect(names('suspended')).toEqual(['reactivate', 'close']);
    expect(names('closed')).toEqual(['restore', 'purge']);
    expect(names('purged')).toEqual([]);
  });

  it('asks for the name before closing at once and before an early purge only', () => {
    const asked = ['active', 'suspended', 'closed']
      .flatMap((s) => transitionsFrom(s as 'active'))
      .filter((r) => r.confirmName)
      .map((r) => r.transition);
    expect(asked).toEqual(['close', 'close', 'purge']);
  });
});
