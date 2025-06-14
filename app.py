import os
import json
from pathlib import Path
from flask import Flask, request, jsonify
from flask_cors import CORS
from twikit import Client
from twikit.errors import Unauthorized
import asyncio

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

    input_cookies = data.get('cookies')

    if not account_name:
        return jsonify({"error": "Missing required field.", "details": "Account Name is required."}), 400

    try:
        client = Client('en-US')
        
        if input_cookies:
            async def set_cookies_and_verify():
                client.set_cookies(input_cookies)
                try:
                    await client.get_timeline(count=1) 
                    return input_cookies
                except Unauthorized:
                    raise Unauthorized("Provided cookies are invalid or expired.")
                except Exception as e:
                    raise Exception(f"Failed to verify cookies: {str(e)}")

            cookies_to_save = asyncio.run(set_cookies_and_verify())
            message = f"Successfully saved session for '{account_name}' using provided cookies."

        elif all([username, password, email]):
            async def login_and_get_cookies():
                await client.login(
                    auth_info_1=username,
                    auth_info_2=email,
                    password=password
                )
                return client.get_cookies()

            cookies_to_save = asyncio.run(login_and_get_cookies())
            
            if not cookies_to_save or 'auth_token' not in cookies_to_save:
                return jsonify({
                    "error": "Login Failed Silently",
                    "details": "X.com likely presented a security challenge (like a CAPTCHA) that could not be handled. The login did not complete successfully."
                }), 500
            message = f"Successfully logged in and saved session for '{account_name}' using username/password."

        else:
            return jsonify({
                "error": "Missing login credentials",
                "details": "Please provide either username/email/password OR auth_token/ct0 (and ideally others) for login."
            }), 400

        session_file = SESSION_DIR / f"{account_name}.json"
        with open(session_file, 'w') as f:
            json.dump(cookies_to_save, f)

        return jsonify({"message": message}), 200

    except Unauthorized as ue:
        return jsonify({
            "error": "Authorization Failed",
            "details": str(ue) + ". Please ensure cookies are correct or credentials are valid."
        }), 401
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
        
        if not cookies:
             return jsonify({
                "error": "Invalid Session File",
                "details": "The saved session file is empty. Please add the account again to create a valid session."
            }), 400
        
        async def get_timeline_async(loaded_cookies):
            client = Client('en-US')
            client.set_cookies(loaded_cookies)
            return await client.get_timeline(count=40)

        timeline = asyncio.run(get_timeline_async(cookies))

        formatted_tweets = []
        for tweet in timeline:
            media_urls = [media.media_url_https for media in tweet.media if hasattr(media, 'media_url_https')]
            
            formatted_tweets.append({
                "id": tweet.id,
                "text": tweet.text,
                "created_at": tweet.created_at,
                "user": {
                    "name": tweet.user.name,
                    "screen_name": tweet.user.screen_name,
                    "profile_image_url_https": tweet.user.profile_image_url
                },
                "stats": {
                    "likes": tweet.favorite_count,
                    "retweets": tweet.retweet_count,
                    # CORRECTED: Changed the attribute to match the twikit Tweet object
                    "views": tweet.view_count
                },
                "media_urls": media_urls
            })
        
        return jsonify(formatted_tweets)

    except Unauthorized:
        return jsonify({
            "error": "Session Expired",
            "details": "The saved session is no longer valid. Please add the account again to refresh it (either by logging in or providing fresh cookies)."
        }), 401
        
    except Exception as e:
        return jsonify({"error": "Failed to fetch timeline.", "details": str(e)}), 500

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000, debug=True)
