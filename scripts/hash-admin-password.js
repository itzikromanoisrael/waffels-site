const crypto = require("crypto");

const password = process.argv.slice(2).join(" ");
if (!password) {
  console.error("Usage: npm run security:hash-password -- \"your strong password\"");
  process.exit(1);
}

const iterations = 210000;
const salt = crypto.randomBytes(16).toString("hex");
const hash = crypto.pbkdf2Sync(password, salt, iterations, 32, "sha256").toString("hex");
console.log(`ADMIN_PASSWORD_HASH=pbkdf2:${iterations}:${salt}:${hash}`);
