# 🚀 X Feed Viewer - Chrome Extension

<div align="center">

![X Feed Viewer](https://img.shields.io/badge/Chrome_Extension-X_Feed_Viewer-1DA1F2?style=for-the-badge&logo=googlechrome&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.8+-3776AB?style=for-the-badge&logo=python&logoColor=white)
![Flask](https://img.shields.io/badge/Flask-2.0+-000000?style=for-the-badge&logo=flask&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.0+-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)

*Seamlessly access and view X (Twitter) feeds directly in your browser with this powerful Chrome extension*

</div>

## ✨ Features

- 🔐 **Secure Account Management** - Save multiple X accounts with encrypted session storage
- 🎨 **Native X UI** - Beautiful interface that matches X's official design language
- ⚡ **Real-time Feed Loading** - Fetch and display feeds with 40+ tweets per load
- 🖼️ **Rich Media Support** - Display images, videos, and GIFs seamlessly
- 📱 **Responsive Design** - Optimized for all screen sizes
- 🌙 **Dark Theme** - Matches X's dark mode aesthetic
- 🔄 **Session Persistence** - Automatic login state management

## 🛠️ Tech Stack

- **Backend**: Python Flask with async support
- **Frontend**: Vanilla JavaScript + Tailwind CSS
- **X API**: Twikit library for X interactions
- **Storage**: JSON-based session management
- **UI Framework**: Chrome Extension Manifest V3

## 📋 Prerequisites

- Python 3.8 or higher
- Chrome browser (latest version recommended)
- Active X (Twitter) account(s)

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/kingslayer35/Extension-to-view-a-user-s-X-home-feed.git
cd Extension-to-view-a-user-s-X-home-feed
```

### 2. Install Python Dependencies

```bash
pip install -r requirements.txt
```

### 3. Start the Backend Server

```bash
python app.py
```

The server will start at `http://127.0.0.1:5000`

### 4. Load the Chrome Extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right
3. Click "Load unpacked" and select the project directory
4. The extension icon will appear in your browser toolbar

## 🎯 Usage Guide

### Adding Accounts

1. Click the extension icon in your Chrome toolbar
2. Fill in the account details:
   - **Friendly Name**: A custom name for easy identification
   - **Username**: Your X username (without @)
   - **Email**: Login email address
   - **Password**: Your X account password
3. Click "Log In & Save"

### Viewing Feeds

1. After adding accounts, they'll appear in the "Load Saved Feed" section
2. Click "View Feed" next to any saved account
3. The feed will be injected into the current X tab
4. Enjoy your custom feed with enhanced formatting!

## 📁 Project Structure

```
x-feed-viewer/
├── app.py              # Flask backend server
├── popup.html          # Extension popup interface
├── popup.js            # Frontend JavaScript logic
├── input.css           # Tailwind CSS source
├── output.css          # Compiled CSS styles
├── tailwind.config.js  # Tailwind configuration
├── requirements.txt    # Python dependencies
├── manifest.json       # Chrome extension manifest
└── sessions/          # Account session storage (auto-created)
```

## 🔧 Configuration

### Backend Configuration

The Flask server runs on `localhost:5000` by default. To change this, modify the host and port in `app.py`:

```python
if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000, debug=True)
```

### Styling Customization

The extension uses Tailwind CSS with custom X-themed colors. Modify `tailwind.config.js` to customize the appearance:

```javascript
colors: {
  'x-blue': '#1DA1F2',
  'x-bg': '#000000',
  'x-border': '#2f3336',
  'x-text-primary': '#e7e9ea',
  'x-text-secondary': '#71767b',
}
```

## 🛡️ Security Features

- **Local Session Storage**: Account sessions are stored locally as JSON files
- **No Credential Storage**: Passwords are only used for initial authentication
- **CORS Protection**: Configured for secure cross-origin requests
- **Error Handling**: Comprehensive error handling for failed requests

## 🔍 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/get-accounts` | GET | Retrieve list of saved accounts |
| `/add_account` | POST | Add new account and save session |
| `/get_feed` | POST | Fetch timeline for specified account |

## 🐛 Troubleshooting

### Common Issues

**"Could not connect to backend server"**
- Ensure the Flask server is running (`python app.py`)
- Check that port 5000 is not blocked by firewall

**"Session has expired"**
- Re-add the account through the extension popup
- X sessions may expire after period of inactivity

**"Login failed"**
- Verify your X credentials are correct
- Check if 2FA is enabled (may require app-specific password)

### Debug Mode

Enable debug logging by setting the logging level in `app.py`:

```python
logging.basicConfig(level=logging.DEBUG)
```

## 🤝 Contributing

We welcome contributions! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## ⚠️ Disclaimer

This extension is for educational and personal use only. Please respect X's Terms of Service and rate limits. The developers are not responsible for any account restrictions or violations.

## 🙏 Acknowledgments

- [Twikit](https://github.com/d60/twikit) - Excellent Python library for X API interactions
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS framework
- [Flask](https://flask.palletsprojects.com/) - Lightweight WSGI web framework

---

<div align="center">

**Made with ❤️ for the X community**

</div>
