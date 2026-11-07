module.exports = function paperboyTelegram(token, defaults) {
    if (!token) throw new Error('Telegram bot requires a token..')

    const { timingSafeEqual } = require('node:crypto')
    const settings = Object.assign({ timeout: 10000 }, defaults)
    const api = `https://api.telegram.org/bot${token}`

    return { sendTelegram, escape, listen, webhook, handleUpdate, setWebhook, deleteWebhook }

    async function sendTelegram(chatId, text, options) {
        if (!chatId || !text) throw new Error('Missing chat id or message..')

        const opts = Object.assign({}, options)
        let html = opts.raw ? String(text) : escape(text)

        if (opts.code) {
            html += `\n<pre>${escape(opts.code)}</pre>`
        }

        const telegramData = {
            chat_id: chatId,
            text: html,
            parse_mode: 'HTML',
            link_preview_options: { is_disabled: !opts.preview },
            disable_notification: !!opts.silent
        }

        if (opts.threadId) telegramData.message_thread_id = opts.threadId
        if (opts.replyTo) telegramData.reply_parameters = { message_id: opts.replyTo, allow_sending_without_reply: true }

        try {
            return await call('sendMessage', telegramData, settings.timeout)
        } catch (e) {
            return e
        }
    }

    function listen(handler, options) {
        if (typeof handler !== 'function') throw new Error('listen requires a handler..')

        const opts = Object.assign({ wait: 30, retry: 5000 }, options)
        const controller = new AbortController()
        let offset = 0

        const done = (async () => {
            while (!controller.signal.aborted) {
                try {
                    const res = await call('getUpdates', {
                        offset,
                        timeout: opts.wait,
                        allowed_updates: ['message']
                    }, (opts.wait * 1000) + 10000, controller.signal)

                    if (!res.ok) throw new Error(`Telegram refused getUpdates: ${res.error_code} ${res.description}`)

                    for (const update of res.result) {
                        offset = update.update_id + 1
                        await dispatch(update, handler, opts)
                    }
                } catch (e) {
                    if (controller.signal.aborted) break
                    report(opts, e)
                    await pause(opts.retry, controller.signal)
                }
            }
        })()

        return function stop() {
            controller.abort()
            return done
        }
    }

    function webhook(secret, handler, options) {
        if (!secret) throw new Error('webhook requires a secret..')
        if (typeof handler !== 'function') throw new Error('webhook requires a handler..')

        const opts = Object.assign({}, options)

        return async function telegramWebhook(req, res) {
            if (!isSecretValid(req.headers['x-telegram-bot-api-secret-token'], secret)) {
                res.statusCode = 401
                return res.end()
            }

            try {
                const update = req.body && typeof req.body === 'object' ? req.body : JSON.parse(await readBody(req))
                await dispatch(update, handler, opts)
            } catch (e) {
                report(opts, e)
            }

            res.statusCode = 200
            res.end()
        }
    }

    async function handleUpdate(update, handler, options) {
        return dispatch(update, handler, Object.assign({}, options))
    }

    async function setWebhook(url, secret) {
        if (!url || !secret) throw new Error('Missing webhook url or secret..')

        try {
            return await call('setWebhook', { url, secret_token: secret, allowed_updates: ['message'] }, settings.timeout)
        } catch (e) {
            return e
        }
    }

    async function deleteWebhook() {
        try {
            return await call('deleteWebhook', {}, settings.timeout)
        } catch (e) {
            return e
        }
    }

    async function dispatch(update, handler, opts) {
        const message = update && update.message
        if (!message) return false
        if (opts.chats && !opts.chats.map(String).includes(String(message.chat.id))) return false

        try {
            await handler(message, update)
        } catch (e) {
            report(opts, e)
        }
        return true
    }

    async function call(method, body, timeout, signal) {
        const timer = AbortSignal.timeout(timeout)
        const res = await fetch(`${api}/${method}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
            signal: signal ? AbortSignal.any([signal, timer]) : timer
        })
        return res.json()
    }

    function report(opts, e) {
        if (opts.onError) opts.onError(e)
        else console.warn(`[paperboy-telegram] ${e.message}`)
    }

    function isSecretValid(received, secret) {
        const a = Buffer.from(String(received || ''))
        const b = Buffer.from(String(secret))
        return a.length === b.length && timingSafeEqual(a, b)
    }

    function readBody(req) {
        return new Promise((resolve, reject) => {
            let data = ''
            req.on('data', chunk => { data += chunk })
            req.on('end', () => resolve(data))
            req.on('error', reject)
        })
    }

    function pause(ms, signal) {
        return new Promise(resolve => {
            const t = setTimeout(resolve, ms)
            signal.addEventListener('abort', () => { clearTimeout(t); resolve() }, { once: true })
        })
    }

    function escape(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
    }
}
