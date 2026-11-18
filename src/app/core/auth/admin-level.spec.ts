import { adminLevelAtLeast, isAdminLevel } from './admin-level';

describe('admin levels', () => {
  it('orders support < admin < super', () => {
    expect(adminLevelAtLeast('support', 'support')).toBe(true);
    expect(adminLevelAtLeast('support', 'admin')).toBe(false);
    expect(adminLevelAtLeast('admin', 'support')).toBe(true);
    expect(adminLevelAtLeast('admin', 'super')).toBe(false);
    expect(adminLevelAtLeast('super', 'admin')).toBe(true);
    expect(adminLevelAtLeast('super', 'super')).toBe(true);
  });

  it('admits nothing without a level', () => {
    expect(adminLevelAtLeast(null, 'support')).toBe(false);
    expect(adminLevelAtLeast(undefined, 'support')).toBe(false);
  });

  it('recognises only the three known levels', () => {
    expect(isAdminLevel('admin')).toBe(true);
    expect(isAdminLevel('Admin')).toBe(false);
    expect(isAdminLevel('owner')).toBe(false);
    expect(isAdminLevel(1)).toBe(false);
  });
});
