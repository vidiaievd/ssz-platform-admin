import en from '../../../../../../public/i18n/en.json';
import nb from '../../../../../../public/i18n/nb.json';
import uk from '../../../../../../public/i18n/uk.json';
import { ACCOUNT_REFUSAL_CODES } from './account-refusals';

describe('account refusal texts', () => {
  it.each([
    ['uk', uk],
    ['en', en],
    ['nb', nb],
  ])('%s has words for every code subscription answers on an account change', (_lang, file) => {
    const errors = (file.schools.plan as { errors: Record<string, string> }).errors;
    expect(Object.keys(errors).sort()).toEqual([...ACCOUNT_REFUSAL_CODES].sort());
    for (const code of ACCOUNT_REFUSAL_CODES) expect(errors[code].trim()).not.toBe('');
    expect(file.reasonDialog.reread.trim()).not.toBe('');
  });
});
