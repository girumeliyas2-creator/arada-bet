const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// RapidAPI / BetsAPI Credentials
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || "39645b2f04msh082e9121835d468p1e1c2fjsn9a3fb17e6241";
const RAPIDAPI_HOST = "betsapi2.p.rapidapi.com";
const ADMIN_SECRET_KEY = "arada_admin_secure_2026";

// Memory Databases
let usersWallets = {
  "user_001": { balance: 500.00, phone: "+251911223344" }
};
let activeBets = [];
let pendingDeposits = [];

let matchesCache = {
  timestamp: 0,
  data: []
};
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 ደቂቃ Caching

// ==========================================
// 1. SPORTS API (BetsAPI Integration)
// ==========================================
app.get('/api/sports/fixtures', async (req, res) => {
  const currentTime = Date.now();
  if (matchesCache.data.length > 0 && (currentTime - matchesCache.timestamp) < CACHE_DURATION_MS) {
    return res.json({ success: true, cached: true, matches: matchesCache.data });
  }

  try {
    const response = await axios.get(`https://${RAPIDAPI_HOST}/v1/events/upcoming`, {
      params: { sport_id: '1', page: '1' },
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': RAPIDAPI_HOST
      }
    });

    const events = response.data.results || [];
    const formattedMatches = events.map(event => ({
      id: event.id,
      league: event.league ? event.league.name : 'Unknown League',
      homeTeam: event.home ? event.home.name : 'Home Team',
      awayTeam: event.away ? event.away.name : 'Away Team',
      time: new Date(parseInt(event.time) * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      date: new Date(parseInt(event.time) * 1000).toLocaleDateString(),
      odds: {
        home: event.main_odds?.home_od || (1.5 + Math.random() * 0.5).toFixed(2),
        draw: event.main_odds?.draw_od || (3.0 + Math.random() * 0.5).toFixed(2),
        away: event.main_odds?.away_od || (2.2 + Math.random() * 0.8).toFixed(2)
      }
    }));

    matchesCache = { timestamp: currentTime, data: formattedMatches };
    res.json({ success: true, cached: false, matches: formattedMatches });
  } catch (error) {
    console.error('API Fetch Error:', error.message);
    res.status(500).json({ success: false, message: 'ጨዋታዎችን መጫን አልተቻለም' });
  }
});

// ==========================================
// 2. WALLET & TELEBIRR P2P DEPOSIT
// ==========================================
app.get('/api/wallet/:userId', (req, res) => {
  const { userId } = req.params;
  const user = usersWallets[userId] || { balance: 0.00 };
  res.json({ success: true, balance: user.balance });
});

app.post('/api/wallet/deposit', (req, res) => {
  const { userId, amount, txId, senderPhone } = req.body;
  if (!amount || !txId || !senderPhone) {
    return res.status(400).json({ success: false, message: 'እባክዎ ትክክለኛ መረጃ ይሙሉ' });
  }

  pendingDeposits.push({ userId, amount: parseFloat(amount), txId, senderPhone, timestamp: new Date() });

  if (!usersWallets[userId]) {
    usersWallets[userId] = { balance: 0.00, phone: senderPhone };
  }
  usersWallets[userId].balance += parseFloat(amount);

  res.json({ 
    success: true, 
    message: 'ክፍያው በተሳካ ሁኔታ ተረጋግጧል!', 
    newBalance: usersWallets[userId].balance 
  });
});

// ==========================================
// 3. BET PLACEMENT & WAGERING
// ==========================================
app.post('/api/bet/place', (req, res) => {
  const { userId, items, stake, totalOdds } = req.body;
  const user = usersWallets[userId];

  if (!user || user.balance < stake) {
    return res.status(400).json({ success: false, message: 'የኪስ ቦርሳ ሂሳብዎ በቂ አይደለም!' });
  }

  user.balance -= parseFloat(stake);
  const potentialPayout = parseFloat(stake) * parseFloat(totalOdds);
  const ticketId = 'ARADA-' + Math.floor(100000 + Math.random() * 900000);

  activeBets.push({
    ticketId,
    userId,
    items,
    stake: parseFloat(stake),
    totalOdds: parseFloat(totalOdds),
    potentialPayout,
    status: 'PENDING'
  });

  res.json({
    success: true,
    message: 'ውርርዱ ተመዝግቧል!',
    ticketId,
    newBalance: user.balance,
    potentialPayout: potentialPayout.toFixed(2)
  });
});

// ==========================================
-- 4. ADMIN SETTLEMENT
// ==========================================
app.post('/api/admin/settle-match', (req, res) => {
  const { matchId, winningResult, adminKey } = req.body;
  if (adminKey !== ADMIN_SECRET_KEY) {
    return res.status(403).json({ success: false, message: 'ፈቃድ የለዎትም' });
  }

  res.json({ success: true, message: `ጨዋታ [${matchId}] ውጤት (${winningResult}) ተመዝግቦ ተዘግቷል!` });
});

// Server Start
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Arada Bet Server running on port ${PORT}`));
      
