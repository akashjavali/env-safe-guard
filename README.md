# 🔐 env-safe-guard

> Prevent leaking environment variables in logs, code, and AI tools.

---

## 🚀 Why env-safe-guard?

Environment variables are everywhere — and so are leaks.

* ❌ Accidentally logging API keys
* ❌ Exposing secrets while debugging
* ❌ Sharing sensitive data with AI tools (Claude, Copilot, etc.)
* ❌ Missing or invalid env variables crashing apps

**env-safe-guard** solves all of this in one simple package.

---

## ✨ Features

* ✅ **Environment validation** (fail fast)
* ✅ **Type-safe env access (TypeScript support)**
* 🔐 **Automatic secret redaction in logs & errors**
* ⚡ **Zero-config setup**
* 🧠 Designed for the **AI development era**

---

## 📦 Installation

```bash
npm install env-safe-guard
```

---

## ⚡ Quick Start

```ts
import { createEnv } from "env-safe-guard"

export const env = createEnv({
  DATABASE_URL: "string",
  API_KEY: "string",
  PORT: "number?"
}, {
  redact: true
})
```

---

## 🧪 Example

```ts
console.log(env.API_KEY)
```

### Output:

```bash
***REDACTED***
```

---

## ❗ Missing Env Example

```bash
❌ Missing required env variable: DATABASE_URL
👉 Add it to your .env file
```

---

## 🧠 Supported Types

| Type    | Description      |
| ------- | ---------------- |
| string  | Default type     |
| number  | Parsed as Number |
| boolean | true / false     |

### Optional variables

Use `?`:

```ts
PORT: "number?"
```

---

## 🔐 How Redaction Works

* Detects when env variables are:

  * Logged (`console.log`)
  * Stringified (`JSON.stringify`)
  * Printed in errors

* Automatically replaces values with:

```bash
***REDACTED***
```

👉 Your secrets stay safe without changing your code.

---

## 🖥 CLI (Coming Soon)

```bash
npx env-safe-guard check
npx env-safe-guard init
```

---

## 🤖 Built for AI Tools

Modern devs use:

* Claude
* ChatGPT
* Copilot

These tools can accidentally expose secrets.

**env-safe-guard ensures:**

* Secrets are never leaked unintentionally
* Safe debugging & logging
* Safer AI-assisted development

---

## 🧱 Philosophy

> Simple. Safe. Developer-first.

* No complex configs
* No boilerplate
* Just install and protect

---

## 🗺 Roadmap

* 🔍 Leak detection scanner
* 🤖 AI-safe execution mode
* 🔐 Git hooks (prevent committing secrets)
* ⚡ CI/CD integration
* 🌍 SaaS dashboard (team env management)

---

## 💡 Why not just use dotenv or envalid?

| Feature            | dotenv | envalid | env-safe-guard |
| ------------------ | ------ | ------- | -------------- |
| Load env           | ✅      | ❌       | ✅              |
| Validate env       | ❌      | ✅       | ✅              |
| Type safety        | ❌      | ✅       | ✅              |
| Secret redaction   | ❌      | ❌       | 🔥 ✅           |
| AI-safe protection | ❌      | ❌       | 🔥 ✅           |

---

## ❤️ Contributing

Contributions are welcome!

* Open issues
* Suggest features
* Submit PRs

---

## 📄 License

MIT

---

## ⭐ Support

If this helps you, consider giving it a star ⭐
It helps the project grow!

---

## 🚀 Vision

**env-safe-guard** aims to become:

> The standard way to manage environment variables in the AI era.
