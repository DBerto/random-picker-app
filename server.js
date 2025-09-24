const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
    },
  },
}));

// Rate limiting - 10 requests per minute per IP
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Data file paths
const PARTICIPANTS_FILE = path.join(__dirname, 'data', 'participants.json');
const USED_IPS_FILE = path.join(__dirname, 'data', 'used_ips.json');
const PICKS_LOG_FILE = path.join(__dirname, 'data', 'picks_log.json');

// Initialize data directory and files
async function initializeData() {
  try {
    // Create data directory if it doesn't exist
    await fs.mkdir(path.join(__dirname, 'data'), { recursive: true });
    
    // Initialize participants file with sample data
    try {
      await fs.access(PARTICIPANTS_FILE);
    } catch {
      const sampleParticipants = [
        'Alice Johnson',
        'Bob Smith',
        'Charlie Brown',
        'Diana Prince',
        'Edward Norton',
        'Fiona Green',
        'George Wilson',
        'Hannah Davis',
        'Ian Miller',
        'Julia Roberts'
      ];
      await fs.writeFile(PARTICIPANTS_FILE, JSON.stringify(sampleParticipants, null, 2));
      console.log('Created participants.json with sample data');
    }
    
    // Initialize used IPs file
    try {
      await fs.access(USED_IPS_FILE);
    } catch {
      await fs.writeFile(USED_IPS_FILE, JSON.stringify([], null, 2));
      console.log('Created used_ips.json');
    }
    
    // Initialize picks log file
    try {
      await fs.access(PICKS_LOG_FILE);
    } catch {
      await fs.writeFile(PICKS_LOG_FILE, JSON.stringify([], null, 2));
      console.log('Created picks_log.json');
    }
  } catch (error) {
    console.error('Error initializing data:', error);
  }
}

// Helper function to get client IP
function getClientIP(req) {
  return req.ip || 
         req.connection.remoteAddress || 
         req.socket.remoteAddress ||
         (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
         req.headers['x-forwarded-for']?.split(',')[0].trim() ||
         'unknown';
}

// Helper functions for file operations
async function readJSONFile(filePath) {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error);
    return [];
  }
}

async function writeJSONFile(filePath, data) {
  try {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error(`Error writing ${filePath}:`, error);
    throw error;
  }
}

// API Routes

// Get status - check if user can pick
app.get('/api/status', async (req, res) => {
  try {
    const clientIP = getClientIP(req);
    const usedIPs = await readJSONFile(USED_IPS_FILE);
    const participants = await readJSONFile(PARTICIPANTS_FILE);
    
    const hasUsed = usedIPs.some(entry => entry.ip === clientIP);
    
    res.json({
      canPick: !hasUsed,
      totalParticipants: participants.length,
      clientIP: clientIP, // For debugging - remove in production
      message: hasUsed ? 'You have already made a pick from this device/network.' : 'Ready to make a pick!'
    });
  } catch (error) {
    console.error('Error checking status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Make a random pick
app.post('/api/pick', async (req, res) => {
  try {
    const clientIP = getClientIP(req);
    const usedIPs = await readJSONFile(USED_IPS_FILE);
    
    // Check if IP has already been used
    const hasUsed = usedIPs.some(entry => entry.ip === clientIP);
    if (hasUsed) {
      return res.status(403).json({ 
        error: 'You have already made a pick from this device/network.',
        canPick: false 
      });
    }
    
    // Get participants
    const participants = await readJSONFile(PARTICIPANTS_FILE);
    if (participants.length === 0) {
      return res.status(400).json({ error: 'No participants available' });
    }
    
    // Make random pick
    const randomIndex = Math.floor(Math.random() * participants.length);
    const selectedParticipant = participants[randomIndex];
    
    // Record this IP as used
    const timestamp = new Date().toISOString();
    usedIPs.push({
      ip: clientIP,
      timestamp: timestamp,
      userAgent: req.headers['user-agent'] || 'unknown'
    });
    await writeJSONFile(USED_IPS_FILE, usedIPs);
    
    // Log the pick
    const picksLog = await readJSONFile(PICKS_LOG_FILE);
    picksLog.push({
      ip: clientIP,
      selectedParticipant: selectedParticipant,
      timestamp: timestamp,
      userAgent: req.headers['user-agent'] || 'unknown'
    });
    await writeJSONFile(PICKS_LOG_FILE, picksLog);
    
    console.log(`Pick made by ${clientIP}: ${selectedParticipant} at ${timestamp}`);
    
    res.json({
      success: true,
      selectedParticipant: selectedParticipant,
      timestamp: timestamp,
      message: 'Congratulations! Here is your random pick.'
    });
    
  } catch (error) {
    console.error('Error making pick:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get participants (for admin view)
app.get('/api/participants', async (req, res) => {
  try {
    const participants = await readJSONFile(PARTICIPANTS_FILE);
    res.json({ participants });
  } catch (error) {
    console.error('Error getting participants:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get picks log (for admin view)
app.get('/api/picks-log', async (req, res) => {
  try {
    const picksLog = await readJSONFile(PICKS_LOG_FILE);
    const usedIPs = await readJSONFile(USED_IPS_FILE);
    
    res.json({ 
      picksLog: picksLog.slice(-50), // Last 50 picks
      totalPicks: picksLog.length,
      totalUniqueIPs: usedIPs.length
    });
  } catch (error) {
    console.error('Error getting picks log:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reset picks (for admin - BE CAREFUL!)
app.post('/api/reset', async (req, res) => {
  try {
    await writeJSONFile(USED_IPS_FILE, []);
    await writeJSONFile(PICKS_LOG_FILE, []);
    
    console.log('Picks reset by admin');
    res.json({ success: true, message: 'All picks have been reset' });
  } catch (error) {
    console.error('Error resetting picks:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Initialize and start server
async function startServer() {
  await initializeData();
  
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Server accessible on local network at http://[YOUR_LOCAL_IP]:${PORT}`);
    console.log('To find your local IP, run: ipconfig getifaddr en0 (macOS) or hostname -I (Linux)');
  });
}

startServer();
