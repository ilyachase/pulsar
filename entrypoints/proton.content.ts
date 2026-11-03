/**
 * Proton keeps the session uid in localStorage (ps-<localID>), not in a cookie the extension
 * can see from the site root. Report it so the background can send x-pm-uid.
 */
export default defineContentScript({
  matches: ['https://mail.proton.me/*'],
  runAt: 'document_idle',
  main() {
    const publish = () => {
      const sessions: { localId: number; uid: string }[] = [];
      for (let localId = 0; localId < 20; localId++) {
        const raw = localStorage.getItem(`ps-${localId}`);
        if (!raw) continue;
        try {
          const uid = (JSON.parse(raw) as { UID?: unknown }).UID;
          if (typeof uid === 'string') sessions.push({ localId, uid });
        } catch {
          // A malformed persisted session is not a mailbox.
        }
      }
      if (sessions.length > 0)
        void browser.runtime.sendMessage({ type: 'proton-sessions', sessions });
    };
    publish();
    // Login writes ps-<localID> after the first paint
    setTimeout(publish, 2_000);
    setTimeout(publish, 8_000);
  },
});
