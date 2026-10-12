import { describe, expect, it } from 'vitest';
import {
  addDisconnected,
  disconnectedProviders,
  disconnectKey,
  removeDisconnected,
  toDisconnected,
  withoutDisconnected,
} from '../lib/disconnected';
import { type Account, failed, signedOut } from '../lib/providers/types';

const acc = (id: string, provider: Account['provider'] = 'gmail'): Account => ({
  id,
  provider,
  email: id.split(':')[1] ?? id,
  status: 'ok',
  unreadCount: 0,
  inboxUrl: '',
  messages: [],
});

describe('disconnectKey', () => {
  it('is the account for a known mailbox, the provider for a whole-service card', () => {
    expect(disconnectKey(acc('gmail:a@gmail.com'))).toBe('gmail:a@gmail.com');
    expect(disconnectKey(signedOut('mailru', 'Почта Mail', '#'))).toBe('mailru');
    expect(disconnectKey(failed('yandex', 'Яндекс Почта', '#', new Error('x')))).toBe('yandex');
  });
});

describe('withoutDisconnected', () => {
  const a = acc('gmail:a@gmail.com');
  const b = acc('gmail:b@gmail.com');
  const y = acc('yandex:1', 'yandex');

  it('drops a disconnected mailbox and keeps the others of that provider', () => {
    expect(withoutDisconnected([a, b, y], [toDisconnected(a)])).toEqual([b, y]);
  });
  it('drops every mailbox of a disconnected service', () => {
    const list = [toDisconnected(failed('yandex', 'Яндекс Почта', '#', 'x'))];
    expect(withoutDisconnected([a, y], list)).toEqual([a]);
    expect([...disconnectedProviders(list)]).toEqual(['yandex']);
  });
});

describe('add/removeDisconnected', () => {
  it('adds once and removes by key', () => {
    const entry = toDisconnected(acc('gmail:a@gmail.com'));
    const list = addDisconnected(addDisconnected([], entry), entry);
    expect(list).toEqual([{ key: 'gmail:a@gmail.com', provider: 'gmail', label: 'a@gmail.com' }]);
    expect(removeDisconnected(list, entry.key)).toEqual([]);
  });
});
