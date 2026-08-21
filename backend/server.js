// ============================================
// BRAIN RUSH BACKEND SERVER
// ============================================

const express = require('express');
const cors = require('cors');
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
// IN-MEMORY DATABASE (for demo)
// ============================================
// In production, replace this with MongoDB/PostgreSQL
const users = [];
const leaderboard = [];

// ============================================
// HELPER FUNCTIONS
// ============================================
function findUser(username) {
  return users.find(u => u.username.toLowerCase() === username.toLowerCase());
}

function findUserIndex(username) {
  return users.findIndex(u => u.username.toLowerCase() === username.toLowerCase());
}

function updateLeaderboard(user) {
  const existing = leaderboard.findIndex(l => l.username === user.username);
  if (existing !== -1) {
    leaderboard[existing] = {
      username: user.username,
      coins: user.coins || 0,
      diamonds: user.diamonds || 0,
      level: user.level || 1,
      avatar: user.equippedAvatar || 'default',
      gamesPlayed: user.gamesPlayed || 0
    };
  } else {
    leaderboard.push({
      username: user.username,
      coins: user.coins || 0,
      diamonds: user.diamonds || 0,
      level: user.level || 1,
      avatar: user.equippedAvatar || 'default',
      gamesPlayed: user.gamesPlayed || 0
    });
  }
}

// ============================================
// API ROUTES
// ============================================

// --------------------------------------------
// HEALTH CHECK
// --------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    message: '🚀 Brain Rush Server is running!',
    users: users.length,
    leaderboard: leaderboard.length
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Brain Rush API',
    version: '2.0.0',
    status: 'online',
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
app.post('/api/auth/register', (req, res) => {
  const { username, email, password } = req.body;
  
  // Validate username
  if (!username || username.length < 2) {
    return res.status(400).json({
      success: false,
      error: 'Username must be at least 2 characters'
    });
  }
  
  // Check if user exists
  if (findUser(username)) {
    return res.status(400).json({
      success: false,
      error: 'Username already taken'
    });
  }
  
  // Create new user
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
    joinedAt: new Date().toISOString()
  };
  
  users.push(newUser);
  updateLeaderboard(newUser);
  
  // Generate token
  const token = `mock-token-${username}`;
  
  console.log(`✅ New user registered: ${username}`);
  console.log(`📊 Total users: ${users.length}`);
  
  res.status(201).json({
    success: true,
    token: token,
    user: {
      username: newUser.username,
      coins: newUser.coins,
      diamonds: newUser.diamonds,
      xp: newUser.xp,
      level: newUser.level,
      streakDays: newUser.streakDays,
      equippedAvatar: newUser.equippedAvatar,
      ownedAvatars: newUser.ownedAvatars,
      ownedThemes: newUser.ownedThemes,
      activeTheme: newUser.activeTheme,
      inventory: newUser.inventory
    }
  });
});

// VERIFY USER
app.get('/api/auth/verify', (req, res) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({ valid: false, error: 'No token provided' });
  }
  
  const token = authHeader.replace('Bearer ', '');
  const username = token.replace('mock-token-', '');
  
  const user = findUser(username);
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
      streakDays: user.streakDays,
      equippedAvatar: user.equippedAvatar,
      ownedAvatars: user.ownedAvatars,
      ownedThemes: user.ownedThemes,
      activeTheme: user.activeTheme,
      inventory: user.inventory,
      gamesPlayed: user.gamesPlayed || 0
    }
  });
});

// --------------------------------------------
// USER DATA
// --------------------------------------------

// UPDATE USER DATA
app.post('/api/user/:username/update', (req, res) => {
  const { username } = req.params;
  const updateData = req.body;
  
  const userIndex = findUserIndex(username);
  if (userIndex === -1) {
    return res.status(404).json({
      success: false,
      error: 'User not found'
    });
  }
  
  // Update user
  const user = users[userIndex];
  Object.assign(user, updateData);
  
  // Update leaderboard
  updateLeaderboard(user);
  
  console.log(`✅ User updated: ${username}`);
  
  res.json({
    success: true,
    user: {
      username: user.username,
      coins: user.coins,
      diamonds: user.diamonds,
      xp: user.xp,
      level: user.level,
      streakDays: user.streakDays,
      equippedAvatar: user.equippedAvatar,
      ownedAvatars: user.ownedAvatars,
      ownedThemes: user.ownedThemes,
      activeTheme: user.activeTheme,
      inventory: user.inventory
    }
  });
});

// UPDATE RESOURCES (Coins, Diamonds, XP)
app.post('/api/user/update-resources', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const token = authHeader.replace('Bearer ', '');
  const username = token.replace('mock-token-', '');
  
  const user = findUser(username);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  const { coins = 0, diamonds = 0, xp = 0 } = req.body;
  
  user.coins += coins;
  user.diamonds += diamonds;
  user.xp += xp;
  
  // Level up logic
  while (user.xp >= Math.floor(100 * Math.pow(user.level + 1, 1.5))) {
    user.level++;
    user.coins += user.level * 50; // Bonus coins on level up
    console.log(`🎉 ${username} leveled up to ${user.level}!`);
  }
  
  updateLeaderboard(user);
  
  console.log(`💰 ${username} earned: +${coins} coins, +${diamonds} diamonds, +${xp} XP`);
  
  res.json({
    success: true,
    coins: user.coins,
    diamonds: user.diamonds,
    xp: user.xp,
    level: user.level
  });
});

// --------------------------------------------
// GAME
// --------------------------------------------

// GET LEADERBOARD
app.get('/api/game/leaderboard', (req, res) => {
  const sorted = [...leaderboard].sort((a, b) => (b.coins || 0) - (a.coins || 0));
  
  res.json(sorted.map((item, index) => ({
    rank: index + 1,
    username: item.username,
    coins: item.coins || 0,
    diamonds: item.diamonds || 0,
    level: item.level || 1,
    avatar: item.avatar || 'default',
    gamesPlayed: item.gamesPlayed || 0
  })));
});

// SAVE GAME RESULT
app.post('/api/game/save-result', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const token = authHeader.replace('Bearer ', '');
  const username = token.replace('mock-token-', '');
  
  const user = findUser(username);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  const { category, score, questionsAnswered, correctAnswers, timeSpent } = req.body;
  
  user.gamesPlayed = (user.gamesPlayed || 0) + 1;
  updateLeaderboard(user);
  
  console.log(`🎮 ${username} played ${category}: ${correctAnswers}/${questionsAnswered} correct`);
  
  res.json({
    success: true,
    message: 'Game result saved!',
    stats: {
      gamesPlayed: user.gamesPlayed,
      totalCoins: user.coins,
      level: user.level
    }
  });
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
  
  // Try to give a relevant response based on keywords
  let response = responses[Math.floor(Math.random() * responses.length)];
  
  if (message.toLowerCase().includes('leaderboard')) {
    response = "🏆 Check the leaderboard to see top players! You can open it from the home page.";
  } else if (message.toLowerCase().includes('shop')) {
    response = "🏪 Visit the shop to buy themes, avatars, and power-ups! Use your coins and diamonds.";
  } else if (message.toLowerCase().includes('streak')) {
    response = "🔥 Play daily to build your streak! Higher streaks give better rewards!";
  } else if (message.toLowerCase().includes('coins')) {
    response = "💰 Earn coins by answering questions correctly! You can use them in the shop.";
  } else if (message.toLowerCase().includes('level')) {
    response = "⭐ Level up by earning XP from correct answers! Each level gives bonus coins!";
  } else if (message.toLowerCase().includes('help')) {
    response = "🆘 I'm here to help! Play trivia, earn coins, and have fun! What would you like to know?";
  }
  
  res.json({ response });
});

// --------------------------------------------
// ADMIN ROUTES (for testing)
// --------------------------------------------
app.get('/api/admin/users', (req, res) => {
  res.json({
    total: users.length,
    users: users.map(u => ({
      username: u.username,
      coins: u.coins,
      diamonds: u.diamonds,
      level: u.level,
      gamesPlayed: u.gamesPlayed || 0
    }))
  });
});

app.delete('/api/admin/reset', (req, res) => {
  users.length = 0;
  leaderboard.length = 0;
  console.log('🔄 Database reset');
  res.json({ success: true, message: 'All data reset' });
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
  console.log(`👥 Users: ${users.length} registered (waiting for connections)`);
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
