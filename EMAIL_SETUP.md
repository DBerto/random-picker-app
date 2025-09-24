# Email Setup Guide for Random Picker

## 🎯 What's New

Your Random Picker app now supports:
- **Room Creation** with email participants
- **Automatic Email Notifications** to all participants
- **Winner/Loser Email Templates** with beautiful HTML design
- **Room Management** with status tracking

## 📧 Email Configuration

### Option 1: Gmail Setup (Recommended)

1. **Enable 2-Step Verification**:
   - Go to [Google Account Security](https://myaccount.google.com/security)
   - Enable "2-Step Verification"

2. **Generate App Password**:
   - Go to Security → 2-Step Verification → App passwords
   - Select "Mail" and generate password
   - Copy the 16-character password

3. **Set Environment Variables on Railway**:
   - Go to your Railway project dashboard
   - Click "Variables" tab
   - Add these variables:
     ```
     EMAIL_USER=your-email@gmail.com
     EMAIL_PASS=your-16-character-app-password
     SMTP_HOST=smtp.gmail.com
     SMTP_PORT=587
     ```

### Option 2: Other Email Providers

**Outlook/Hotmail**:
```
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
EMAIL_USER=your-email@outlook.com
EMAIL_PASS=your-password
```

**Yahoo Mail**:
```
SMTP_HOST=smtp.mail.yahoo.com
SMTP_PORT=587
EMAIL_USER=your-email@yahoo.com
EMAIL_PASS=your-app-password
```

## 🚀 Deployment Instructions

### Update Your Deployed App

1. **Replace server.js**:
   ```bash
   # In your project directory
   cp server-enhanced.js server.js
   cp public/index-enhanced.html public/index.html
   ```

2. **Install new dependencies**:
   ```bash
   npm install
   ```

3. **Commit and push**:
   ```bash
   git add .
   git commit -m "Add email functionality and room system"
   git push
   ```

4. **Set Railway Environment Variables**:
   - Go to Railway project → Variables
   - Add your email configuration variables
   - Railway will automatically redeploy

## 🎮 How to Use the Enhanced App

### Creating an Email Room

1. **Go to your deployed app URL**
2. **Click "Create Email Room"**
3. **Fill in details**:
   - Room name (e.g., "Team Pizza Party Winner")
   - Description (optional)
   - Add participant emails (type and press Enter)
4. **Click "Create Room & Send Emails"**
5. **Click "Pick Winner & Send Emails"**

### What Happens

1. **Room Created**: All participant emails are stored
2. **Winner Selected**: Random participant is chosen
3. **Emails Sent**:
   - **Winner** gets: "🎉 You Won! - [Room Name]"
   - **Others** get: "Selection Results - [Room Name]" (shows who won)

## 📱 Email Templates

### Winner Email
```html
🎉 Congratulations!
You have been randomly selected as the winner in: "[Room Name]"
Congratulations on your win! 🎉
```

### Participant Email
```html
🎲 Random Selection Results
Thank you for participating in: "[Room Name]"
This time, [Winner Name] was randomly selected as the winner.
Better luck next time! 🍀
```

## 🛠️ Testing Without Email Setup

If you don't configure email credentials:
- App works normally
- Emails are logged to console instead of sent
- You can see email content in Railway logs

## 🔧 Advanced Configuration

### Custom SMTP Service

For services like SendGrid, Mailgun, etc.:
```
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
EMAIL_USER=apikey
EMAIL_PASS=your-sendgrid-api-key
```

### Environment Variables Reference

| Variable | Description | Example |
|----------|-------------|---------|
| `EMAIL_USER` | Your email address | `myemail@gmail.com` |
| `EMAIL_PASS` | App password or SMTP password | `abcd efgh ijkl mnop` |
| `SMTP_HOST` | SMTP server hostname | `smtp.gmail.com` |
| `SMTP_PORT` | SMTP server port | `587` |

## 🎯 Features Overview

### New Features Added:
✅ **Room Creation** - Create rooms with participant emails  
✅ **Email Notifications** - Automatic winner/loser emails  
✅ **Room Management** - View all rooms and their status  
✅ **Beautiful Email Templates** - Professional HTML emails  
✅ **Multiple SMTP Support** - Works with any email provider  

### Original Features (Still Available):
✅ **Quick Pick** - Original IP-based random selection  
✅ **Admin Panel** - View logs and statistics  
✅ **Security** - Rate limiting and protection  
✅ **Mobile Friendly** - Responsive design  

## 🚨 Important Notes

1. **Gmail Security**: Use App Passwords, not your regular password
2. **Email Limits**: Most providers have daily sending limits
3. **Privacy**: Email addresses are stored locally in your app
4. **Testing**: Always test with your own email first

## 🎉 Ready to Go Live!

Once you've set up email configuration, your app will be a complete random selection system with professional email notifications!

Users can create rooms, add participants, and everyone gets notified automatically. Perfect for team selections, giveaways, or any random picking needs!
