import { afterEach, describe, expect, it } from 'vitest';
import { i18n, resolveLanguage, SUPPORTED_LANGUAGES } from './index.js';

afterEach(async () => { await i18n.changeLanguage('en'); });

describe('Russian interface', () => {
  it('discovers Russian and resolves system locale variants', () => {
    expect(SUPPORTED_LANGUAGES).toContainEqual({ code: 'ru', nativeName: 'Русский' });
    for (const systemLocale of ['ru', 'ru-RU', 'ru-BY', 'ru_RU']) {
      expect(resolveLanguage('system', systemLocale)).toBe('ru');
    }
    expect(resolveLanguage('ru', 'en-US')).toBe('ru');
    expect(resolveLanguage('en', 'ru-RU')).toBe('en');
  });

  it('switches common controls between Russian and English', async () => {
    await i18n.changeLanguage('ru');
    expect(i18n.t('common:save')).toBe('Сохранить');
    expect(i18n.t('common:cancel')).toBe('Отмена');
    await i18n.changeLanguage('en');
    expect(i18n.t('common:save')).toBe('Save');
  });

  it.each([
    [0, 'many'], [1, 'one'], [2, 'few'], [5, 'many'], [11, 'many'],
    [21, 'one'], [22, 'few'], [25, 'many'], [101, 'one'], [1.5, 'other'],
  ] as const)('uses the Russian %s plural form without English fallback', (count, category) => {
    const key = 'connectionPanel.forwardClients';
    const result = i18n.t(key, { ns: 'connection', lng: 'ru', count, returnDetails: true });
    expect(result.usedLng).toBe('ru');
    expect(result.exactUsedKey).toBe(`${key}_${category}`);
    expect(result.res).toMatch(/клиент/);
    expect(result.res).not.toContain('{{');
  });
});
