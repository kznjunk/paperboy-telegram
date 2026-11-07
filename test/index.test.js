const { test, beforeEach } = require('node:test')
const assert = require('node:assert')
const http = require('node:http')
const paperboyTelegram = require('../src')

let calls
let updates

beforeEach(() => {
    calls = []
    updates = []
    global.fetch = async (url, init) => {
        const method = url.split('/').pop()
        const body = JSON.parse(init.body)
        calls.push({ url, method, body })
        if (method === 'getUpdates') {
            const batch = updates.filter(u => u.update_id >= body.offset)
            if (!batch.length) await new Promise((resolve, reject) => {
                const t = setTimeout(resolve, 20)
                init.signal.addEventListener('abort', () => { clearTimeout(t); reject(init.signal.reason) })
            })
            return { json: async () => ({ ok: true, result: batch }) }
        }
        return { json: async () => ({ ok: true, result: { message_id: 1 } }) }
    }
})

const msg = (id, chat, text, extra) => ({ update_id: id, message: Object.assign({ message_id: id, chat: { id: chat }, text }, extra) })
const until = async (check) => { for (let i = 0; i < 100 && !check(); i++) await new Promise(r => setTimeout(r, 10)) }

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

test('raw, code, silent, preview, threadId and replyTo options', async () => {
    const { sendTelegram, escape } = paperboyTelegram('abc')
    await sendTelegram('42', `<b>${escape('a<b')}</b>`, { raw: true, code: 'x < 1', silent: true, preview: true, threadId: 7, replyTo: 99 })
    const body = calls[0].body
    assert.strictEqual(body.text, '<b>a&lt;b</b>\n<pre>x &lt; 1</pre>')
    assert.strictEqual(body.disable_notification, true)
    assert.strictEqual(body.link_preview_options.is_disabled, false)
    assert.strictEqual(body.message_thread_id, 7)
    assert.strictEqual(body.reply_parameters.message_id, 99)
})

test('returns the error instead of throwing when Telegram is unreachable', async () => {
    global.fetch = async () => { throw new Error('ECONNREFUSED') }
    const { sendTelegram } = paperboyTelegram('abc')
    const res = await sendTelegram('42', 'hi')
    assert.ok(res instanceof Error)
    assert.strictEqual(res.message, 'ECONNREFUSED')
})

test('listen hands each message once, in order, and moves the offset', async () => {
    updates = [msg(10, 42, 'first'), msg(11, 42, 'ack', { reply_to_message: { message_id: 5 } })]
    const seen = []
    const { listen } = paperboyTelegram('abc')
    const stop = listen(m => { seen.push(m) })
    await until(() => seen.length === 2 && calls.length >= 3)
    await stop()
    assert.deepStrictEqual(seen.map(m => m.text), ['first', 'ack'])
    assert.strictEqual(seen[1].reply_to_message.message_id, 5)
    assert.strictEqual(calls[0].body.offset, 0)
    assert.strictEqual(calls[calls.length - 1].body.offset, 12)
})

test('listen ignores chats that are not allowed', async () => {
    updates = [msg(1, 666, 'stranger'), msg(2, 42, 'me')]
    const seen = []
    const { listen } = paperboyTelegram('abc')
    const stop = listen(m => { seen.push(m.text) }, { chats: [42] })
    await until(() => calls.length >= 2)
    await stop()
    assert.deepStrictEqual(seen, ['me'])
})

test('listen survives a failing handler and a refused call', async () => {
    let refused = false
    const real = global.fetch
    global.fetch = async (url, init) => {
        if (!refused) { refused = true; return { json: async () => ({ ok: false, error_code: 409, description: 'Conflict' }) } }
        return real(url, init)
    }
    updates = [msg(1, 42, 'boom'), msg(2, 42, 'fine')]
    const errors = []
    const seen = []
    const { listen } = paperboyTelegram('abc')
    const stop = listen(m => { if (m.text === 'boom') throw new Error('handler broke'); seen.push(m.text) }, { retry: 10, onError: e => errors.push(e.message) })
    await until(() => seen.length === 1)
    await stop()
    assert.deepStrictEqual(seen, ['fine'])
    assert.match(errors[0], /409 Conflict/)
    assert.strictEqual(errors[1], 'handler broke')
})

test('webhook checks the secret and hands the message', async () => {
    const seen = []
    const { webhook } = paperboyTelegram('abc')
    const server = http.createServer(webhook('s3cret', m => { seen.push(m.text) }))
    await new Promise(r => server.listen(0, r))
    const url = `http://127.0.0.1:${server.address().port}/`
    const post = (secret) => new Promise((resolve) => {
        const req = http.request(url, { method: 'POST', headers: secret ? { 'x-telegram-bot-api-secret-token': secret } : {} }, res => resolve(res.statusCode))
        req.end(JSON.stringify(msg(1, 42, 'hello')))
    })
    assert.strictEqual(await post(), 401)
    assert.strictEqual(await post('wrong!'), 401)
    assert.strictEqual(await post('s3cret'), 200)
    server.close()
    assert.deepStrictEqual(seen, ['hello'])
})

test('setWebhook sends the url and secret', async () => {
    const { setWebhook } = paperboyTelegram('abc')
    await setWebhook('https://example.com/telegram', 's3cret')
    assert.strictEqual(calls[0].method, 'setWebhook')
    assert.strictEqual(calls[0].body.secret_token, 's3cret')
})
