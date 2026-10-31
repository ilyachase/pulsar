import { describe, expect, it, vi } from 'vitest';
import type { Account } from '../lib/providers/types';
import { markWorkmailMessageRead, toMessages } from '../lib/providers/workmail';

const url = 'https://webmail.mail.eu-west-1.awsapps.com/workmail/?organization=acme';
const page =
  '<meta name="X-amzn-authenticate-csrf" content="first"><meta name="X-amzn-authenticate-csrf-ver" content="2"><meta name="X-amzn-app-instance-id" content="instance">';
const message = toMessages([{ entryid: 'selected', props: { message_flags: 6 } }], url)[0]!;
const account: Account = {
  id: 'workmail:me@acme.com',
  email: 'me@acme.com',
  provider: 'workmail',
  status: 'ok',
  inboxUrl: url,
  unreadCount: 1,
  messages: [message],
};
function server(options: { email?: string; status?: number; flags?: number } = {}) {
  let flags = options.flags ?? 6;
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method !== 'POST') return new Response(page);
    const action = new URL(String(input)).searchParams.keys().next().value;
    if (action === 'authenticate')
      return Response.json({
        user: { smtp_address: options.email ?? 'me@acme.com' },
        tokens: { csrf: 'session' },
      });
    if (action === 'hierarchymodule_list')
      return Response.json({
        hierarchymodule: {
          hierarchymodule1: {
            list: {
              item: [
                {
                  store_entryid: 'store',
                  props: { default_folder_inbox: 'inbox' },
                  folders: { item: [{ entryid: 'inbox', props: { content_unread: 1 } }] },
                },
              ],
            },
          },
        },
      });
    if (action === 'mailitemmodule_save') {
      if (options.status) return new Response('', { status: options.status });
      flags = JSON.parse(String(init?.body)).mailitemmodule.mailitemmodule1.save.props
        .message_flags;
      return Response.json({});
    }
    return Response.json({
      maillistmodule: {
        maillistmodule1: {
          list: { item: [{ entryid: 'selected', props: { message_flags: flags } }] },
        },
      },
    });
  });
}
describe('markWorkmailMessageRead', () => {
  it('sets only the read bit for the selected item and confirms it from a fresh list', async () => {
    const fetchFn = server();
    expect(await markWorkmailMessageRead(account, message, fetchFn)).toBe(true);
    const [, init] = fetchFn.mock.calls.find(([u]) => String(u).includes('mailitemmodule_save'))!;
    expect(JSON.parse(String(init?.body))).toEqual({
      mailitemmodule: {
        mailitemmodule1: {
          save: {
            entryid: 'selected',
            store_entryid: 'store',
            parent_entryid: 'inbox',
            props: { message_flags: 7 },
          },
        },
      },
    });
    expect(new Headers(init?.headers).get('x-amzn-csrf')).toBe('session');
    expect(fetchFn.mock.calls.at(-1)?.[0]).toContain('maillistmodule_list');
  });
  it('does not change another signed-in mailbox', async () => {
    const fetchFn = server({ email: 'other@acme.com' });
    expect(await markWorkmailMessageRead(account, message, fetchFn)).toBe(false);
    expect(fetchFn.mock.calls.some(([u]) => String(u).includes('mailitemmodule_save'))).toBe(false);
  });
  it('rejects foreign hosts and message links before mutation', async () => {
    const fetchFn = server();
    expect(
      await markWorkmailMessageRead(
        { ...account, inboxUrl: 'https://evil.test' },
        message,
        fetchFn,
      ),
    ).toBe(false);
    expect(
      await markWorkmailMessageRead(account, { ...message, url: 'https://evil.test' }, fetchFn),
    ).toBe(false);
    expect(fetchFn.mock.calls.some(([u]) => String(u).includes('mailitemmodule_save'))).toBe(false);
  });
  it('does not hide a message when the save fails', async () => {
    expect(await markWorkmailMessageRead(account, message, server({ status: 403 }))).toBe(false);
  });
  it('accepts an item already confirmed as read without sending another save', async () => {
    const fetchFn = server({ flags: 7 });
    expect(await markWorkmailMessageRead(account, message, fetchFn)).toBe(true);
    expect(fetchFn.mock.calls.some(([u]) => String(u).includes('mailitemmodule_save'))).toBe(false);
  });
});
