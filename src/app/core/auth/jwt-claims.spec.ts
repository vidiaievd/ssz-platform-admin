import { decodeAccessClaims } from './jwt-claims';
import { fakeJwt } from './testing';

describe('decodeAccessClaims', () => {
  it('reads sub, email, roles, admin_level and exp', () => {
    const token = fakeJwt({
      sub: 'u-1',
      email: 'ада@example.no',
      role: ['platform_admin', 'tutor'],
      admin_level: 'admin',
      exp: 1_800_000_000,
    });

    expect(decodeAccessClaims(token)).toEqual({
      userId: 'u-1',
      email: 'ада@example.no',
      roles: ['platform_admin', 'tutor'],
      adminLevel: 'admin',
      expiresAt: new Date(1_800_000_000_000),
    });
  });

  it('accepts a single role as a string', () => {
    const claims = decodeAccessClaims(
      fakeJwt({ sub: 'u', email: 'e', role: 'platform_admin', exp: 1 }),
    );
    expect(claims?.roles).toEqual(['platform_admin']);
    expect(claims?.adminLevel).toBeNull();
  });

  it('drops an unknown admin level', () => {
    const claims = decodeAccessClaims(
      fakeJwt({ sub: 'u', email: 'e', exp: 1, admin_level: 'root' }),
    );
    expect(claims?.adminLevel).toBeNull();
  });

  it('rejects what is not a token', () => {
    expect(decodeAccessClaims('abc')).toBeNull();
    expect(decodeAccessClaims('a.!!!.c')).toBeNull();
    expect(decodeAccessClaims(fakeJwt({ email: 'e', exp: 1 }))).toBeNull();
    expect(decodeAccessClaims(fakeJwt({ sub: 'u', email: 'e', exp: '1' }))).toBeNull();
  });
});
