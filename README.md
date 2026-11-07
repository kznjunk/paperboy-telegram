# Paperboy Telegram

No dependencies: it uses the `fetch` built into Node 18+.

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

The request gives up after 10 seconds. Change it with
`require('@kznjunk/paperboy-telegram')(token, { timeout: 5000 })`.

### Errors

Like the other paperboys, `sendTelegram` does not throw when sending fails, it returns:
- Telegram's answer when it refuses: `{ ok: false, error_code: 400, description: 'Bad Request: chat not found' }`
- the `Error` when Telegram can't be reached (network, timeout)

So check `res.ok === true`.

## Note

- The token comes from [@BotFather](https://t.me/BotFather): `/newbot`, then copy the token it gives.
- The chat id: send any message to your bot, then open
  `https://api.telegram.org/bot<token>/getUpdates` and read `result[0].message.chat.id`.
  For a group, add the bot to the group first; group ids start with `-`.
- A message is at most 4096 characters.
