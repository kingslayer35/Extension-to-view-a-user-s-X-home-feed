import os
import json
from pathlib import Path
from flask import Flask, request, jsonify
from flask_cors import CORS
from twikit import Client
from twikit.errors import Unauthorized

# --- Configuration ---
app = Flask(__name__)
CORS(app)

Path("sessions").mkdir(exist_ok=True)
SESSION_DIR = Path("sessions")

# --- API Endpoints ---

@app.route('/add_account', methods=['POST'])
def add_account():
    data = request.get_json()
    account_name = data.get('account_name')
    username = data.get('username')
    password = data.get('password')
    email = data.get('email')

    if not all([account_name, username, password, email]):
        return jsonify({"error": "Missing required fields.", "details": "All fields are required."}), 400

    try:
        client = Client('en-US')
        client.login(
            auth_info_1=username,
            auth_info_2=email,
            password=password
        )

        # --- CRITICAL FIX 1: Verify that login was successful ---
        # After login, get the cookies and check if they are valid.
        cookies = client.get_cookies()
        if not cookies or 'auth_token' not in cookies:
            # If cookies are empty or auth_token is missing, the login failed silently.
            return jsonify({
                "error": "Login Failed Silently",
                "details": "X.com likely presented a security challenge (like a CAPTCHA) that could not be handled. The login did not complete successfully."
            }), 500
        # ---------------------------------------------------------

        # If we get here, login was successful. Save the valid cookies.
        session_file = SESSION_DIR / f"{account_name}.json"
        with open(session_file, 'w') as f:
            json.dump(cookies, f)

        return jsonify({"message": f"Successfully logged in and saved session for '{account_name}'."}), 200

    except Exception as e:
        return jsonify({"error": "An unexpected server error occurred during login.", "details": str(e)}), 500

@app.route('/list_accounts', methods=['GET'])
def list_accounts():
    accounts = [f.stem for f in SESSION_DIR.glob("*.json")]
    return jsonify(accounts)

@app.route('/get_feed', methods=['POST'])
def get_feed():
    data = request.get_json()
    account_name = data.get('account_name')

    session_file = SESSION_DIR / f"{account_name}.json"
    if not session_file.exists():
        return jsonify({"error": "Session not found.", "details": f"No saved session for account '{account_name}'."}), 404

    try:
        with open(session_file, 'r') as f:
            cookies = json.load(f)
        
        # Check if the loaded cookie file is empty
        if not cookies:
             return jsonify({
                "error": "Invalid Session File",
                "details": "The saved session file is empty. Please add the account again to create a valid session."
            }), 400

        client = Client('en-US')
        client.set_cookies(cookies)

        # --- CRITICAL FIX 2: Use the correct method name ---
        # The correct method is 'get_home_timeline()'.
        timeline = client.get_home_timeline(count=40)
        # -----------------------------------------------------

        formatted_tweets = []
        for tweet in timeline:
            formatted_tweets.append({
                "text": tweet.text,
                "user": {
                    "name": tweet.user.name,
                    "screen_name": tweet.user.screen_name,
                    "profile_image_url_https": tweet.user.profile_image_url_https
                }
            })
        
        return jsonify(formatted_tweets)

    except Unauthorized:
        return jsonify({
            "error": "Session Expired",
            "details": "The saved session is no longer valid. Please add the account again to refresh it."
        }), 401
        
    except Exception as e:
        return jsonify({"error": "Failed to fetch timeline.", "details": str(e)}), 500

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000, debug=True)
