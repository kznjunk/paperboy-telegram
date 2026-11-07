module.exports = function paperboyTelegram(token, defaults) {
    if (!token) throw new Error('Telegram bot requires a token..')

    const settings = Object.assign({ timeout: 10000 }, defaults)
    const api = `https://api.telegram.org/bot${token}`

    return { sendTelegram, escape }

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

        try {
            const res = await fetch(`${api}/sendMessage`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(telegramData),
                signal: AbortSignal.timeout(settings.timeout)
            })
            return await res.json()
        } catch (e) {
            return e
        }
    }

    function escape(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
    }
}
