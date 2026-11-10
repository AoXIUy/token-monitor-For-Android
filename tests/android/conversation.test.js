'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const stateModule = import('../../ui/src/conversationState.js');
const nativeModule = import('../../ui/src/nativeState.js');
const query = { deviceId: 'pc', key: 'codex:example', cursor: '', requestId: 'request-1' };
const revision = 'a'.repeat(24);
const message = { id: '0', role: 'assistant', kind: 'message', timestamp: '', text: '<script>unsafe()</script>plain text', continued: false };
const page = { revision, nextCursor: `${revision}:1`, messages: [message] };

test('conversation requests isolate session, source device, page and request identity', async () => {
  const { beginConversation, receiveConversation } = await stateModule;
  const initial = beginConversation(null, query);
  for (const patch of [{ key: 'antigravity:other' }, { deviceId: 'other' }, { cursor: `${revision}:2` }, { requestId: 'previous' }]) {
    assert.equal(receiveConversation(initial, { ...query, ...patch, page }), initial);
  }
  const loaded = receiveConversation(initial, { ...query, page });
  assert.equal(loaded.loading, false);
  assert.equal(loaded.messages[0].text, message.text);
  const next = { ...query, cursor: loaded.nextCursor, requestId: 'request-2' };
  const pending = beginConversation(loaded, next);
  const complete = receiveConversation(pending, { ...next, page: { ...page, nextCursor: '', messages: [{ ...message, id: '1', text: 'next page' }] } });
  assert.deepEqual(complete.messages.map(item => item.text), [message.text, 'next page']);
  assert.equal(beginConversation(complete, { ...query, deviceId: 'other' }).messages.length, 0);
  assert.equal(beginConversation(complete, query).messages.length, 0);
});

test('malformed or changed pages cannot replace known conversation text', async () => {
  const { beginConversation, receiveConversation } = await stateModule;
  for (const invalid of [{ messages: [{ ...message, role: 'html' }] }, { messages: [{ ...message, text: 'x'.repeat(12001) }] },
    { messages: [{ ...message, text: { url: 'https://evil.test' } }] }, { nextCursor: 'javascript:unsafe' }, { revision: 'bad' }]) {
    const current = receiveConversation(beginConversation(null, query), { ...query, page: { ...page, ...invalid } });
    assert.equal(current.error, 'invalid_response');
    assert.equal(current.messages.length, 0);
  }
  let loaded = receiveConversation(beginConversation(null, query), { ...query, page });
  const next = { ...query, cursor: loaded.nextCursor, requestId: 'newer' };
  loaded = receiveConversation(beginConversation(loaded, next), { ...next, page: { error: 'source_changed' } });
  assert.equal(loaded.error, 'source_changed');
  assert.equal(loaded.messages.length, 1);
});

test('native connection, lifecycle and navigation boundaries discard conversation content and late replies', async () => {
  const { beginConversation } = await stateModule;
  const { createInitialState, receiveNativeMessage } = await nativeModule;
  let state = { ...createInitialState(), page: 'sessionDetail', detailKey: query.key, conversation: beginConversation(null, query) };
  state = receiveNativeMessage(state, { type: 'conversation', ...query, page });
  assert.equal(state.conversation.messages.length, 1);
  const disconnected = receiveNativeMessage(state, { type: 'connection', url: 'https://other.example' });
  assert.equal(disconnected.conversation, null);
  assert.equal(receiveNativeMessage(disconnected, { type: 'conversation', ...query, page }), disconnected);
  const background = receiveNativeMessage(state, { type: 'lifecycle', foreground: false });
  assert.equal(background.conversation, null);
  const returned = receiveNativeMessage(background, { type: 'conversation', ...query, page });
  assert.equal(returned.conversation, null);
  const navigated = { ...state, page: 'sessions' };
  assert.equal(receiveNativeMessage(navigated, { type: 'conversation', ...query, page }), navigated);
});
