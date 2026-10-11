import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/i18n/module'],
  manifest: {
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    permissions: ['alarms', 'storage', 'notifications', 'declarativeNetRequestWithHostAccess'],
    // WorkMail hosts differ per organization region; access is requested when the user connects it
    optional_host_permissions: ['https://*.awsapps.com/*'],
    host_permissions: [
      'https://mail.google.com/*',
      'https://mail.yandex.ru/*',
      'https://mail.yandex.com/*',
      'https://mail.360.yandex.ru/*',
      'https://api.passport.yandex.ru/*',
      'https://e.mail.ru/*',
      'https://portal.mail.ru/*',
    ],
    action: { default_title: 'Pulsar' },
  },
});
