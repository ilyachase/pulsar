import { generateChromeMessages, parseMessagesFile } from '@wxt-dev/i18n/build';
import { fakeBrowser } from 'wxt/testing/fake-browser';

/**
 * WXT's fake browser has no i18n API, so getMessage is served from the real Russian messages
 * (locales/ru.yml, compiled the same way the build does): the tests check the actual wording.
 */
const messages = generateChromeMessages(await parseMessagesFile('locales/ru.yml'));

Object.assign(fakeBrowser, {
  i18n: {
    getMessage: (name: string, substitutions?: string | string[]) => {
      const subs = ([] as string[]).concat(substitutions ?? []);
      return (messages[name]?.message ?? '').replace(/\$(\d)/g, (_, i) => subs[i - 1] ?? '');
    },
  },
});
