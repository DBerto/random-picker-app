# Random Picker App

A local website that randomly picks a person from a list and ensures each user can only run it once (based on IP address).

## Features

- 🎲 **Random Selection**: Picks a random person from a configurable list
- 🔒 **One-Time Usage**: Each IP address can only make one pick
- 📊 **Admin Panel**: View picks log, participant list, and statistics
- 🛡️ **Security**: Rate limiting, helmet security headers, and IP-based tracking
- 📱 **Responsive Design**: Modern, mobile-friendly interface
- 🌐 **Local Network Access**: Accessible from any device on your local network

## Quick Start

### 1. Prerequisites

Make sure you have Node.js installed on your Mac:
- Download from [nodejs.org](https://nodejs.org/) (LTS version recommended)
- Or install via Homebrew: `brew install node`

### 2. Setup

```bash
# Navigate to the project directory
cd random-picker-app

# Install dependencies
npm install

# Start the server
npm start
```

### 3. Access the Application

- **Local access**: http://localhost:3000
- **Network access**: http://[YOUR_LOCAL_IP]:3000

To find your local IP address:
```bash
# On macOS/Linux
ifconfig | grep "inet " | grep -v 127.0.0.1

# Or specifically for WiFi on macOS
ipconfig getifaddr en0
```

## Usage

### Main Interface
1. Visit the main page at http://localhost:3000
2. Click "Make Your Pick!" to get a random selection
3. Each device/IP can only pick once

### Admin Panel
1. Visit http://localhost:3000/admin.html
2. View statistics, participant list, and picks log
3. Reset all picks if needed (use with caution!)

## Configuration

### Adding/Removing Participants

The participant list is stored in `data/participants.json`. You can edit this file directly:

```json
[
  "Alice Johnson",
  "Bob Smith",
  "Charlie Brown",
  "Your Name Here"
]
```

After editing, restart the server for changes to take effect.

### Customizing Settings

Edit `server.js` to modify:
- **Port**: Change `const PORT = process.env.PORT || 3000;`
- **Rate limiting**: Modify the `limiter` configuration
- **Security headers**: Adjust helmet configuration

## File Structure

```
random-picker-app/
├── server.js              # Main server file
├── package.json           # Dependencies and scripts
├── README.md              # This file
├── public/                # Static web files
│   ├── index.html         # Main picker interface
│   └── admin.html         # Admin panel
└── data/                  # Auto-created data directory
    ├── participants.json  # List of participants
    ├── used_ips.json     # IPs that have made picks
    └── picks_log.json    # Complete log of all picks
```

## API Endpoints

- `GET /api/status` - Check if current IP can make a pick
- `POST /api/pick` - Make a random pick (one per IP)
- `GET /api/participants` - Get list of participants
- `GET /api/picks-log` - Get picks history (admin)
- `POST /api/reset` - Reset all picks (admin)

## Security Features

- **Rate Limiting**: 10 requests per minute per IP
- **Helmet Security**: Security headers for XSS protection
- **IP Tracking**: One pick per IP address
- **Input Validation**: Server-side validation of all inputs
- **No External Dependencies**: All assets served locally

## Network Access Setup

### Option 1: Automatic Discovery
The server listens on `0.0.0.0:3000`, making it accessible from any device on your local network.

### Option 2: Firewall Configuration
If other devices can't access the server:

1. **macOS Firewall**: 
   - System Preferences → Security & Privacy → Firewall
   - Add Node.js or allow incoming connections

2. **Router Settings**: Ensure devices are on the same network

### Option 3: Port Forwarding (Advanced)
To access from outside your network, configure port forwarding on your router.

## Troubleshooting

### Common Issues

1. **Port Already in Use**
   ```bash
   # Check what's using port 3000
   lsof -i :3000
   
   # Kill the process or use a different port
   PORT=3001 npm start
   ```

2. **Permission Denied**
   ```bash
   # Make sure you have write permissions
   chmod 755 .
   ```

3. **Network Access Issues**
   - Check firewall settings
   - Verify all devices are on the same network
   - Try accessing via IP instead of localhost

4. **Data Files Issues**
   - The `data/` directory is created automatically
   - If corrupted, delete the `data/` folder and restart

### Logs and Debugging

- Server logs appear in the terminal where you ran `npm start`
- Check browser developer console for frontend errors
- All picks are logged in `data/picks_log.json`

## Development

### Running in Development Mode
```bash
# Install nodemon for auto-restart
npm install -g nodemon

# Run with auto-restart
npm run dev
```

### Customizing the UI
- Edit `public/index.html` for the main interface
- Edit `public/admin.html` for the admin panel
- CSS is inline for easy customization

## Data Management

### Backup Your Data
```bash
# Backup picks data
cp -r data/ data_backup_$(date +%Y%m%d)/
```

### Reset Everything
```bash
# Delete all data (server will recreate with defaults)
rm -rf data/
```

### Export Picks Data
The picks log in `data/picks_log.json` contains all pick history in JSON format for easy analysis.

## Security Considerations

- This app is designed for **local network use only**
- IP-based restrictions can be bypassed by changing networks
- For higher security, consider implementing user authentication
- Data is stored in plain text JSON files
- No encryption is applied to stored data

## License

MIT License - Feel free to modify and distribute as needed.

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review server logs for error messages
3. Ensure all dependencies are installed correctly
