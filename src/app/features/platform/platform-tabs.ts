/**
 * Tabs of the "Platform" section (§6.8 of plan 90). Each tab is its own address under
 * `/platform`; `/platform` itself opens the first one. The media cleanup tab comes in step 12.
 */
export const PLATFORM_TABS = ['sessions'] as const;

export type PlatformTab = (typeof PLATFORM_TABS)[number];

export const DEFAULT_PLATFORM_TAB: PlatformTab = 'sessions';
