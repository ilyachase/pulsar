import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Pulsar',
    description: 'Пульс вашей почты',
    permissions: ['alarms', 'storage', 'notifications', 'declarativeNetRequestWithHostAccess'],
    host_permissions: [
      'https://mail.google.com/*',
      'https://mail.yandex.ru/*',
      'https://mail.yandex.com/*',
      'https://mail.360.yandex.ru/*',
      'https://api.passport.yandex.ru/*',
    ],
    action: { default_title: 'Pulsar' },
  },
});
