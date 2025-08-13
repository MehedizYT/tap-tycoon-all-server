import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import path from 'path';

// --- RENDER-SPECIFIC SETUP ---
// Render provides a persistent disk at /data. We'll store our DB there.
const dataDir = process.env.RENDER_DISK_PATH || '.';
const dbPath = path.join(dataDir, 'db.json');

const adapter = new JSONFile(dbPath);
const db = new Low(adapter, { users: [] }); // Default structure

const REFERRAL_BONUS = { money: 25000, gems: 0 };

// Load the database
await db.read();
db.data ||= { users: [] }; // Ensure db.data is not null
await db.write();

export const findOrCreateUser = async (userId, username = 'Player') => {
    let user = db.data.users.find(u => u.userId === userId);
    if (!user) {
        user = {
            userId,
            username,
            referrerId: null,
            referrals: [], // List of userIds they referred
            unclaimedReferrals: 0,
            claimedReferrals: 0,
            lastNotification: 0,
        };
        db.data.users.push(user);
        await db.write();
    }
    return user;
};

export const addReferral = async (referrerId, newUserId) => {
    const referrer = db.data.users.find(u => u.userId === referrerId);
    if (referrer && !referrer.referrals.includes(newUserId)) {
        referrer.referrals.push(newUserId);
        referrer.unclaimedReferrals += 1;
        await db.write();
    }
};

export const getReferralStats = (userId) => {
    const user = db.data.users.find(u => u.userId === userId);
    if (!user) {
        return { friendsInvited: 0, unclaimedCount: 0, unclaimedReward: { money: 0, gems: 0 } };
    }
    return {
        friendsInvited: user.referrals.length,
        unclaimedCount: user.unclaimedReferrals,
        unclaimedReward: {
            money: user.unclaimedReferrals * REFERRAL_BONUS.money,
            gems: user.unclaimedReferrals * REFERRAL_BONUS.gems
        }
    };
};

export const claimRewards = async (userId) => {
    const user = db.data.users.find(u => u.userId === userId);
    if (!user || user.unclaimedReferrals === 0) {
        return { claimedCount: 0, rewards: { money: 0, gems: 0 } };
    }

    const claimedCount = user.unclaimedReferrals;
    const rewards = {
        money: claimedCount * REFERRAL_BONUS.money,
        gems: claimedCount * REFERRAL_BONUS.gems
    };

    user.claimedReferrals += claimedCount;
    user.unclaimedReferrals = 0;
    await db.write();

    return { claimedCount, rewards };
};

export const getAllUsers = () => {
    return db.data.users;
};

export const updateUser = async (userId, updateData) => {
    const userIndex = db.data.users.findIndex(u => u.userId === userId);
    if (userIndex !== -1) {
        db.data.users[userIndex] = { ...db.data.users[userIndex], ...updateData };
        await db.write();
    }
};