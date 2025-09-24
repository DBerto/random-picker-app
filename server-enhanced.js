const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');

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

// Rate limiting - 20 requests per minute per IP (increased for room creation)
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
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
const ROOMS_FILE = path.join(__dirname, 'data', 'rooms.json');

// Email configuration
let emailTransporter;

// Initialize email transporter
function initializeEmailService() {
  // For development/testing, we'll use a simple SMTP service
  // In production, you should use environment variables for these settings
  const emailConfig = {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT || 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER || '', // Your email
      pass: process.env.EMAIL_PASS || ''  // Your app password
    }
  };

  // Only initialize if email credentials are provided
  if (emailConfig.auth.user && emailConfig.auth.pass) {
    emailTransporter = nodemailer.createTransporter(emailConfig);
    console.log('Email service initialized');
  } else {
    console.log('Email service not configured - emails will be logged instead');
  }
}

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
    
    // Initialize other files
    const files = [
      { path: USED_IPS_FILE, data: [] },
      { path: PICKS_LOG_FILE, data: [] },
      { path: ROOMS_FILE, data: [] }
    ];

    for (const file of files) {
      try {
        await fs.access(file.path);
      } catch {
        await fs.writeFile(file.path, JSON.stringify(file.data, null, 2));
        console.log(`Created ${path.basename(file.path)}`);
      }
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

// Email sending function
async function sendEmail(to, subject, html) {
  if (!emailTransporter) {
    console.log(`[EMAIL LOG] To: ${to}, Subject: ${subject}`);
    console.log(`[EMAIL LOG] Content: ${html}`);
    return { success: true, logged: true };
  }

  try {
    const info = await emailTransporter.sendMail({
      from: process.env.EMAIL_USER,
      to: to,
      subject: subject,
      html: html
    });
    
    console.log(`Email sent to ${to}: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`Error sending email to ${to}:`, error);
    return { success: false, error: error.message };
  }
}

// Email templates
function getWinnerEmailTemplate(roomName, winnerName) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
        .container { background: white; padding: 30px; border-radius: 15px; max-width: 500px; margin: 0 auto; box-shadow: 0 10px 30px rgba(0,0,0,0.1); }
        .header { text-align: center; margin-bottom: 20px; }
        .winner { color: #4CAF50; font-size: 24px; font-weight: bold; text-align: center; margin: 20px 0; }
        .content { color: #333; line-height: 1.6; }
        .footer { margin-top: 30px; text-align: center; color: #666; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎉 Congratulations!</h1>
        </div>
        <div class="content">
          <p>Great news! You have been randomly selected as the winner in:</p>
          <div class="winner">"${roomName}"</div>
          <p>You were chosen from all the participants in this random selection.</p>
          <p>Congratulations on your win! 🎉</p>
        </div>
        <div class="footer">
          <p>This email was sent by Random Picker App</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

function getLoserEmailTemplate(roomName, winnerName) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
        .container { background: white; padding: 30px; border-radius: 15px; max-width: 500px; margin: 0 auto; box-shadow: 0 10px 30px rgba(0,0,0,0.1); }
        .header { text-align: center; margin-bottom: 20px; }
        .winner { color: #667eea; font-size: 18px; font-weight: bold; text-align: center; margin: 20px 0; }
        .content { color: #333; line-height: 1.6; }
        .footer { margin-top: 30px; text-align: center; color: #666; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎲 Random Selection Results</h1>
        </div>
        <div class="content">
          <p>Thank you for participating in the random selection for:</p>
          <div class="winner">"${roomName}"</div>
          <p>This time, <strong>${winnerName}</strong> was randomly selected as the winner.</p>
          <p>Better luck next time! Thank you for participating. 🍀</p>
        </div>
        <div class="footer">
          <p>This email was sent by Random Picker App</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

// API Routes

// Get status - check if user can pick (legacy support)
app.get('/api/status', async (req, res) => {
  try {
    const clientIP = getClientIP(req);
    const usedIPs = await readJSONFile(USED_IPS_FILE);
    const participants = await readJSONFile(PARTICIPANTS_FILE);
    
    const hasUsed = usedIPs.some(entry => entry.ip === clientIP);
    
    res.json({
      canPick: !hasUsed,
      totalParticipants: participants.length,
      clientIP: clientIP,
      message: hasUsed ? 'You have already made a pick from this device/network.' : 'Ready to make a pick!'
    });
  } catch (error) {
    console.error('Error checking status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new room with email participants
app.post('/api/rooms', async (req, res) => {
  try {
    const { roomName, emails, description } = req.body;
    
    if (!roomName || !emails || !Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ error: 'Room name and email list are required' });
    }

    // Validate emails
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = emails.filter(email => !emailRegex.test(email.trim()));
    
    if (invalidEmails.length > 0) {
      return res.status(400).json({ 
        error: 'Invalid email addresses found', 
        invalidEmails 
      });
    }

    const roomId = uuidv4();
    const timestamp = new Date().toISOString();
    const clientIP = getClientIP(req);

    const newRoom = {
      id: roomId,
      name: roomName.trim(),
      description: description?.trim() || '',
      emails: emails.map(email => email.trim().toLowerCase()),
      createdAt: timestamp,
      createdBy: clientIP,
      status: 'active',
      winner: null,
      pickedAt: null
    };

    const rooms = await readJSONFile(ROOMS_FILE);
    rooms.push(newRoom);
    await writeJSONFile(ROOMS_FILE, rooms);

    console.log(`Room created: ${roomName} with ${emails.length} participants`);

    res.json({
      success: true,
      roomId: roomId,
      message: 'Room created successfully',
      room: newRoom
    });

  } catch (error) {
    console.error('Error creating room:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all rooms
app.get('/api/rooms', async (req, res) => {
  try {
    const rooms = await readJSONFile(ROOMS_FILE);
    res.json({ rooms });
  } catch (error) {
    console.error('Error getting rooms:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get specific room
app.get('/api/rooms/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;
    const rooms = await readJSONFile(ROOMS_FILE);
    const room = rooms.find(r => r.id === roomId);
    
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    res.json({ room });
  } catch (error) {
    console.error('Error getting room:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Pick winner for a room and send emails
app.post('/api/rooms/:roomId/pick', async (req, res) => {
  try {
    const { roomId } = req.params;
    const rooms = await readJSONFile(ROOMS_FILE);
    const roomIndex = rooms.findIndex(r => r.id === roomId);
    
    if (roomIndex === -1) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const room = rooms[roomIndex];
    
    if (room.status !== 'active') {
      return res.status(400).json({ error: 'Room is no longer active' });
    }

    if (room.winner) {
      return res.status(400).json({ error: 'Winner already selected for this room' });
    }

    // Pick random winner
    const randomIndex = Math.floor(Math.random() * room.emails.length);
    const winnerEmail = room.emails[randomIndex];
    const timestamp = new Date().toISOString();

    // Update room
    room.winner = winnerEmail;
    room.pickedAt = timestamp;
    room.status = 'completed';
    rooms[roomIndex] = room;
    await writeJSONFile(ROOMS_FILE, rooms);

    // Send emails to all participants
    const emailPromises = room.emails.map(async (email) => {
      const isWinner = email === winnerEmail;
      const subject = isWinner ? 
        `🎉 You Won! - ${room.name}` : 
        `Selection Results - ${room.name}`;
      
      const html = isWinner ? 
        getWinnerEmailTemplate(room.name, winnerEmail) :
        getLoserEmailTemplate(room.name, winnerEmail);

      return sendEmail(email, subject, html);
    });

    // Wait for all emails to be sent
    const emailResults = await Promise.all(emailPromises);
    const emailsSent = emailResults.filter(result => result.success).length;

    console.log(`Winner selected for room ${room.name}: ${winnerEmail}`);
    console.log(`Emails sent: ${emailsSent}/${room.emails.length}`);

    res.json({
      success: true,
      winner: winnerEmail,
      roomName: room.name,
      timestamp: timestamp,
      emailsSent: emailsSent,
      totalParticipants: room.emails.length,
      message: 'Winner selected and emails sent!'
    });

  } catch (error) {
    console.error('Error picking winner:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Legacy pick endpoint (for backward compatibility)
app.post('/api/pick', async (req, res) => {
  try {
    const clientIP = getClientIP(req);
    const usedIPs = await readJSONFile(USED_IPS_FILE);
    
    const hasUsed = usedIPs.some(entry => entry.ip === clientIP);
    if (hasUsed) {
      return res.status(403).json({ 
        error: 'You have already made a pick from this device/network.',
        canPick: false 
      });
    }
    
    const participants = await readJSONFile(PARTICIPANTS_FILE);
    if (participants.length === 0) {
      return res.status(400).json({ error: 'No participants available' });
    }
    
    const randomIndex = Math.floor(Math.random() * participants.length);
    const selectedParticipant = participants[randomIndex];
    
    const timestamp = new Date().toISOString();
    usedIPs.push({
      ip: clientIP,
      timestamp: timestamp,
      userAgent: req.headers['user-agent'] || 'unknown'
    });
    await writeJSONFile(USED_IPS_FILE, usedIPs);
    
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
      picksLog: picksLog.slice(-50),
      totalPicks: picksLog.length,
      totalUniqueIPs: usedIPs.length
    });
  } catch (error) {
    console.error('Error getting picks log:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reset picks (for admin)
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
  initializeEmailService();
  
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Server accessible on local network at http://[YOUR_LOCAL_IP]:${PORT}`);
    console.log('Enhanced Random Picker with Email Support');
    
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.log('\n⚠️  EMAIL NOT CONFIGURED:');
      console.log('Set EMAIL_USER and EMAIL_PASS environment variables to enable email sending');
      console.log('Emails will be logged to console instead');
    }
  });
}

startServer();
