const { test, beforeEach } = require('node:test')
const assert = require('node:assert')
const paperboyTelegram = require('../src')

let calls
beforeEach(() => {
    calls = []
    global.fetch = async (url, init) => {
        calls.push({ url, body: JSON.parse(init.body) })
        return { json: async () => ({ ok: true, result: { message_id: 1 } }) }
    }
})

test('requires a token', () => {
    assert.throws(() => paperboyTelegram(), /token/)
})

test('requires a chat id and a message', async () => {
    const { sendTelegram } = paperboyTelegram('t')
    await assert.rejects(sendTelegram('1'), /Missing/)
})

test('sends an escaped message to the bot url', async () => {
    const { sendTelegram } = paperboyTelegram('abc')
    const res = await sendTelegram('42', 'body did not contain "<title" & co')
    assert.deepStrictEqual(res, { ok: true, result: { message_id: 1 } })
    assert.strictEqual(calls[0].url, 'https://api.telegram.org/botabc/sendMessage')
    assert.strictEqual(calls[0].body.chat_id, '42')
    assert.strictEqual(calls[0].body.text, 'body did not contain "&lt;title" &amp; co')
    assert.strictEqual(calls[0].body.parse_mode, 'HTML')
    assert.strictEqual(calls[0].body.link_preview_options.is_disabled, true)
    assert.strictEqual(calls[0].body.disable_notification, false)
})

test('raw, code, silent, preview and threadId options', async () => {
    const { sendTelegram, escape } = paperboyTelegram('abc')
    await sendTelegram('42', `<b>${escape('a<b')}</b>`, { raw: true, code: 'x < 1', silent: true, preview: true, threadId: 7 })
    const body = calls[0].body
    assert.strictEqual(body.text, '<b>a&lt;b</b>\n<pre>x &lt; 1</pre>')
    assert.strictEqual(body.disable_notification, true)
    assert.strictEqual(body.link_preview_options.is_disabled, false)
    assert.strictEqual(body.message_thread_id, 7)
})

test('returns the error instead of throwing when Telegram is unreachable', async () => {
    global.fetch = async () => { throw new Error('ECONNREFUSED') }
    const { sendTelegram } = paperboyTelegram('abc')
    const res = await sendTelegram('42', 'hi')
    assert.ok(res instanceof Error)
    assert.strictEqual(res.message, 'ECONNREFUSED')
})
