const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    telegramId: { type: Number, required: true, unique: true, index: true },
    username: { type: String },
    firstName: { type: String },
    // Who referred this user
    referrerId: { type: Number, default: null },
    // Who this user has referred
    referrals: [{ type: Number }],
    // How many referral rewards are waiting to be claimed
    unclaimedReferralRewards: { type: Number, default: 0 }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

module.exports = User;