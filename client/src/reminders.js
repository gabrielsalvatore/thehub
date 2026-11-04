import { useCallback, useEffect, useRef, useState } from 'react';

const LEAD_MINUTES = 10;

// Desktop notifications 10 minutes before (and at the start of) each timed event.
// Works while the Hub tab is open; localhost counts as a secure context.
export function useMeetingReminders(items) {
  const supported = typeof Notification !== 'undefined';
  const [enabled, setEnabled] = useState(supported && Notification.permission === 'granted');
  const fired = useRef(new Set());

  const enable = useCallback(async () => {
    const result = await Notification.requestPermission();
    setEnabled(result === 'granted');
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const check = () => {
      const now = Date.now();
      for (const it of items) {
        if (it.kind !== 'event' || it.allDay) continue;
        const start = new Date(it.when).getTime();
        const minsAway = (start - now) / 60_000;
        for (const [key, inWindow, body] of [
          ['soon', minsAway <= LEAD_MINUTES && minsAway > LEAD_MINUTES - 2, `Starts in ${Math.round(minsAway)} min`],
          ['now', minsAway <= 0.5 && minsAway > -2, 'Starting now'],
        ]) {
          const id = `${it.id}:${key}`;
          if (!inWindow || fired.current.has(id)) continue;
          fired.current.add(id);
          const n = new Notification(it.title, { body: `${body}${it.location ? ` · ${it.location}` : ''}`, tag: id, requireInteraction: key === 'soon' });
          n.onclick = () => {
            window.focus();
            if (it.joinUrl) window.open(it.joinUrl, '_blank');
          };
        }
      }
    };
    check();
    const timer = setInterval(check, 30_000);
    return () => clearInterval(timer);
  }, [items, enabled]);

  return { supported, enabled, enable };
}
