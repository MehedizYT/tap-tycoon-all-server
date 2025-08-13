import express from 'express';
import cors from 'cors';
import TelegramBot from 'node-telegram-bot-api';
import * as db from './db.js';

// --- CONFIGURATION ---
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN; // Get from Render Environment Variables
const WEB_APP_URL = process.env.WEB_APP_URL; // Get from Render Environment Variables

if (!BOT_TOKEN || !WEB_APP_URL) {
    console.error("CRITICAL ERROR: BOT_TOKEN and WEB_APP_URL environment variables are not set!");
    process.exit(1);
}

// --- INITIALIZATION ---
const app = express();
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

app.use(cors());
app.use(express.json());

// --- TELEGRAM BOT LOGIC ---
bot.onText(/\/start(?: (.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.first_name;
    const referrerId = match ? parseInt(match[1], 10) : null;
    
    const user = await db.findOrCreateUser(userId, username);

    // Link referral if it's the user's first time and referrer is valid
    if (referrerId && !user.referrerId && referrerId !== userId) {
        user.referrerId = referrerId;
        await db.addReferral(referrerId, userId);
        await db.updateUser(userId, { referrerId: referrerId });
    }

    bot.sendMessage(chatId, `Welcome to Tap Tycoon, ${username}! Click the button below to start playing.`, {
        reply_markup: {
            inline_keyboard: [
                [{ text: "🎮 Play Now!", web_app: { url: WEB_APP_URL } }]
            ]
        }
    });
});

bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    if (msg.text && !msg.text.startsWith('/start')) {
         bot.sendMessage(chatId, "Welcome! Use the /start command or the menu button to launch the game.");
    }
});

// --- API ENDPOINTS ---
app.get('/my-referrals/:userId', (req, res) => {
    const userId = parseInt(req.params.userId, 10);
    const stats = db.getReferralStats(userId);
    res.json(stats);
});

app.post('/claim-rewards', async (req, res) => {
    const { userId } = req.body;
    if (!userId) {
        return res.status(400).json({ success: false, message: 'User ID is required.' });
    }
    const result = await db.claimRewards(parseInt(userId, 10));
    res.json({ success: true, ...result });
});

// --- DAILY NOTIFICATION SCHEDULER ---
function scheduleDailyNotifications() {
    console.log("Daily notification scheduler started.");
    setInterval(() => {
        const now = Date.now();
        const users = db.getAllUsers();
        console.log(`Checking ${users.length} users for notifications.`);
        
        users.forEach(user => {
            // Send notification if it has been ~24 hours since the last one
            if (now - (user.lastNotification || 0) > 23.5 * 60 * 60 * 1000) {
                 bot.sendMessage(user.userId, "👋 Hey Tycoon! Your businesses are waiting. Come back and collect your earnings! 💰")
                    .then(() => {
                        db.updateUser(user.userId, { lastNotification: now });
                        console.log(`Sent notification to ${user.userId}`);
                    })
                    .catch(error => {
                        console.error(`Failed to send message to ${user.userId}:`, error.code);
                    });
            }
        });
    }, 60 * 60 * 1000); // Check every hour
}

// --- SERVER START ---
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    scheduleDailyNotifications();
});