import { useCallback, useEffect, useRef, useState } from 'react';
import { createInitialState, receiveNativeMessage } from '../nativeState';
import type { LimitsPrefs, MonitorState } from '../types/monitor';
import { createDemoPayload } from '../utils/demoData';
import { beginConversation } from '../conversationState';
import { loadBrowserLimitsPrefs, saveBrowserLimitsPrefs, sanitizeLimitsPrefs } from '../utils/limitsPrefs';

export function useNativeMonitor() {
  const [state, setState] = useState<MonitorState>(createInitialState);
  const current = useRef(state);
  const conversationSequence = useRef(0);
  const isBrowserPreview = typeof window !== 'undefined' && !window.HubNative;

  const update = useCallback((change: (previous: MonitorState) => MonitorState) => {
    // Android can send connection, data and notification links in one task.
    // Keep the imperative back callback current even before React commits.
    const next = change(current.current);
    current.current = next;
    setState(next);
  }, []);

  const clearConversation = useCallback(() => {
    window.HubNative?.cancelConversation?.();
    update(previous => previous.conversation ? { ...previous, conversation: null } : previous);
  }, [update]);

  const queryConversation = useCallback((deviceId: string, key: string, cursor = '') => {
    const query = { deviceId, key, cursor, requestId: `${Date.now()}-${++conversationSequence.current}` };
    update(previous => ({ ...previous, conversation: beginConversation(previous.conversation, query) }));
    if (window.HubNative?.conversation) window.HubNative.conversation(deviceId, key, cursor, query.requestId);
    else update(previous => receiveNativeMessage(previous, { type: 'conversation', ...query,
      page: { error: window.HubNative ? 'unsupported_app' : 'preview_unavailable' } }));
  }, [update]);

  const saveLimitsPrefs = useCallback((prefs: LimitsPrefs) => {
    const clean = sanitizeLimitsPrefs(prefs);
    update(previous => ({ ...previous, limitsPrefs: clean }));
    if (window.HubNative?.saveLimitsPrefs) {
      window.HubNative.saveLimitsPrefs(JSON.stringify(clean));
    } else {
      saveBrowserLimitsPrefs(clean);
    }
  }, [update]);

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
      next = receiveNativeMessage(next, { type: 'quotaHistory', ...demo.quotaHistory });
      next = receiveNativeMessage(next, { type: 'subscriptions', data: demo.subscriptions });
      next = receiveNativeMessage(next, {
        type: 'notifications',
        enabled: demo.notifications.enabled,
        permission: demo.notifications.permission,
        message: demo.notifications.message,
        lastReadAt: demo.notifications.lastReadAt,
      });
      next = receiveNativeMessage(next, {
        type: 'approvalAlerts',
        ...demo.approvals,
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
      if (document.querySelector('#app-update-dialog[open]')) {
        update(previous => ({ ...previous, dismissedUpdatePrompt: previous.appUpdate.promptToken }));
        window.HubNative?.dismissAppUpdatePrompt?.();
        return true;
      }
      if (document.querySelector('#device-picker-dialog[open]')) {
        window.dispatchEvent(new CustomEvent('tm-close-device-picker'));
        return true;
      }
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
      const savedPrefs = loadBrowserLimitsPrefs();
      loadBrowserDemo();
      update(previous => receiveNativeMessage(previous, { type: 'limitsPrefs', ...savedPrefs }));
    }
    return () => {
      if (window.receiveNative === receive) delete window.receiveNative;
      if (window.handleBackNavigation === back) delete window.handleBackNavigation;
    };
  }, [update, loadBrowserDemo]);

  return { state, update, isBrowserPreview, loadBrowserDemo, queryConversation, clearConversation, saveLimitsPrefs };
}
