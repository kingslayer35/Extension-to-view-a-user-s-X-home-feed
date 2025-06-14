import os
import json
import logging
import traceback
from pathlib import Path
from flask import Flask, jsonify, request
from flask_cors import CORS
from twikit import Client
from twikit.errors import Unauthorized
import asyncio # Import asyncio

# --- Setup ---
app = Flask(__name__)
CORS(app)
logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s: %(message)s')

SESSION_DIR = Path('sessions')
SESSION_DIR.mkdir(exist_ok=True)

@app.route('/get-accounts', methods=['GET'])
def get_accounts():
    try:
        accounts = [f.stem for f in SESSION_DIR.glob('*.json')]
        return jsonify(accounts)
    except Exception as e:
        app.logger.error(f"Error reading session directory: {traceback.format_exc()}")
        return jsonify({"error": "Could not read session directory.", "details": str(e)}), 500

@app.route('/add_account', methods=['POST'])
def add_account():
    data = request.get_json()
    account_name = data.get('account_name')
    username = data.get('username')
    email = data.get('email')
    password = data.get('password')

    if not all([account_name, password, (username or email)]):
        return jsonify({"error": "Account Name, Password, and either Username or Email are required."}), 400

    try:
        app.logger.info(f"Attempting login for account: {account_name}")
        client = Client('en-US')
        
        async def login_and_get_cookies(): # Define an async function for login
            await client.login(auth_info_1=username, auth_info_2=email, password=password)
            return client.get_cookies()

        cookies = asyncio.run(login_and_get_cookies()) # Await the login
        
        session_file = SESSION_DIR / f"{account_name}.json"
        
        with open(session_file, 'w') as f:
            json.dump(cookies, f, indent=2) # Using indent makes the file human-readable

        app.logger.info(f"Successfully saved session for {account_name}")
        return jsonify({"success": True, "message": f"Successfully saved session for '{account_name}'."})

    except Unauthorized:
        app.logger.warning(f"Login failed (Unauthorized) for account: {account_name}")
        return jsonify({"error": "Login failed. Please check your credentials."}), 401
    except Exception as e:
        app.logger.error(f"An unexpected error occurred during login for {account_name}:\n{traceback.format_exc()}")
        return jsonify({"error": "An unexpected error occurred during login."}), 500

@app.route('/get_feed', methods=['POST'])
def get_feed():
    data = request.get_json()
    account_name = data.get('account_name')
    if not account_name:
        return jsonify({"error": "Account name not provided."}), 400

    session_file = SESSION_DIR / f"{account_name}.json"
    if not session_file.exists():
        return jsonify({"error": f"Session for '{account_name}' not found."}), 404

    try:
        with open(session_file, 'r') as f:
            cookies = json.load(f)

        if not cookies:
            return jsonify({"error": "Session file is empty or invalid."}), 400

        async def get_timeline_async(loaded_cookies):
            client = Client('en-US')
            client.set_cookies(loaded_cookies)
            # Await the asynchronous get_timeline call
            return await client.get_timeline(count=40) # Increased count for more data

        # Use asyncio.run to execute the async function
        timeline = asyncio.run(get_timeline_async(cookies))

        formatted_tweets = []
        for tweet in timeline:
            media_list = []
            if hasattr(tweet, 'media') and tweet.media:
                for media_item in tweet.media:
                    media_info = {'type': getattr(media_item, 'type', None)}
                    url = getattr(media_item, 'media_url_https', None)
                    if media_info['type'] in ['video', 'animated_gif'] and hasattr(media_item, 'video_info'):
                        variants = media_item.video_info.get('variants', [])
                        if variants:
                            best_variant = max([v for v in variants if v.get('bitrate') is not None], key=lambda v: v.get('bitrate', 0), default=None)
                            if best_variant: url = best_variant.get('url')
                    if url: media_info['url'] = url; media_list.append(media_info)
            user_data = getattr(tweet, 'user', None)
            user_info = {"name": "Unknown User", "screen_name": "unknown", "profile_image_url_https": "", "is_verified": False}
            if user_data:
                user_info = {"name": getattr(user_data, 'name', 'Unknown User'), "screen_name": getattr(user_data, 'screen_name', 'unknown'), "profile_image_url_https": getattr(user_data, 'profile_image_url', ''), "is_verified": getattr(user_data, 'is_blue_verified', False)}
            formatted_tweets.append({"id": tweet.id, "text": getattr(tweet, 'text', ''), "created_at": getattr(tweet, 'created_at', None), "user": user_info, "stats": {"likes": getattr(tweet, 'favorite_count', 0), "retweets": getattr(tweet, 'retweet_count', 0), "views": getattr(tweet, 'view_count', 0)}, "media": media_list})
        return jsonify(formatted_tweets)
    except Unauthorized:
        app.logger.warning(f"Session expired for {account_name}")
        return jsonify({"error": "Session has expired or is invalid."}), 401
    except Exception as e:
        app.logger.error(f"Error fetching feed for {account_name}:\n{traceback.format_exc()}")
        return jsonify({"error": "An unexpected error occurred while processing the feed.", "details": str(e)}), 500

# --- Run the Application ---
if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000, debug=True)