import { seatCeiling, seatLevel, seatsText } from './seats';

describe('seats', () => {
  it('adds a 10 % grace, rounded up', () => {
    expect(seatCeiling(5)).toBe(6);
    expect(seatCeiling(30)).toBe(33);
    expect(seatCeiling(100)).toBe(110);
  });

  it('grades a school by its seats, as organization does', () => {
    expect(seatLevel(500, null)).toBe('none');
    expect(seatLevel(10, 100)).toBe('ok');
    expect(seatLevel(89, 100)).toBe('ok');
    expect(seatLevel(90, 100)).toBe('near');
    expect(seatLevel(100, 100)).toBe('near');
    expect(seatLevel(101, 100)).toBe('warning');
    expect(seatLevel(109, 100)).toBe('warning');
    expect(seatLevel(110, 100)).toBe('full');
    expect(seatLevel(7, 5)).toBe('full');
    expect(seatLevel(5, 5)).toBe('near');
  });

  it('writes used / limit, or just used without a limit', () => {
    expect(seatsText(87, 100)).toBe('87 / 100');
    expect(seatsText(87, null)).toBe('87');
  });
});
