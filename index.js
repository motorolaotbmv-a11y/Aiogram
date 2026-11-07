const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;

const folder = path.join(__dirname, "data");
const dbFile = path.join(folder, "accounts.json");

if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
if (!fs.existsSync(dbFile)) {
  fs.writeFileSync(dbFile, JSON.stringify({ accounts: [], sessions: [] }));
}

function loadDB() {
  return JSON.parse(fs.readFileSync(dbFile, "utf8"));
}

function saveDB(db) {
  const temp = dbFile + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(db, null, 2));
  fs.renameSync(temp, dbFile);
}

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function makeCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function makeNumber() {
  return "+7" + String(crypto.randomInt(10000000, 100000000));
}

let bot = null;

if (BOT_TOKEN) {
  bot = new TelegramBot(BOT_TOKEN, { polling: true });

  bot.onText(/\/start/, (msg) => {
    bot.sendMessage(
      msg.chat.id,
      "Добро пожаловать в АИОГРАМ!\n\nНапиши /new для создания аккаунта"
    );
  });

  bot.onText(/\/new/, (msg) => {
    const db = loadDB();
    const code = makeCode();
    const number = makeNumber();

    const account = {
      id: crypto.randomUUID(),
      telegramId: String(msg.from.id),
      username: msg.from.username || "user",
      number,
      codeHash: hash(code),
      codeExpires: Date.now() + 10 * 60 * 1000,
      attempts: 0,
      createdAt: Date.now()
    };

    db.accounts.push(account);
    saveDB(db);

    bot.sendMessage(
      msg.chat.id,
      "Аккаунт АИОГРАМ создан!\n\nНомер: " + number +
      "\nКод входа: " + code +
      "\n\nКод действует 10 минут"
    );
  });

  bot.on("polling_error", (err) => {
    console.log("Telegram error:", err.message);
  });
}

app.get("/", (req, res) => {
  res.send("АИОГРАМ работает");
});

app.get("/health", (req, res) => {
  res.json({ status: "online", name: "АИОГРАМ" });
});

app.post("/auth/verify", (req, res) => {
  const { number, code } = req.body || {};

  if (!number || !code) {
    return res.status(400).json({ error: "Укажи номер и код" });
  }

  const db = loadDB();
  const account = db.accounts.find(a => a.number === number);

  if (!account) {
    return res.status(401).json({ error: "Аккаунт не найден" });
  }

  if (account.codeExpires < Date.now()) {
    return res.status(401).json({ error: "Код истёк" });
  }

  if (account.attempts >= 5) {
    return res.status(429).json({ error: "Слишком много попыток" });
  }

  if (account.codeHash !== hash(String(code))) {
    account.attempts++;
    saveDB(db);
    return res.status(401).json({ error: "Неверный код" });
  }

  account.codeHash = null;
  account.codeExpires = 0;

  const token = crypto.randomBytes(32).toString("hex");

  db.sessions.push({
    accountId: account.id,
    tokenHash: hash(token),
    expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000
  });

  saveDB(db);

  res.json({
    success: true,
    token,
    number: account.number,
    username: account.username
  });
});

app.get("/auth/me", (req, res) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!token) {
    return res.status(401).json({ error: "Нет токена" });
  }

  const db = loadDB();
  const session = db.sessions.find(
    s => s.tokenHash === hash(token) && s.expiresAt > Date.now()
  );

  if (!session) {
    return res.status(401).json({ error: "Сессия недействительна" });
  }

  const account = db.accounts.find(a => a.id === session.accountId);

  if (!account) {
    return res.status(404).json({ error: "Аккаунт не найден" });
  }

  res.json({
    success: true,
    number: account.number,
    username: account.username
  });
});

app.listen(PORT, () => {
  console.log("АИОГРАМ запущен на порту " + PORT);
});
