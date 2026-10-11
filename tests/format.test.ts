import { describe, expect, it } from 'vitest';
import { cleanSnippet } from '../entrypoints/popup/format';

describe('cleanSnippet', () => {
  it('drops a leading sender name and subject', () => {
    expect(
      cleanSnippet(
        'Рег.ру Войти Автопродление скоро сработает — продлите домен',
        'Рег.ру',
        'Автопродление скоро сработает',
      ),
    ).toBe('Войти Автопродление скоро сработает — продлите домен');
    expect(cleanSnippet('Выписка за сентябрь: во вложении', 'Банк', 'Выписка за сентябрь')).toBe(
      'во вложении',
    );
    expect(cleanSnippet('github — [repo] CI passed', 'GitHub', '[repo] CI passed')).toBe('');
  });
  it('leaves an ordinary snippet alone', () => {
    expect(cleanSnippet('Привет! Давай перенесём на 15:00', 'Анна', 'Встреча')).toBe(
      'Привет! Давай перенесём на 15:00',
    );
  });
});
