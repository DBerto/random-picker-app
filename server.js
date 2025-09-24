const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const sgMail = require('@sendgrid/mail');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for Railway/production deployment
app.set('trust proxy', 1);

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

// Rate limiting - more permissive for POC
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 50, // Increased limit for testing
  message: { error: 'Too many requests from this IP, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  trustProxy: true, // Explicitly trust proxy
  skip: (req) => {
    // Skip rate limiting for health checks or specific paths if needed
    return req.path === '/health' || req.path === '/api/status';
  }
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
let emailService = 'console'; // 'sendgrid', 'ethereal', or 'console'

// Initialize email service
async function initializeEmailService() {
  // Try SendGrid first (if API key provided)
  if (process.env.SENDGRID_API_KEY) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    emailService = 'sendgrid';
    console.log('✅ SendGrid email service initialized');
    return;
  }

  // Try Ethereal (free testing service) - automatically creates account
  try {
    const nodemailer = require('nodemailer');
    const testAccount = await nodemailer.createTestAccount();
    
    global.etherealTransporter = nodemailer.createTransporter({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
    
    emailService = 'ethereal';
    console.log('✅ Ethereal email service initialized (test emails)');
    console.log(`📧 View sent emails at: https://ethereal.email`);
    console.log(`📧 Login: ${testAccount.user} / ${testAccount.pass}`);
    return;
  } catch (error) {
    console.log('⚠️  Could not initialize Ethereal, using console logging');
  }

  // Fallback to console logging
  emailService = 'console';
  console.log('📧 Email service: Console logging (no actual emails sent)');
}

// Initialize data directory and files
async function initializeData() {
  try {
    await fs.mkdir(path.join(__dirname, 'data'), { recursive: true });
    
    try {
      await fs.access(PARTICIPANTS_FILE);
    } catch {
      const sampleParticipants = [
        'Alice Johnson', 'Bob Smith', 'Charlie Brown', 'Diana Prince', 'Edward Norton',
        'Fiona Green', 'George Wilson', 'Hannah Davis', 'Ian Miller', 'Julia Roberts'
      ];
      await fs.writeFile(PARTICIPANTS_FILE, JSON.stringify(sampleParticipants, null, 2));
      console.log('Created participants.json with sample data');
    }
    
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

// Helper functions
function getClientIP(req) {
  return req.ip || 
         req.connection.remoteAddress || 
         req.socket.remoteAddress ||
         (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
         req.headers['x-forwarded-for']?.split(',')[0].trim() ||
         'unknown';
}

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
  console.log(`📧 Sending email to: ${to}`);
  console.log(`📧 Subject: ${subject}`);
  
  try {
    switch (emailService) {
      case 'sendgrid':
        const msg = {
          to: to,
          from: process.env.SENDGRID_FROM_EMAIL || 'noreply@randompicker.app',
          subject: subject,
          html: html,
        };
        await sgMail.send(msg);
        console.log(`✅ SendGrid email sent to ${to}`);
        return { success: true, service: 'sendgrid' };

      case 'ethereal':
        const info = await global.etherealTransporter.sendMail({
          from: '"Random Picker" <noreply@randompicker.app>',
          to: to,
          subject: subject,
          html: html,
        });
        
        console.log(`✅ Ethereal email sent to ${to}`);
        console.log(`📧 Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
        return { 
          success: true, 
          service: 'ethereal',
          previewUrl: require('nodemailer').getTestMessageUrl(info)
        };

      default: // console
        console.log('📧 [EMAIL PREVIEW] ================================');
        console.log(`To: ${to}`);
        console.log(`Subject: ${subject}`);
        console.log(`Content: ${html.substring(0, 200)}...`);
        console.log('📧 ============================================');
        return { success: true, service: 'console' };
    }
  } catch (error) {
    console.error(`❌ Error sending email to ${to}:`, error.message);
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
        .badge { background: #4CAF50; color: white; padding: 10px 20px; border-radius: 25px; display: inline-block; margin: 15px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎉 Congratulations!</h1>
          <div class="badge">WINNER</div>
        </div>
        <div class="content">
          <p>Great news! You have been randomly selected as the winner in:</p>
          <div class="winner">"${roomName}"</div>
          <p>You were chosen from all the participants in this random selection.</p>
          <p><strong>Congratulations on your win!</strong> 🎉</p>
        </div>
        <div class="footer">
          <p>This email was sent by Random Picker App</p>
          <p><em>This is a proof of concept email notification</em></p>
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
        .badge { background: #667eea; color: white; padding: 10px 20px; border-radius: 25px; display: inline-block; margin: 15px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎲 Random Selection Results</h1>
          <div class="badge">RESULTS</div>
        </div>
        <div class="content">
          <p>Thank you for participating in the random selection for:</p>
          <div class="winner">"${roomName}"</div>
          <p>This time, <strong>${winnerName}</strong> was randomly selected as the winner.</p>
          <p>Better luck next time! Thank you for participating. 🍀</p>
        </div>
        <div class="footer">
          <p>This email was sent by Random Picker App</p>
          <p><em>This is a proof of concept email notification</em></p>
        </div>
      </div>
    </body>
    </html>
  `;
}

// API Routes

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

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
      emailService: emailService,
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
      pickedAt: null,
      emailService: emailService
    };

    const rooms = await readJSONFile(ROOMS_FILE);
    rooms.push(newRoom);
    await writeJSONFile(ROOMS_FILE, rooms);

    console.log(`Room created: ${roomName} with ${emails.length} participants`);

    res.json({
      success: true,
      roomId: roomId,
      message: 'Room created successfully',
      room: newRoom,
      emailService: emailService
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
    res.json({ rooms, emailService });
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

    res.json({ room, emailService });
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
    const emailResults = [];
    let previewUrls = [];

    for (const email of room.emails) {
      const isWinner = email === winnerEmail;
      const subject = isWinner ? 
        `🎉 You Won! - ${room.name}` : 
        `Selection Results - ${room.name}`;
      
      const html = isWinner ? 
        getWinnerEmailTemplate(room.name, winnerEmail) :
        getLoserEmailTemplate(room.name, winnerEmail);

      const result = await sendEmail(email, subject, html);
      emailResults.push(result);
      
      if (result.previewUrl) {
        previewUrls.push({ email, url: result.previewUrl, type: isWinner ? 'winner' : 'participant' });
      }
    }

    const emailsSent = emailResults.filter(result => result.success).length;

    console.log(`Winner selected for room ${room.name}: ${winnerEmail}`);
    console.log(`Emails processed: ${emailsSent}/${room.emails.length}`);

    res.json({
      success: true,
      winner: winnerEmail,
      roomName: room.name,
      timestamp: timestamp,
      emailsSent: emailsSent,
      totalParticipants: room.emails.length,
      emailService: emailService,
      previewUrls: previewUrls,
      message: emailService === 'console' ? 
        'Winner selected! Check server logs for email previews.' :
        `Winner selected and ${emailsSent} emails sent via ${emailService}!`
    });

  } catch (error) {
    console.error('Error picking winner:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Legacy endpoints (unchanged)
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

app.get('/api/participants', async (req, res) => {
  try {
    const participants = await readJSONFile(PARTICIPANTS_FILE);
    res.json({ participants });
  } catch (error) {
    console.error('Error getting participants:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

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
  await initializeEmailService();
  
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Enhanced Random Picker with Email Support`);
    console.log(`Email Service: ${emailService}`);
    
    if (emailService === 'console') {
      console.log('\n💡 For POC email testing:');
      console.log('   - Emails will be logged to console');
      console.log('   - No actual emails sent (perfect for testing)');
      console.log('   - Add SENDGRID_API_KEY for real emails');
    }
  });
}

startServer();
