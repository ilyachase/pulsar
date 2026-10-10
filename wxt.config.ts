import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Pulsar',
    description: 'Непрочитанные письма Gmail и Яндекс Почты в одном месте',
    permissions: ['alarms', 'storage', 'declarativeNetRequestWithHostAccess'],
    host_permissions: [
      'https://mail.google.com/*',
      'https://mail.yandex.ru/*',
      'https://mail.yandex.com/*',
    ],
    action: { default_title: 'Pulsar' },
  },
});
