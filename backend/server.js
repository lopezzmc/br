// ============================================
// BRAIN RUSH BACKEND SERVER
// ============================================

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 5000;

// ============================================
// MIDDLEWARE
// ============================================
app.use(cors({
  origin: '*',
  credentials: true
}));
app.use(express.json());

// ============================================
// POSTGRESQL DATABASE SETUP
// ============================================
console.log('🔍 DATABASE_URL exists:', !!process.env.DATABASE_URL);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Required for Render PostgreSQL
  }
});

// Initialize database table on startup
async function initDatabase() {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS users (
      username VARCHAR(50) PRIMARY KEY,
      email VARCHAR(100),
      password VARCHAR(100),
      coins INT DEFAULT 100,
      diamonds INT DEFAULT 5,
      xp INT DEFAULT 0,
      level INT DEFAULT 1,
      streak_days INT DEFAULT 0,
      equipped_avatar VARCHAR(50) DEFAULT 'default',
      owned_avatars TEXT[] DEFAULT ARRAY['default'],
      owned_themes TEXT[] DEFAULT '{}',
      active_theme VARCHAR(50) DEFAULT 'default',
      inventory TEXT[] DEFAULT '{}',
      games_played INT DEFAULT 0,
      joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  try {
    await pool.query(createTableQuery);
    console.log('✅ Database initialized successfully');
    console.log('💾 Database: PostgreSQL (PERSISTENT!)');
  } catch (err) {
    console.error('❌ Database initialization error:', err.message);
  }
}

initDatabase();

// ============================================
// HELPER FUNCTIONS
// ============================================
async function findUser(username) {
  const result = await pool.query(
    'SELECT * FROM users WHERE LOWER(username) = LOWER($1)',
    [username]
  );
  return result.rows[0] || null;
}

// ============================================
// API ROUTES
// ============================================

// --------------------------------------------
// HEALTH CHECK
// --------------------------------------------
app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT COUNT(*) FROM users');
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      message: '🚀 Brain Rush Server is running!',
      users: parseInt(result.rows[0].count)
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Brain Rush API',
    version: '3.0.0',
    status: 'online',
    database: 'PostgreSQL (persistent)',
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

// REGISTER USER
app.post('/api/auth/register', async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || username.length < 2) {
    return res.status(400).json({
      success: false,
      error: 'Username must be at least 2 characters'
    });
  }

  try {
    const existing = await findUser(username);
    if (existing) {
      return res.status(400).json({
        success: false,
        error: 'Username already taken'
      });
    }

    const result = await pool.query(
      `INSERT INTO users (username, email, password, coins, diamonds)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [username, email || `${username}@brainrush.game`, password || 'default123', 100, 5]
    );

    const newUser = result.rows[0];
    const token = `mock-token-${username}`;

    console.log(`✅ New user registered: ${username}`);
    console.log(`📊 Total users: ${(await pool.query('SELECT COUNT(*) FROM users')).rows[0].count}`);

    res.status(201).json({
      success: true,
      token: token,
      user: {
        username: newUser.username,
        coins: newUser.coins,
        diamonds: newUser.diamonds,
        xp: newUser.xp,
        level: newUser.level,
        streakDays: newUser.streak_days,
        equippedAvatar: newUser.equipped_avatar,
        ownedAvatars: newUser.owned_avatars,
        ownedThemes: newUser.owned_themes,
        activeTheme: newUser.active_theme,
        inventory: newUser.inventory
      }
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// VERIFY USER
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

    res.json({
      valid: true,
      user: {
        username: user.username,
        coins: user.coins,
        diamonds: user.diamonds,
        xp: user.xp,
        level: user.level,
        streakDays: user.streak_days,
        equippedAvatar: user.equipped_avatar,
        ownedAvatars: user.owned_avatars,
        ownedThemes: user.owned_themes,
        activeTheme: user.active_theme,
        inventory: user.inventory,
        gamesPlayed: user.games_played || 0
      }
    });
  } catch (err) {
    res.status(500).json({ valid: false, error: 'Server error' });
  }
});

// --------------------------------------------
// USER DATA
// --------------------------------------------

// UPDATE USER DATA
app.post('/api/user/:username/update', async (req, res) => {
  const { username } = req.params;
  const updateData = req.body;

  try {
    const user = await findUser(username);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Build dynamic update query
    const fields = [];
    const values = [];
    let paramCount = 1;

    const mapping = {
      coins: 'coins',
      diamonds: 'diamonds',
      xp: 'xp',
      level: 'level',
      streakDays: 'streak_days',
      equippedAvatar: 'equipped_avatar',
      ownedAvatars: 'owned_avatars',
      ownedThemes: 'owned_themes',
      activeTheme: 'active_theme',
      inventory: 'inventory'
    };

    for (const [key, dbField] of Object.entries(mapping)) {
      if (updateData[key] !== undefined) {
        fields.push(`${dbField} = $${paramCount}`);
        values.push(updateData[key]);
        paramCount++;
      }
    }

    if (fields.length === 0) {
      return res.json({ success: true, message: 'No fields to update' });
    }

    values.push(username);
    const query = `UPDATE users SET ${fields.join(', ')} WHERE username = $${paramCount} RETURNING *`;
    const result = await pool.query(query, values);
    const updatedUser = result.rows[0];

    console.log(`✅ User updated: ${username}`);

    res.json({
      success: true,
      user: {
        username: updatedUser.username,
        coins: updatedUser.coins,
        diamonds: updatedUser.diamonds,
        xp: updatedUser.xp,
        level: updatedUser.level,
        streakDays: updatedUser.streak_days,
        equippedAvatar: updatedUser.equipped_avatar,
        ownedAvatars: updatedUser.owned_avatars,
        ownedThemes: updatedUser.owned_themes,
        activeTheme: updatedUser.active_theme,
        inventory: updatedUser.inventory
      }
    });
  } catch (err) {
    console.error('Update error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// UPDATE RESOURCES (Coins, Diamonds, XP)
app.post('/api/user/update-resources', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.replace('Bearer ', '');
  const username = token.replace('mock-token-', '');

  const { coins = 0, diamonds = 0, xp = 0 } = req.body;

  try {
    let user = await findUser(username);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Calculate new values
    let newCoins = user.coins + coins;
    let newDiamonds = user.diamonds + diamonds;
    let newXp = user.xp + xp;
    let newLevel = user.level;

    // Level up logic (while loop for multiple level-ups)
    while (newXp >= Math.floor(100 * Math.pow(newLevel + 1, 1.5))) {
      newLevel++;
      newCoins += newLevel * 50; // Bonus coins on level up
      console.log(`🎉 ${username} leveled up to ${newLevel}!`);
    }

    // Update database
    const result = await pool.query(
      `UPDATE users 
       SET coins = $1, diamonds = $2, xp = $3, level = $4
       WHERE username = $5
       RETURNING coins, diamonds, xp, level`,
      [newCoins, newDiamonds, newXp, newLevel, username]
    );

    const updated = result.rows[0];

    console.log(`💰 ${username} earned: +${coins} coins, +${diamonds} diamonds, +${xp} XP`);

    res.json({
      success: true,
      coins: updated.coins,
      diamonds: updated.diamonds,
      xp: updated.xp,
      level: updated.level
    });
  } catch (err) {
    console.error('Update resources error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// --------------------------------------------
// GAME
// --------------------------------------------

// GET LEADERBOARD
app.get('/api/game/leaderboard', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT username, coins, diamonds, level, equipped_avatar as avatar, games_played
       FROM users
       ORDER BY coins DESC
       LIMIT 100`
    );

    const leaderboard = result.rows.map((item, index) => ({
      rank: index + 1,
      username: item.username,
      coins: item.coins || 0,
      diamonds: item.diamonds || 0,
      level: item.level || 1,
      avatar: item.avatar || 'default',
      gamesPlayed: item.games_played || 0
    }));

    res.json(leaderboard);
  } catch (err) {
    console.error('Leaderboard error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// SAVE GAME RESULT
app.post('/api/game/save-result', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.replace('Bearer ', '');
  const username = token.replace('mock-token-', '');

  const { category, score, questionsAnswered, correctAnswers, timeSpent } = req.body;

  try {
    const result = await pool.query(
      `UPDATE users 
       SET games_played = games_played + 1
       WHERE username = $1
       RETURNING games_played, coins, level`,
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updated = result.rows[0];

    console.log(`🎮 ${username} played ${category}: ${correctAnswers}/${questionsAnswered} correct`);

    res.json({
      success: true,
      message: 'Game result saved!',
      stats: {
        gamesPlayed: updated.games_played,
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
// ADMIN ROUTES (for testing)
// --------------------------------------------
app.get('/api/admin/users', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT username, coins, diamonds, level, games_played FROM users ORDER BY coins DESC`
    );
    res.json({
      total: result.rows.length,
      users: result.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/reset', async (req, res) => {
  try {
    await pool.query('DELETE FROM users');
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
  console.log(`💾 Database: PostgreSQL (PERSISTENT!)`);
  console.log('═══════════════════════════════════════════');
  console.log('');
  console.log('📌 Available Endpoints:');
  console.log('  POST /api/auth/register');
  console.log('  GET  /api/auth/verify');
  console.log('  POST /api/user/:username/update');
  console.log('  POST /api/user/update-resources');
  console.log('  GET  /api/game/leaderboard');
  console.log('  POST /api/game/save-result');
  console.log('  POST /api/ai/chat');
  console.log('');
  console.log('🔧 Press Ctrl+C to stop');
});
