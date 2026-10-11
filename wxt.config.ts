import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Pulsar',
    description: 'Пульс вашей почты',
    permissions: ['alarms', 'storage', 'notifications', 'declarativeNetRequestWithHostAccess'],
    // WorkMail hosts differ per organization region; access is requested when the user connects it
    optional_host_permissions: ['https://*.awsapps.com/*'],
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
