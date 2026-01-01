let isStarting = false;
let sock = null;
// index.js
const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const qrcode = require("qrcode-terminal");
const pino = require("pino");
const fs = require("fs");
const path = require("path");
const db = require('./database');
const startTime = new Date();

const AUTH_FOLDER = path.join(__dirname, "auth_info");
const PREFIX = "!";
const BOT_NAME = "MACHINE BOT";
const BOT_TAG = `*${BOT_NAME}* 👨🏻‍💻`;

// --- Loader de commandes ---
const commands = new Map();
const commandFolder = path.join(__dirname, 'commands');
if (!fs.existsSync(commandFolder)) fs.mkdirSync(commandFolder);

const commandFiles = fs.readdirSync(commandFolder).filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
    try {
        const command = require(path.join(commandFolder, file));
        commands.set(command.name, command);
        console.log(`[CommandLoader] Commande chargée : ${command.name}`);
    } catch (error) {
        console.error(`[CommandLoader] Erreur de chargement de la commande ${file}:`, error);
    }
}

// --- Fonctions utilitaires ---
function replyWithTag(sock, jid, quoted, text) {
    return sock.sendMessage(jid, { text: `${BOT_TAG}\n\n${text}` }, { quoted });
}

function getMessageText(msg) {
    const m = msg.message;
    if (!m) return "";
    return m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption || m.videoMessage?.caption || "";
}

// --- Chargement du MP3 en mémoire ---
const mp3Path = path.join(__dirname, 'fichier.mp3');
let mp3Buffer = null;
try {
    mp3Buffer = fs.readFileSync(mp3Path);
    console.log('[MP3] Fichier MP3 chargé en mémoire.');
} catch (err) {
    console.error('[MP3] Impossible de lire le fichier mp3:', err);
}

// --- Numéro à surveiller ---
const TARGET_NUMBER = "250865332039895";

// --- Démarrage du bot ---
async function startBot() {
    if (isStarting) {
        console.log("⏳ Bot déjà en cours de démarrage, annulation.");
        return;
    }

    isStarting = true;
    console.log("🚀 Démarrage du bot WhatsApp...");

    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);

    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: "silent" }),
        printQRInTerminal: false
    });

    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log("------------------------------------------------");
            qrcode.generate(qr, { small: true });
            console.log("📱 Scanne le QR UNE SEULE FOIS");
            console.log("------------------------------------------------");
        }

        if (connection === "open") {
            console.log("✅ Bot WhatsApp connecté STABLEMENT");
            isStarting = false;
        }

        if (connection === "close") {
            const code = lastDisconnect?.error?.output?.statusCode;
            console.log("❌ Connexion fermée, code:", code);

            if (code === 401) {
                console.log("🧨 Session invalide → supprime auth_info et relance");
                isStarting = false;
                return;
            }

            isStarting = false;
            console.log("🔄 Reconnexion dans 5 secondes...");
            setTimeout(startBot, 5000);
        }
    });

    sock.ev.on("creds.update", saveCreds);

    // ⚠️ LE RESTE DE TON CODE messages.upsert RESTE IDENTIQUE
}

// --- Serveur web ---
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => {
    res.send({ status: "online", botName: BOT_NAME, uptime: (new Date() - startTime) / 1000 });
});
app.listen(PORT, () => {
    console.log(`[WebServer] Serveur web démarré et à l'écoute sur le port ${PORT}`);
    startBot();
});
