# Налаштування Job Intelligence Radar

**Мова / Language:** [Українська](configuration.uk.md) | [English](configuration.md)
[Головна](../README.uk.md) · [Встановлення](one-click.uk.md) · [Використання](usage.uk.md)

Радар має **два незалежні профілі**: `jobs` — пошук вакансій, `leads` — пошук потенційних клієнтів. Не змішуйте досвід для найму зі своїми комерційними послугами. Установлений через Cloudflare шаблон містить **вигадані** налаштування.

## 1. Де редагувати конфігурацію

**Для Cloudflare через кнопку Deploy:** створіть **повний** JSON за зразком [`config/radar.config.example.json`](../config/radar.config.example.json) та додайте його в Cloudflare **Workers Builds** як приватну **build-time** змінну `RADAR_CONFIG_JSON`. Після зміни запустіть **нову збірку**. Генератор читає цю змінну, але не виводить її вміст у лог успішної перевірки.

**Для локальної розробки:** запустіть `npm ci`, потім `npm run setup`. Це створить ігнорований Git файл `config/radar.config.json`. Відредагуйте його, виконайте `npm run config:generate` та `npm run ci`. Якщо потрібно розгорнути власну копію через CLI — `npm run deploy`, але спочатку перевірте акаунт Cloudflare і назви ресурсів.

**Увага:** `RADAR_CONFIG_JSON` — це конфігурація **часу збірки**, а `INBOX_PASSWORD`, `ADMIN_TOKEN`, `TG_BOT_TOKEN` — **секрети Worker під час виконання**. Не замінюйте одне іншим. Вміст конфігурації може містити персональні критерії: не додавайте його в публічні коміти.

## 2. Пошук роботи — `jobs`

Основні поля:

| Шлях у JSON | Що означає |
| --- | --- |
| `jobs.enabled` | `true` — збирати вакансії |
| `jobs.profile.role` | Ваша фактична професійна роль |
| `jobs.profile.summary` | Короткий правдивий опис досвіду |
| `jobs.profile.yearsExperience` | Кількість років досвіду |
| `jobs.profile.skills` | Технології, якими реально володієте |
| `jobs.profile.provenExperience` | Конкретні виконані задачі та результати |
| `jobs.profile.country` | Країна, з якої ви можете працювати |
| `jobs.profile.englishLevel` | Знання англійської |
| `jobs.criteria.preferredRoles` | Цільові посади |
| `jobs.criteria.allowedRegions` | Доступні вам регіони |
| `jobs.criteria.remoteOnly` | Лише дистанційна робота |
| `jobs.criteria.targetMonthlyUsd` | Бажаний дохід на місяць, USD |
| `jobs.criteria.minMonthlyUsd` | Мінімально прийнятний дохід, USD |
| `jobs.criteria.preferredEngagements` | Формат: `fulltime`, `contract` тощо |
| `jobs.criteria.includeKeywords` | Бажані ключові слова |
| `jobs.criteria.excludeKeywords` | Небажані ключові слова |
| `jobs.criteria.maxAgeDays` | Максимальний вік оголошення |
| `jobs.criteria.minQualifiedScore` | Мінімальна оцінка відповідності |
| `jobs.criteria.manualReviewScore` | Поріг ручного перегляду |

**Приклад лише окремих полів** (не повний JSON; інші секції зразка зберігайте):

```json
{
  "jobs": {
    "enabled": true,
    "profile": {
      "role": "Example Backend Developer",
      "country": "Poland",
      "skills": ["Python", "PostgreSQL", "Docker"],
      "provenExperience": ["Built and maintained a fictional API"]
    },
    "criteria": {
      "remoteOnly": true,
      "allowedRegions": ["Europe", "Worldwide"],
      "preferredRoles": ["Backend Developer"],
      "targetMonthlyUsd": 3500,
      "minMonthlyUsd": 2000
    }
  }
}
```

Наведені значення **вигадані**, а фрагмент неповний: для реальної збірки беріть **увесь файл прикладу** з `schemaVersion: 2` і замінюйте потрібні значення. Не приписуйте собі навичок або проєктів, яких не було. AI-оцінка — це не прогноз отримання оферу.

## 3. Вибір сайтів вакансій

Список у `jobs.sources.items` і режим `jobs.sources.mode` = `"replace"` визначають основні джерела. Типовий шаблон має **Remotive, Himalayas і Jobicy**.

Підтримуються `rss`, `ashby`, `greenhouse`, `lever`, `himalayas`, `jobicy`, `remoteok`, `remotive`, `hn`, `remotebackend`, `freelancehunt` та інші реалізовані адаптери. Вводьте лише реальні загальнодоступні джерела з дозволеним доступом.

Наприклад, в масив `jobs.sources.items` можна додати елемент:

```json
{"name":"Example careers","kind":"ashby","slug":"example-company","hours":4}
```

Або публічний RSS:

```json
{"name":"Example RSS","kind":"rss","url":"https://example.com/jobs.xml","hours":4}
```

`example.com` — **демонстраційний домен**, він не поверне реальних вакансій. Замініть адресу на справжній RSS. Якщо ви хочете **додати** джерело без зміни JSON і повторного деплою, це можна зробити через форму в `/inbox` — [див. інструкцію](usage.uk.md#додавання-джерел-через-inbox). Додані там джерела зберігаються в D1, а не в `config/radar.config.example.json`.

## 4. Клієнтські запити — `leads`

Типово `leads.enabled` = `false`. Увімкнення має сенс, коли ви заповнили **окремий** профіль:

- `leads.profile.services` — послуги, які реально надаєте;
- `leads.profile.provenDeliveries` — підтверджені приклади виконаного;
- `leads.profile.idealClientTypes` — бажані типи замовників;
- `leads.profile.excludedServices` — за що не беретеся;
- `leads.criteria.minTechnicalFit`, `minCommercialScore`, `requireVerifiedBuyerEvidence` — вимоги до реальності та комерційності ліда;
- `leads.sources.community.feeds` — доступні RSS/Atom-спільноти;
- `leads.sources.reddit` — окремі тематичні запити й спільноти, якщо налаштовано браузерну інтеграцію.

Підбір **потенційних** клієнтів не означає перевірений бюджет або готовність купити. Програма не повинна автоматично писати людям у приватні повідомлення.

## 5. AI, мова та часовий пояс

- `ai.model` — модель, яка викликається через Cloudflare AI binding. За замовчуванням **`openai/gpt-6-luna` (GPT-6 Luna)**. Для зовнішньої моделі можуть застосовуватися окремі умови тарифікації; перевірте доступність у своєму Cloudflare-акаунті.
- `ai.dailyEvaluationLimit` і `ai.dailyProspectLimit` — денні обмеження на AI-оцінювання.
- `notifications.language` — мова повідомлень, якщо її підтримує відповідний сценарій.
- `notifications.timezone` — часовий пояс для частини часових інтервалів і повідомлень; приклад: `Europe/Warsaw`.
- `app.publicBaseUrl` — URL **вашого** розгорнутого Worker, особливо важливий для інтеграцій із зовнішніми посиланнями.

Вкладки веб-інтерфейсу Inbox уже мають українські назви. `notifications.language` не слід сприймати як повний перемикач усіх написів інтерфейсу.

## 6. Telegram (необов'язково)

За замовчуванням `notifications.telegramEnabled` = `false`. Для сповіщень потрібно **свідомо**:

1. Створити власного Telegram-бота та дізнатися ID власного чату.
2. Додати у Cloudflare Worker Secrets `TG_BOT_TOKEN` та `TG_CHAT_ID`.
3. Налаштувати `notifications.telegramEnabled` = `true` у приватному конфігу, за потреби `notifications.telegram.expectedBotUsername`, `expectedChatTitle` та `allowedChatTypes`.
4. Після зміни профілю перебудувати Worker; перевірити сповіщення через захищений `POST /admin/test-telegram`.

Це **не** автоматична частина одно-клікового встановлення. Для команд бота та webhook можуть бути потрібні окремі кроки. Не вказуйте токени в публічному GitHub, повідомленнях або прикладах конфігурації.

## 7. Приватний браузер і OneAIHUB

Звичайні відкриті API й RSS **не потребують OneAIHUB**. Для Reddit/DOU через браузер необхідні відповідні налаштування в `integrations.oneaihub`, окреме підключення Cloudflare VPC, доступ і секрети. Просто поставити `enabled: true` недостатньо. Файлова система та команди локального комп’ютера вимкнені, доки немає явного окремого дозволу.

## 8. Перевірка та безпека

```bash
npm run config:validate-public
npm run config:generate
npm run ci
npm run build:check
```

Не завантажуйте в Git `config/radar.config.json`, `src/config/radar.generated.js`, `.dev.vars`, секрети та приватні архіви. Зміна `RADAR_CONFIG_JSON` в Cloudflare потребує **нової збірки**, а не лише збереження runtime-змінної. Перевіряйте ліміти й витрати на Workers AI, D1 і Workflows.

[Повернутися до українського README](../README.uk.md)
