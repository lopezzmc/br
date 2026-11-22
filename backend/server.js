
// ============================================
// BRAIN RUSH BACKEND SERVER (Firebase Firestore)
// ============================================

const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();
const PORT = process.env.PORT || 5000;

// ============================================
// FIREBASE INITIALIZATION
// ============================================
let credential;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  credential = admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT));
} else {
  credential = admin.credential.cert(require('./serviceAccountKey.json'));
}

if (!admin.apps.length) {
  admin.initializeApp({ credential });
}

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

// ============================================
// MIDDLEWARE
// ============================================
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());

// ============================================
// DATABASE CONNECTION CHECK
// ============================================
async function checkDatabase() {
  try {
    await db.collection('users').limit(1).get();
    console.log('✅ Firestore connected successfully');
  } catch (err) {
    console.error('❌ Firestore connection error:', err.message);
  }
}
checkDatabase();

// ============================================
// HELPER FUNCTIONS
// ============================================
function userDocId(username) {
  return username.toLowerCase();
}

async function findUser(username) {
  const doc = await db.collection('users').doc(userDocId(username)).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

function serializeUser(user) {
  return {
    username: user.username,
    coins: user.coins || 0,
    diamonds: user.diamonds || 0,
    xp: user.xp || 0,
    level: user.level || 1,
    streakDays: user.streakDays || 0,
    equippedAvatar: user.equippedAvatar || 'default',
    ownedAvatars: user.ownedAvatars || ['default'],
    ownedThemes: user.ownedThemes || [],
    activeTheme: user.activeTheme || 'default',
    inventory: user.inventory || [],
    gamesPlayed: user.gamesPlayed || 0
  };
}

// ============================================
// API ROUTES
// ============================================

// HEALTH CHECK
app.get('/api/health', async (req, res) => {
  try {
    const snap = await db.collection('users').count().get();
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      message: '🚀 Brain Rush Server is running!',
      users: snap.data().count
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ROOT
app.get('/', (req, res) => {
  res.json({
    name: 'Brain Rush API',
    version: '3.0.0',
    status: 'online',
    database: 'Firestore (persistent, free tier)',
    endpoints: [
      'GET  /api/health',
      'POST /api/auth/register',
      'GET  /api/auth/verify',
      'POST /api/user/:username/update',
      'POST /api/user/update-resources',
      'GET  /api/game/leaderboard',
      'POST /api/game/save-result',
      'POST /api/ai/chat'
    ]
  });
});

// --------------------------------------------
// AUTHENTICATION
// --------------------------------------------

app.post('/api/auth/register', async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || username.length < 2) {
    return res.status(400).json({ success: false, error: 'Username must be at least 2 characters' });
  }

  try {
    const existing = await findUser(username);
    if (existing) {
      return res.status(400).json({ success: false, error: 'Username already taken' });
    }

    const newUser = {
      username: username,
      email: email || `${username}@brainrush.game`,
      password: password || 'default123',
      coins: 100,
      diamonds: 5,
      xp: 0,
      level: 1,
      streakDays: 0,
      equippedAvatar: 'default',
      ownedAvatars: ['default'],
      ownedThemes: [],
      activeTheme: 'default',
      inventory: [],
      gamesPlayed: 0,
      joinedAt: FieldValue.serverTimestamp()
    };

    await db.collection('users').doc(userDocId(username)).set(newUser);

    const token = `mock-token-${username}`;
    console.log(`✅ New user registered: ${username}`);
    const countSnap = await db.collection('users').count().get();
    console.log(`📊 Total users: ${countSnap.data().count}`);

    res.status(201).json({
      success: true,
      token: token,
      user: serializeUser(newUser)
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.get('/api/auth/verify', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ valid: false, error: 'No token provided' });
  }

  const token = authHeader.replace('Bearer ', '');
  const username = token.replace('mock-token-', '');

  try {
    const user = await findUser(username);
    if (!user) {
      return res.status(401).json({ valid: false, error: 'Invalid token' });
    }
    res.json({ valid: true, user: serializeUser(user) });
  } catch (err) {
    res.status(500).json({ valid: false, error: 'Server error' });
  }
});

// --------------------------------------------
// USER DATA
// --------------------------------------------

app.post('/api/user/:username/update', async (req, res) => {
  const { username } = req.params;
  const updateData = req.body;

  try {
    const user = await findUser(username);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const allowed = [
      'coins', 'diamonds', 'xp', 'level', 'streakDays',
      'equippedAvatar', 'ownedAvatars', 'ownedThemes',
      'activeTheme', 'inventory'
    ];

    const updates = {};
    for (const key of allowed) {
      if (updateData[key] !== undefined) updates[key] = updateData[key];
    }

    if (Object.keys(updates).length === 0) {
      return res.json({ success: true, message: 'No fields to update' });
    }

    await db.collection('users').doc(userDocId(username)).update(updates);
    console.log(`✅ User updated: ${username}`);

    res.json({ success: true, user: serializeUser({ ...user, ...updates }) });
  } catch (err) {
    console.error('Update error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.post('/api/user/update-resources', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

  const token = authHeader.replace('Bearer ', '');
  const username = token.replace('mock-token-', '');
  const { coins = 0, diamonds = 0, xp = 0 } = req.body;

  try {
    const user = await findUser(username);
    if (!user) return res.status(404).json({ error: 'User not found' });

    let newCoins = (user.coins || 0) + coins;
    let newDiamonds = (user.diamonds || 0) + diamonds;
    let newXp = (user.xp || 0) + xp;
    let newLevel = user.level || 1;

    while (newXp >= Math.floor(100 * Math.pow(newLevel + 1, 1.5))) {
      newLevel++;
      newCoins += newLevel * 50;
      console.log(`🎉 ${username} leveled up to ${newLevel}!`);
    }

    await db.collection('users').doc(userDocId(username)).update({
      coins: newCoins,
      diamonds: newDiamonds,
      xp: newXp,
      level: newLevel
    });

    console.log(`💰 ${username} earned: +${coins} coins, +${diamonds} diamonds, +${xp} XP`);
    res.json({ success: true, coins: newCoins, diamonds: newDiamonds, xp: newXp, level: newLevel });
  } catch (err) {
    console.error('Update resources error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// --------------------------------------------
// GAME
// --------------------------------------------

app.get('/api/game/leaderboard', async (req, res) => {
  try {
    const snap = await db.collection('users').orderBy('coins', 'desc').limit(100).get();
    const leaderboard = snap.docs.map((doc, index) => {
      const d = doc.data();
      return {
        rank: index + 1,
        username: d.username || doc.id,
        coins: d.coins || 0,
        diamonds: d.diamonds || 0,
        level: d.level || 1,
        avatar: d.equippedAvatar || 'default',
        gamesPlayed: d.gamesPlayed || 0
      };
    });
    res.json(leaderboard);
  } catch (err) {
    console.error('Leaderboard error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/game/save-result', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

  const token = authHeader.replace('Bearer ', '');
  const username = token.replace('mock-token-', '');
  const { category, score, questionsAnswered, correctAnswers, timeSpent } = req.body;

  try {
    const user = await findUser(username);
    if (!user) return res.status(404).json({ error: 'User not found' });

    await db.collection('users').doc(userDocId(username)).update({
      gamesPlayed: FieldValue.increment(1)
    });

    const updated = await findUser(username);
    console.log(`🎮 ${username} played ${category}: ${correctAnswers}/${questionsAnswered} correct`);

    res.json({
      success: true,
      message: 'Game result saved!',
      stats: {
        gamesPlayed: updated.gamesPlayed,
        totalCoins: updated.coins,
        level: updated.level
      }
    });
  } catch (err) {
    console.error('Save result error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// --------------------------------------------
// AI CHATBOT
// --------------------------------------------
app.post('/api/ai/chat', (req, res) => {
  const { message, history, username } = req.body;

  const responses = [
    "🧠 I'm here to help you learn! What would you like to know?",
    "💡 Did you know? The more you play, the more you earn!",
    "🏆 Keep playing to climb the leaderboard!",
    "💰 Save your coins for power-ups in the shop!",
    "🎨 You can change your theme in Settings!",
    "🔥 Build your daily streak for bonus rewards!",
    "🎡 Don't forget to spin the daily wheel!",
    "📚 There are 12 categories to explore!",
    "⭐ You're doing great! Keep it up!",
    "🎯 Focus on one category to master it!",
    "💎 Diamonds can be used for premium items!",
    "🖼️ Unlock new avatars in the shop!",
    "🚀 Level up by answering questions correctly!",
    "🎁 Check the Mystery Box daily for free rewards!",
    "👑 The leaderboard shows the best players!"
  ];

  let response = responses[Math.floor(Math.random() * responses.length)];

  const lower = message.toLowerCase();
  if (lower.includes('leaderboard')) {
    response = "🏆 Check the leaderboard to see top players! You can open it from the home page.";
  } else if (lower.includes('shop')) {
    response = "🏪 Visit the shop to buy themes, avatars, and power-ups! Use your coins and diamonds.";
  } else if (lower.includes('streak')) {
    response = "🔥 Play daily to build your streak! Higher streaks give better rewards!";
  } else if (lower.includes('coins')) {
    response = "💰 Earn coins by answering questions correctly! You can use them in the shop.";
  } else if (lower.includes('level')) {
    response = "⭐ Level up by earning XP from correct answers! Each level gives bonus coins!";
  } else if (lower.includes('help')) {
    response = "🆘 I'm here to help! Play trivia, earn coins, and have fun! What would you like to know?";
  }

  res.json({ response });
});

// --------------------------------------------
// ADMIN ROUTES
// --------------------------------------------
app.get('/api/admin/users', async (req, res) => {
  try {
    const snap = await db.collection('users').orderBy('coins', 'desc').get();
    const users = snap.docs.map(doc => {
      const d = doc.data();
      return {
        username: d.username || doc.id,
        coins: d.coins || 0,
        diamonds: d.diamonds || 0,
        level: d.level || 1,
        games_played: d.gamesPlayed || 0
      };
    });
    res.json({ total: users.length, users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/reset', async (req, res) => {
  try {
    const snap = await db.collection('users').get();
    const batch = db.batch();
    snap.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    console.log('🔄 Database reset');
    res.json({ success: true, message: 'All data reset' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
  console.log('═══════════════════════════════════════════');
  console.log('🧠 BRAIN RUSH BACKEND SERVER');
  console.log('═══════════════════════════════════════════');
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 API: http://localhost:${PORT}/api`);
  console.log(`🟢 Health: http://localhost:${PORT}/api/health`);
  console.log(`💾 Database: Firestore (free tier, permanent)`);
  console.log('═══════════════════════════════════════════');
  console.log('🔧 Press Ctrl+C to stop');
});
