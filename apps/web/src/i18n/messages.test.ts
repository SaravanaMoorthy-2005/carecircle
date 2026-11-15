import { describe, expect, it } from 'vitest';
import { messages, translate } from './messages';
describe('CareVoice language fallback', () => {
  it('translates navigation and interpolates names without changing clinical content', () => {
    expect(translate('My Medicines', 'ta')).toBe('என் மருந்துகள்');
    expect(translate('Good morning, {name}', 'hi', { name: 'Alex' })).toContain('Alex');
    expect(translate('Clinician-entered instruction: 1 tablet', 'ta')).toBe(
      'Clinician-entered instruction: 1 tablet',
    );
    expect(translate('Today', 'en')).toBe('Today');
    for (const values of Object.values(messages))
      expect(values.every((value) => value.trim().length > 0)).toBe(true);
  });
});
