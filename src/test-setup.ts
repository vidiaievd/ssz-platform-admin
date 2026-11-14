// Runs before every spec file, after Angular's TestBed is set up.
//
// The first test of a card or page spec renders the whole route tree with PrimeNG. On a cold
// run (right after `ng build`, a busy machine) that takes 3–5 s, so Vitest's default 5 s limit
// cut such a test off. Vitest does not stop a timed-out test: its body keeps running and
// instantiates TestBed again after the reset, and every later `configureTestingModule` in that
// worker failed with "the test module has already been instantiated" — a cascade of 10–53
// unrelated failures that a second run never showed. A wider limit keeps a slow test a slow test.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });
