# Paperboy Telegram

No dependencies: it uses the `fetch` built into Node 20.3+.

## How?

### Simple message

```js
const token = '123456789:AAxxxxxxxx'
const { sendTelegram } = require('@kznjunk/paperboy-telegram')(token)

const chatId = '123456789'
const message = 'hello there!'

const res = await sendTelegram(chatId, message)
// res: { ok: true, result: { message_id: 42, ... } }
```

The message is escaped for you, so text like `body did not contain "<title"`
arrives as written instead of making Telegram reject it.

### Code

```js
const { sendTelegram } = require('@kznjunk/paperboy-telegram')(token)

const res = await sendTelegram(chatId, 'afterwork beer for someone?', {
    code: 'const x = 42'
})
```

### Formatting (bold, links...)

Pass `raw: true` to send your own [Telegram HTML](https://core.telegram.org/bots/api#html-style).
Use `escape` on anything you did not write yourself:

```js
const { sendTelegram, escape } = require('@kznjunk/paperboy-telegram')(token)

const appName = 'gantz <prod>'
const res = await sendTelegram(chatId, `🔴 <b>${escape(appName)} is down</b>`, { raw: true })
```

### Options

| option     | default | what it does                                   |
|------------|---------|------------------------------------------------|
| `code`     |         | adds a code block under the message            |
| `raw`      | `false` | send `text` as HTML, not escaped               |
| `silent`   | `false` | deliver without a notification sound           |
| `preview`  | `false` | show the preview of the first link             |
| `threadId` |         | topic id, for a group with topics              |
| `replyTo`  |         | message id to answer, shown as a Telegram reply |

The request gives up after 10 seconds. Change it with
`require('@kznjunk/paperboy-telegram')(token, { timeout: 5000 })`.

### Errors

Like the other paperboys, `sendTelegram` does not throw when sending fails, it returns:
- Telegram's answer when it refuses: `{ ok: false, error_code: 400, description: 'Bad Request: chat not found' }`
- the `Error` when Telegram can't be reached (network, timeout)

So check `res.ok === true`.

## Listening to replies

When someone writes to the bot, Telegram keeps the message for 24 hours
until you collect it. Two ways to collect, pick one per bot.

The handler gets the [message](https://core.telegram.org/bots/api#message) and
the whole update. When the person used "Reply" on one of your messages,
`message.reply_to_message.message_id` is the `result.message_id` that
`sendTelegram` returned, so keep it to know what they answered.

Always pass `chats` with your own chat id: anyone who finds the bot can write to it.

### Long polling, from any server (even localhost)

```js
const { sendTelegram, listen } = require('@kznjunk/paperboy-telegram')(token)

const stop = listen(async (message) => {
    if (message.text === 'ack' && message.reply_to_message) {
        await sendTelegram(message.chat.id, 'acknowledged 👍', { replyTo: message.message_id })
    }
}, { chats: [chatId] })

// later, on shutdown
await stop()
```

Only one process may poll a bot: two of them (or a webhook still set) make
Telegram answer `409 Conflict`. `listen` keeps going after a failure and retries
every 5 seconds.

| option    | default | what it does                                       |
|-----------|---------|----------------------------------------------------|
| `chats`   |         | only these chat ids reach the handler              |
| `wait`    | `30`    | seconds Telegram holds each poll open              |
| `retry`   | `5000`  | ms before polling again after an error             |
| `onError` | log     | gets the errors (network, refused, handler throws) |

### Webhook, when the server has a public HTTPS url

```js
const { webhook, setWebhook } = require('@kznjunk/paperboy-telegram')(token)

// once (setWebhook turns polling off for this bot, deleteWebhook turns it back on)
await setWebhook('https://example.com/telegram', secret)

// Express, or a plain node http server
app.post('/telegram', express.json(), webhook(secret, async (message) => {
    // same message as with listen
}, { chats: [chatId] }))
```

Requests without the right secret get a `401`. The secret is 1 to 256 characters
among `A-Z a-z 0-9 _ -`.

On a framework that is not Express-like (Strapi/Koa), check the secret yourself
and pass the parsed body to `handleUpdate`:

```js
const { handleUpdate } = require('@kznjunk/paperboy-telegram')(token)

if (ctx.get('x-telegram-bot-api-secret-token') !== secret) return ctx.throw(401)
await handleUpdate(ctx.request.body, async (message) => { /* ... */ }, { chats: [chatId] })
ctx.status = 200
```

## Note

- The token comes from [@BotFather](https://t.me/BotFather): `/newbot`, then copy the token it gives.
- The chat id: send any message to your bot, then open
  `https://api.telegram.org/bot<token>/getUpdates` and read `result[0].message.chat.id`.
  For a group, add the bot to the group first; group ids start with `-`.
- A message is at most 4096 characters.
