import asyncio
import json
import os
import time
import random
import requests
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS
from twikit import Client
import logging

app = Flask(__name__)
CORS(app)

# Store client instances for different users
clients = {}

class TweetData:
    def __init__(self, tweet):
        self.id = tweet.id
        self.text = tweet.text
        self.user_name = tweet.user.name
        self.user_screen_name = tweet.user.screen_name
        self.user_profile_image = tweet.user.profile_image_url
        self.created_at = tweet.created_at
        self.retweet_count = tweet.retweet_count
        self.favorite_count = tweet.favorite_count
        self.media = getattr(tweet, 'media', [])

async def create_client(username, email, password, session_id):
    """Create and login a new client using v2.3.1+ features"""
    try:
        client = Client(language='en-US')
        
        print(f"Attempting login for username: {username}")
        
        cookies_file = f'cookies_{session_id}.json'
        
        # Use the new cookies_file parameter from v2.3.0+
        await client.login(
            auth_info_1=username,
            auth_info_2=email,
            password=password,
            cookies_file=cookies_file,
            enable_ui_metrics=True  # Reduces risk of account suspension (v2.3.0+)
        )
        
        print("Login successful with new v2.3.1+ method")
        clients[session_id] = client
        return True
        
    except Exception as e:
        print(f"Login failed: {type(e).__name__}: {str(e)}")
        logging.error(f"Login failed: {e}")
        return False


@app.route('/login', methods=['POST'])
def login():
    """Handle user login"""
    data = request.json
    username = data.get('username')
    email = data.get('email')
    password = data.get('password')
    session_id = data.get('session_id')
    
    if not all([username, password, session_id]):
        return jsonify({'success': False, 'error': 'Missing required fields'})
    
    try:
        success = asyncio.run(create_client(username, email, password, session_id))
        if success:
            return jsonify({'success': True})
        else:
            return jsonify({'success': False, 'error': 'Login failed'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/get_home_timeline', methods=['POST'])
def get_home_timeline():
    """Get home timeline using documented Twikit methods"""
    data = request.json
    session_id = data.get('session_id')
    count = data.get('count', 20)
    
    if session_id not in clients:
        return jsonify({'success': False, 'error': 'Not logged in'})
    
    try:
        client = clients[session_id]
        
        # Add rate limiting delay
        time.sleep(random.uniform(1, 3))
        
        # According to Twikit docs, use search_tweet for timeline-like functionality
        # or get user tweets from the authenticated user
        tweets = None
        
        try:
            # Method 1: Get authenticated user's timeline via search
            # This simulates a home timeline by searching recent tweets
            tweets = asyncio.run(client.search_tweet('', 'Latest', count=count))
            print("Got tweets using search_tweet method")
        except Exception as e:
            print(f"search_tweet failed: {e}")
            
            try:
                # Method 2: Get the authenticated user's own tweets
                me = asyncio.run(client.get_me())
                tweets = asyncio.run(client.get_user_tweets(me.id, 'Tweets', count=count))
                print("Got user's own tweets")
            except Exception as e:
                print(f"get_user_tweets failed: {e}")
                return jsonify({'success': False, 'error': f'All methods failed: {e}'})
        
        if not tweets:
            return jsonify({'success': False, 'error': 'No tweets retrieved'})
        
        # Parse tweets using documented Tweet object attributes
        tweet_data = []
        for tweet in tweets:
            try:
                # Use documented Tweet attributes from Twikit 2.3.3
                tweet_info = {
                    'id': tweet.id,
                    'text': tweet.text,
                    'user_name': tweet.user.name,
                    'user_screen_name': tweet.user.screen_name,
                    'user_profile_image': tweet.user.profile_image_url,
                    'created_at': str(tweet.created_at),
                    'retweet_count': tweet.retweet_count,
                    'favorite_count': tweet.favorite_count,
                    'bookmark_count': getattr(tweet, 'bookmark_count', 0),  # New in v2.2.2
                    'media': []
                }
                
                # Handle media using new v2.3.0 media classes
                if hasattr(tweet, 'media') and tweet.media:
                    for media in tweet.media:
                        # v2.3.0+ returns Photo, AnimatedGif, Video instances
                        if hasattr(media, 'media_url_https'):
                            tweet_info['media'].append(media.media_url_https)
                        elif hasattr(media, 'url'):
                            tweet_info['media'].append(media.url)
                
                tweet_data.append(tweet_info)
                
            except Exception as e:
                print(f"Error parsing tweet: {e}")
                continue
        
        return jsonify({'success': True, 'tweets': tweet_data})
        
    except Exception as e:
        print(f"Timeline Error: {e}")
        return jsonify({'success': False, 'error': str(e)})



def parse_graphql_timeline(data):
    """Parse GraphQL timeline response into tweet objects"""
    tweets = []
    
    try:
        instructions = data.get('data', {}).get('home', {}).get('home_timeline_urt', {}).get('instructions', [])
        
        for instruction in instructions:
            if instruction.get('type') == 'TimelineAddEntries':
                entries = instruction.get('entries', [])
                
                for entry in entries:
                    if entry.get('entryId', '').startswith('tweet-'):
                        content = entry.get('content', {})
                        if content.get('entryType') == 'TimelineTimelineItem':
                            item_content = content.get('itemContent', {})
                            tweet_results = item_content.get('tweet_results', {})
                            
                            if 'result' in tweet_results:
                                tweet = tweet_results['result']
                                parsed_tweet = parse_tweet_object(tweet)
                                if parsed_tweet:
                                    tweets.append(parsed_tweet)
    
    except Exception as e:
        print(f"Error parsing timeline: {e}")
    
    return tweets

def parse_tweet_object(tweet):
    """Parse individual tweet object from GraphQL response"""
    try:
        legacy = tweet.get('legacy', {})
        user_result = tweet.get('core', {}).get('user_results', {}).get('result', {})
        user_legacy = user_result.get('legacy', {})
        
        return {
            'id': legacy.get('id_str', ''),
            'text': legacy.get('full_text', ''),
            'user_name': user_legacy.get('name', ''),
            'user_screen_name': user_legacy.get('screen_name', ''),
            'user_profile_image': user_legacy.get('profile_image_url_https', ''),
            'created_at': legacy.get('created_at', ''),
            'retweet_count': legacy.get('retweet_count', 0),
            'favorite_count': legacy.get('favorite_count', 0),
            'media': extract_media_from_tweet(legacy)
        }
    except Exception as e:
        print(f"Error parsing tweet: {e}")
        return None

def extract_media_from_tweet(legacy):
    """Extract media URLs from tweet legacy data"""
    media_urls = []
    
    try:
        entities = legacy.get('entities', {})
        media = entities.get('media', [])
        
        for media_item in media:
            if media_item.get('media_url_https'):
                media_urls.append(media_item['media_url_https'])
        
        # Also check extended_entities
        extended_entities = legacy.get('extended_entities', {})
        extended_media = extended_entities.get('media', [])
        
        for media_item in extended_media:
            if media_item.get('media_url_https'):
                media_urls.append(media_item['media_url_https'])
    
    except Exception as e:
        print(f"Error extracting media: {e}")
    
    return media_urls

@app.route('/logout', methods=['POST'])
def logout():
    """Logout user and cleanup"""
    data = request.json
    session_id = data.get('session_id')
    
    if session_id in clients:
        del clients[session_id]
        # Optionally remove cookies file
        cookies_file = f'cookies_{session_id}.json'
        if os.path.exists(cookies_file):
            os.remove(cookies_file)
    
    return jsonify({'success': True})

@app.route('/health', methods=['GET'])
def health_check():
    """Simple health check endpoint"""
    return jsonify({'status': 'ok', 'message': 'Server is running'})

if __name__ == '__main__':
    app.run(host='localhost', port=5000, debug=True)
