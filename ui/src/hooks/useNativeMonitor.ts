import { useCallback, useEffect, useRef, useState } from 'react';
import { createInitialState, receiveNativeMessage } from '../nativeState';
import type { MonitorState } from '../types/monitor';
import { createDemoPayload } from '../utils/demoData';

export function useNativeMonitor() {
  const [state, setState] = useState<MonitorState>(createInitialState);
  const current = useRef(state);
  const isBrowserPreview = typeof window !== 'undefined' && !window.HubNative;

  const update = useCallback((change: (previous: MonitorState) => MonitorState) => {
    // Android can send connection, data and notification links in one task.
    // Keep the imperative back callback current even before React commits.
    const next = change(current.current);
    current.current = next;
    setState(next);
  }, []);

  const loadBrowserDemo = useCallback((customUrl?: string, allowHttpFlag?: boolean) => {
    const now = Date.now();
    const demo = createDemoPayload(now);
    const targetUrl = customUrl?.trim() || demo.connectionUrl;
    update(previous => {
      let next = receiveNativeMessage(previous, {
        type: 'connection',
        url: targetUrl,
        allowHttp: Boolean(allowHttpFlag),
      });
      next = receiveNativeMessage(next, { type: 'status', state: 'online' });
      next = receiveNativeMessage(next, { type: 'stats', data: demo.stats, fetchedAt: now });
      next = receiveNativeMessage(next, { type: 'subscriptions', data: demo.subscriptions });
      next = receiveNativeMessage(next, {
        type: 'notifications',
        enabled: demo.notifications.enabled,
        permission: demo.notifications.permission,
        message: demo.notifications.message,
        lastReadAt: demo.notifications.lastReadAt,
      });
      next = receiveNativeMessage(next, {
        type: 'appUpdate',
        ...demo.appUpdate,
      });
      return next;
    });
  }, [update]);

  useEffect(() => {
    const receive = (serialized: string | Record<string, unknown>) => {
      let message: unknown;
      try { message = typeof serialized === 'string' ? JSON.parse(serialized) : serialized; }
      catch { return; }
      if (!message || typeof message !== 'object' || Array.isArray(message)) return;
      update(previous => receiveNativeMessage(previous, message as Record<string, unknown>));
    };
    const back = () => {
      if (current.current.page !== 'sessionDetail') return false;
      update(previous => ({ ...previous, page: 'sessions' }));
      window.scrollTo(0, 0);
      return true;
    };
    window.receiveNative = receive;
    window.handleBackNavigation = back;
    if (window.HubNative?.ready) {
      window.HubNative.ready();
    } else {
      loadBrowserDemo();
    }
    return () => {
      if (window.receiveNative === receive) delete window.receiveNative;
      if (window.handleBackNavigation === back) delete window.handleBackNavigation;
    };
  }, [update, loadBrowserDemo]);

  return { state, update, isBrowserPreview, loadBrowserDemo };
}
