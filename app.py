import os
import json
import logging
import traceback
from pathlib import Path
from flask import Flask, jsonify, request
from flask_cors import CORS
from twikit import Client
from twikit.errors import Unauthorized
import asyncio
from firebase_admin import credentials, firestore
import firebase_admin

# --- Setup ---
app = Flask(__name__)
CORS(app)
logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s: %(message)s')

# --- Firebase Initialization ---
try:
    cred = credentials.Certificate('serviceAccountKey.json')
    firebase_admin.initialize_app(cred)
    db = firestore.client()
    app.logger.info("Firebase initialized successfully.")
except Exception as e:
    app.logger.error(f"Error initializing Firebase: {traceback.format_exc()}")
    raise SystemExit("Firebase initialization failed.")

@app.route('/get-accounts', methods=['GET'])
def get_accounts():
    try:
        # Get all document IDs from the 'sessions' collection in Firestore
        docs = db.collection('sessions').stream()
        accounts = [doc.id for doc in docs]
        return jsonify(accounts)
    except Exception as e:
        app.logger.error(f"Error retrieving accounts from Firestore: {traceback.format_exc()}")
        return jsonify({"error": "Could not retrieve accounts from database.", "details": str(e)}), 500

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

        async def login_and_get_cookies():
            await client.login(auth_info_1=username, auth_info_2=email, password=password)
            return client.get_cookies()

        cookies = asyncio.run(login_and_get_cookies())

        # Save cookies to Firestore
        doc_ref = db.collection('sessions').document(account_name)
        doc_ref.set(cookies)

        app.logger.info(f"Successfully saved session for {account_name} in Firestore.")
        return jsonify({"success": True, "message": f"Successfully saved session for '{account_name}'."})

    except Unauthorized:
        app.logger.warning(f"Login failed (Unauthorized) for account: {account_name}")
        return jsonify({"error": "Login failed. Please check your credentials."}), 401
    except Exception as e:
        app.logger.error(f"An unexpected error occurred during login for {account_name}:\n{traceback.format_exc()}")
        return jsonify({"error": "An unexpected error occurred during login.", "details": str(e)}), 500

@app.route('/get_feed', methods=['POST'])
def get_feed():
    data = request.get_json()
    account_name = data.get('account_name')
    if not account_name:
        return jsonify({"error": "Account name not provided."}), 400

    try:
        # Retrieve cookies from Firestore
        doc_ref = db.collection('sessions').document(account_name)
        doc = doc_ref.get()

        if not doc.exists:
            return jsonify({"error": f"Session for '{account_name}' not found in database."}), 404

        cookies = doc.to_dict()

        if not cookies:
            return jsonify({"error": "Session data is empty or invalid in database."}), 400

        async def get_timeline_async(loaded_cookies):
            client = Client('en-US')
            client.set_cookies(loaded_cookies)
            return await client.get_timeline(count=100)

        timeline = asyncio.run(get_timeline_async(cookies))

        formatted_tweets = []
        for tweet in timeline:
            media_list = []
            if hasattr(tweet, 'media') and tweet.media:
                for media_item in tweet.media:
                    media_info = {'type': getattr(media_item, 'type', None)}
                    if media_info['type'] == 'photo':
                        url = getattr(media_item, 'media_url', None)
                    elif media_info['type'] in ['video', 'animated_gif'] and hasattr(media_item, 'video_info'):
                        variants = media_item.video_info.get('variants', [])
                        best_variant = max([v for v in variants if v.get('bitrate') is not None], key=lambda v: v.get('bitrate', 0), default=None)
                        url = best_variant.get('url') if best_variant else None
                    else:
                        url = None
                    if url:
                        media_info['url'] = url
                        media_list.append(media_info)

            user_data = getattr(tweet, 'user', None)
            user_info = {
                "name": "Unknown User",
                "screen_name": "unknown",
                "profile_image_url_https": "",
                "is_verified": False
            }
            if user_data:
                user_info = {
                    "name": getattr(user_data, 'name', 'Unknown User'),
                    "screen_name": getattr(user_data, 'screen_name', 'unknown'),
                    "profile_image_url_https": getattr(user_data, 'profile_image_url', ''),
                    "is_verified": getattr(user_data, 'is_blue_verified', False)
                }

            formatted_tweets.append({
                "id": tweet.id,
                "text": getattr(tweet, 'text', ''),
                "created_at": getattr(tweet, 'created_at', None),
                "user": user_info,
                "stats": {
                    "likes": getattr(tweet, 'favorite_count', 0),
                    "retweets": getattr(tweet, 'retweet_count', 0),
                    "views": getattr(tweet, 'view_count', 0)
                },
                "media": media_list
            })
        return jsonify(formatted_tweets)

    except Unauthorized:
        app.logger.warning(f"Session expired or invalid for {account_name}. Deleting from Firestore.")
        db.collection('sessions').document(account_name).delete()
        return jsonify({"error": "Session has expired or is invalid. Please re-add the account."}), 401
    except Exception as e:
        app.logger.error(f"Error fetching feed for {account_name}:\n{traceback.format_exc()}")
        return jsonify({"error": "An unexpected error occurred while processing the feed.", "details": str(e)}), 500

# --- Run the Application ---
if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000, debug=True)
