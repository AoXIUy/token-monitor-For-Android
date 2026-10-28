import { useCallback, useEffect, useRef, useState } from 'react';
import { createInitialState, receiveNativeMessage } from '../nativeState';
import type { MonitorState } from '../types/monitor';

export function useNativeMonitor() {
  const [state, setState] = useState<MonitorState>(createInitialState);
  const current = useRef(state);
  const update = useCallback((change: (previous: MonitorState) => MonitorState) => {
    // Android can send connection, data and notification links in one task.
    // Keep the imperative back callback current even before React commits.
    const next = change(current.current);
    current.current = next;
    setState(next);
  }, []);

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
    window.HubNative?.ready?.();
    return () => {
      if (window.receiveNative === receive) delete window.receiveNative;
      if (window.handleBackNavigation === back) delete window.handleBackNavigation;
    };
  }, [update]);

  return { state, update };
}
