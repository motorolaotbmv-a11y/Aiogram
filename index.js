const express = require("express");
const cors = require("cors");
const initSqlJs = require("sql.js");
const fs = require("fs");

async function start() {
  const SQL = await initSqlJs();
  const db = fs.existsSync("derngram.db")
    ? new SQL.Database(fs.readFileSync("derngram.db"))
    : new SQL.Database();

  db.run("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT, stars INTEGER DEFAULT 0)");

  const app = express();
  app.use(cors());
  app.use(express.json());

  function save() {
    fs.writeFileSync("derngram.db", Buffer.from(db.export()));
  }

  app.get("/", (req, res) => res.send("DERNGRAM SERVER ONLINE"));
  app.get("/health", (req, res) => res.json({ online: true }));

  app.post("/register", (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Заполни поля" });
    try {
      db.run("INSERT INTO users (username, password) VALUES (?, ?)", [username, password]);
      save();
      res.json({ success: true, message: "Аккаунт создан" });
    } catch {
      res.status(409).json({ error: "Имя уже занято" });
    }
  });

  app.get("/users", (req, res) => {
    const result = db.exec("SELECT id, username, stars FROM users");
    res.json(result.length ? result[0].values.map(row => ({
      id: row[0], username: row[1], stars: row[2]
    })) : []);
  });

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, "0.0.0.0", () => console.log("DERNGRAM ONLINE:", PORT));
}

start().catch(console.error);
