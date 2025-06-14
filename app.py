# This is the complete and final version of app.py. No functions have been skipped.
import os
import json
from pathlib import Path
from flask import Flask, request, jsonify, Response
from flask_cors import CORS
from twikit import Client
from twikit.errors import Unauthorized
import asyncio
import requests

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
                    "details": "X.com likely presented a security challenge that could not be handled."
                }), 500
            message = f"Successfully logged in and saved session for '{account_name}' using username/password."

        else:
            return jsonify({
                "error": "Missing login credentials",
                "details": "Please provide either username/email/password OR valid cookies for login."
            }), 400

        session_file = SESSION_DIR / f"{account_name}.json"
        with open(session_file, 'w') as f:
            json.dump(cookies_to_save, f)

        return jsonify({"message": message}), 200

    except Unauthorized as ue:
        error_details = str(ue)
        if '"code":366' in error_details:
             return jsonify({
                "error": "Login Blocked by X.com Security",
                "details": "This login was flagged as unusual. Please log in to X.com manually with a browser on this machine, then add the account using the new browser cookies instead of the username/password."
            }), 401
        if '"code":399' in error_details:
            return jsonify({
                "error": "Login Rejected by X.com",
                "details": "Login failed due to incorrect credentials or a security challenge. Please log in manually in a browser, then try adding the account again using the browser's cookies."
            }), 401
        
        return jsonify({ "error": "Authorization Failed", "details": error_details }), 401
    except Exception as e:
        return jsonify({"error": "An unexpected server error occurred during login.", "details": str(e)}), 500

@app.route('/list_accounts', methods=['GET'])
def list_accounts():
    accounts = [f.stem for f in SESSION_DIR.glob("*.json")]
    return jsonify(accounts)

@app.route('/proxy_image')
def proxy_image():
    url = request.args.get('url')
    if not url:
        return "Missing URL parameter", 400
    try:
        response = requests.get(url, stream=True, headers={'User-Agent': 'Mozilla/5.0'})
        return Response(response.iter_content(chunk_size=1024), content_type=response.headers['Content-Type'])
    except Exception as e:
        return str(e), 500

@app.route('/get_feed', methods=['POST'])
def get_feed():
    data = request.get_json()
    account_name = data.get('account_name')

    session_file = SESSION_DIR / f"{account_name}.json"
    if not session_file.exists():
        return jsonify({"error": "Session not found."}), 404

    try:
        with open(session_file, 'r') as f:
            cookies = json.load(f)
        
        if not cookies:
             return jsonify({"error": "Invalid Session File."}), 400
        
        async def get_timeline_async(loaded_cookies):
            client = Client('en-US')
            client.set_cookies(loaded_cookies)
            return await client.get_timeline(count=40)

        timeline = asyncio.run(get_timeline_async(cookies))

        formatted_tweets = []
        for tweet in timeline:
            media_list = []
            if tweet.media:
                for media_item in tweet.media:
                    media_info = {'type': media_item.type}
                    
                    if media_item.type == 'photo':
                        media_info['url'] = getattr(media_item, 'media_url_https', getattr(media_item, 'url', None))
                            
                    elif media_item.type in ['video', 'animated_gif']:
                        variants = getattr(media_item, 'video_info', {}).get('variants', [])
                        if variants:
                            best_variant = max(
                                [v for v in variants if v.get('bitrate')],
                                key=lambda v: v.get('bitrate', 0),
                                default=None
                            )
                            if best_variant:
                                media_info['url'] = best_variant.get('url')
                    
                    if media_info.get('url'):
                        media_list.append(media_info)
            
            formatted_tweets.append({
                "id": tweet.id,
                "text": tweet.text,
                "created_at": tweet.created_at,
                "user": {
                    "name": tweet.user.name,
                    "screen_name": tweet.user.screen_name,
                    "profile_image_url_https": tweet.user.profile_image_url,
                    "is_verified": getattr(tweet.user, 'is_blue_verified', False)
                },
                "stats": {
                    "likes": tweet.favorite_count,
                    "retweets": tweet.retweet_count,
                    "views": tweet.view_count
                },
                "media": media_list
            })
        
        return jsonify(formatted_tweets)

    except Unauthorized:
        return jsonify({"error": "Session Expired"}), 401
    except Exception as e:
        return jsonify({"error": "Failed to fetch timeline.", "details": str(e)}), 500

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000, debug=True)