// Load environment variables from a .env file
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');

const User = require('./models/user');

// --- CONFIGURATION ---
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI; // Your MongoDB connection string
const BOT_TOKEN = process.env.BOT_TOKEN; // Your Telegram Bot Token
const WEB_APP_URL = "https://t.me/Tap_Tycoon_Bot/Play"; // Your game's URL
const REFERRAL_BONUS_MONEY = 25000;
const REFERRAL_BONUS_GEMS = 0; // You can change this if you want

// --- INITIALIZATION ---
const app = express();
const bot = new TelegramBot(BOT_TOKEN);

// --- MIDDLEWARE ---
app.use(cors()); // Allow requests from your game client
app.use(express.json()); // Parse JSON bodies

// --- DATABASE CONNECTION ---
mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ MongoDB connected successfully.'))
    .catch(err => console.error('❌ MongoDB connection error:', err));


// --- TELEGRAM BOT LOGIC ---

// Handler for the /start command
bot.onText(/\/start(.*)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const firstName = msg.from.first_name;
    const username = msg.from.username;
    
    // The 'match' array contains the captured groups from the regex.
    // match[1] will contain any text after /start, which is our referral code.
    const referrerId = match[1] ? parseInt(match[1].trim()) : null;

    try {
        let user = await User.findOne({ telegramId: telegramId });

        if (!user) {
            // New user!
            user = new User({
                telegramId: telegramId,
                firstName: firstName,
                username: username,
            });

            // Check if there is a valid referrer
            if (referrerId && referrerId !== telegramId) {
                const referrer = await User.findOne({ telegramId: referrerId });
                if (referrer) {
                    user.referrerId = referrerId;
                    referrer.referrals.push(telegramId);
                    referrer.unclaimedReferralRewards += 1;
                    await referrer.save();
                    console.log(`User ${telegramId} was referred by ${referrerId}`);
                }
            }
            await user.save();
            console.log(`New user created: ${telegramId}`);
        } else {
             console.log(`Returning user: ${telegramId}`);
        }

        // Send a welcome message with a button to open the web app
        await bot.sendMessage(chatId, `Welcome to Tap Tycoon, ${firstName}!\n\nClick the button below to start playing and become a virtual billionaire! 💰`, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🎮 Play Now!', web_app: { url: WEB_APP_URL } }]
                ]
            }
        });
    } catch (error) {
        console.error('Error in /start handler:', error);
        bot.sendMessage(chatId, 'Sorry, something went wrong. Please try again later.');
    }
});

// Basic webhook processing
app.post(`/telegram-webhook`, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});


// --- API ENDPOINTS FOR THE GAME CLIENT ---

// Endpoint to get referral stats for a user
app.get('/my-referrals/:telegramId', async (req, res) => {
    try {
        const { telegramId } = req.params;
        const user = await User.findOne({ telegramId: parseInt(telegramId) });

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        res.json({
            friendsInvited: user.referrals.length,
            unclaimedCount: user.unclaimedReferralRewards,
            unclaimedReward: {
                money: user.unclaimedReferralRewards * REFERRAL_BONUS_MONEY,
                gems: user.unclaimedReferralRewards * REFERRAL_BONUS_GEMS
            }
        });
    } catch (error) {
        console.error('Error fetching referral stats:', error);
        res.status(500).json({ message: "Server error" });
    }
});

// Endpoint to claim referral rewards
app.post('/claim-rewards', async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) {
            return res.status(400).json({ message: "User ID is required" });
        }

        const user = await User.findOneAndUpdate(
            { telegramId: userId, unclaimedReferralRewards: { $gt: 0 } },
            { $set: { unclaimedReferralRewards: 0 } },
            { new: false } // Return the document *before* the update
        );
        
        if (!user) {
            return res.json({ success: false, claimedCount: 0, message: "No rewards to claim." });
        }

        const claimedCount = user.unclaimedReferralRewards;
        const rewards = {
            money: claimedCount * REFERRAL_BONUS_MONEY,
            gems: claimedCount * REFERRAL_BONUS_GEMS
        };

        res.json({
            success: true,
            claimedCount: claimedCount,
            rewards: rewards
        });

    } catch (error) {
        console.error('Error claiming rewards:', error);
        res.status(500).json({ message: "Server error" });
    }
});


// Simple root endpoint to check if the server is up
app.get('/', (req, res) => {
    res.send('Tap Tycoon Server is running! 🚀');
});


// --- START SERVER ---
app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
    // Set the webhook when the server starts
    const SERVER_URL = process.env.SERVER_URL;
    if(SERVER_URL){
         bot.setWebHook(`${SERVER_URL}/telegram-webhook`).then(status => {
            console.log('✅ Webhook set successfully:', status);
        }).catch(err => {
            console.error('❌ Failed to set webhook:', err);
        });
    } else {
        console.warn('⚠️ SERVER_URL not set. Webhook not configured.');
    }
});
