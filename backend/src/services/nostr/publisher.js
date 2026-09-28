function sendToRelay(url, event, { WebSocketImpl, timeoutMs, signal }) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocketImpl(url);
    let finished = false;
    const finish = (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      try { socket.close(); } catch { /* Socket may still be connecting. */ }
      error ? reject(error) : resolve(url);
    };
    const abort = () => finish(new Error('Publication attempt closed'));
    const timer = setTimeout(() => finish(new Error('Relay acknowledgement timeout')), timeoutMs);
    signal.addEventListener('abort', abort, { once: true });
    socket.addEventListener('open', () => {
      try { socket.send(JSON.stringify(['EVENT', event])); } catch (error) { finish(error); }
    });
    socket.addEventListener('message', ({ data }) => {
      let message;
      try { message = JSON.parse(String(data)); } catch { return; }
      if (!Array.isArray(message) || message[0] !== 'OK' || message[1] !== event.id) return;
      if (message[2] === true) finish();
      else if (message[2] === false) finish(new Error('Relay rejected the offer event'));
    });
    socket.addEventListener('error', () => finish(new Error('Relay connection failed')));
    socket.addEventListener('close', () => finish(new Error('Relay closed before acknowledging')));
  });
}
export function createRelayPublisher({ relays, WebSocketImpl = globalThis.WebSocket, timeoutMs = 5000 }) {
  if (!relays.length || !WebSocketImpl) throw new Error('At least one relay and a WebSocket implementation are required');
  return async event => {
    const controller = new AbortController();
    try {
      return await Promise.any(relays.map(url => sendToRelay(url, event, {
        WebSocketImpl, timeoutMs, signal: controller.signal
      })));
    } catch { throw new Error('No configured relay acknowledged the event'); }
    finally { controller.abort(); }
  };
}
