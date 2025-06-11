// Service Worker for X Feed Viewer Extension
class XFeedService {
    constructor() {
        this.setupMessageListener();
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
            if (req.type === "fetchFeed") {
                this.fetchFeedWithFallback(req.tokens, req.user)
                    .then(result => sendResponse(result))
                    .catch(err => {
                        console.error('Feed fetch error:', err);
                        sendResponse({ 
                            error: err.message, 
                            fallbackUsed: true,
                            timestamp: Date.now()
                        });
                    });
                return true; // Keep message channel open for async response
            }
        });
    }

    async fetchFeedWithFallback(tokens, username) {
        const settings = await this.getSettings();
        
        const endpoints = [
            {
                name: 'GraphQL HomeLatestTimeline',
                url: 'https://x.com/i/api/graphql/FajYmz6g5hHZKGfYs9Q4jw/HomeLatestTimeline',
                method: 'graphql_home',
                priority: 1
            },
            {
                name: 'GraphQL PinnedTimelines',
                url: 'https://x.com/i/api/graphql/EcFJds-x7KzYsyTH7uRveA/PinnedTimelines',
                method: 'graphql_pinned',
                priority: 2
            },
            {
                name: 'REST v1.1 Home Timeline',
                url: 'https://api.x.com/1.1/statuses/home_timeline.json',
                method: 'rest_v1',
                priority: 3
            },
            {
                name: 'Account Settings Verification',
                url: 'https://api.x.com/1.1/account/settings.json',
                method: 'settings_check',
                priority: 4
            }
        ];

        let lastError = null;
        let fallbackUsed = false;

        // Sort by priority
        endpoints.sort((a, b) => a.priority - b.priority);

        for (let i = 0; i < endpoints.length; i++) {
            const endpoint = endpoints[i];
            
            try {
                console.log(`Attempting endpoint: ${endpoint.name}`);
                
                let result;
                switch (endpoint.method) {
                    case 'graphql_home':
                        result = await this.fetchGraphQLHomeTimeline(endpoint.url, tokens, settings);
                        break;
                    case 'graphql_pinned':
                        result = await this.fetchGraphQLPinnedTimelines(endpoint.url, tokens, settings);
                        break;
                    case 'rest_v1':
                        result = await this.fetchRESTHomeTimeline(endpoint.url, tokens, settings);
                        break;
                    case 'settings_check':
                        result = await this.verifyAccountAccess(endpoint.url, tokens, settings);
                        break;
                }

                if (result && (result.data || result.verified)) {
                    // Cache successful result
                    await this.cacheResult(username, result, endpoint.name);
                    
                    return {
                        feed: result.data || result,
                        endpointUsed: endpoint.name,
                        fallbackUsed: i > 0,
                        accountVerified: result.verified || false,
                        timestamp: Date.now()
                    };
                }
            } catch (error) {
                console.error(`${endpoint.name} failed:`, error);
                lastError = error;
                fallbackUsed = true;
                
                // Wait before trying next endpoint
                if (i < endpoints.length - 1) {
                    await this.delay(1000);
                }
            }
        }

        // Try to return cached data if all endpoints fail
        const cachedData = await this.getCachedResult(username);
        if (cachedData) {
            return {
                feed: cachedData.result.data,
                endpointUsed: cachedData.endpoint + ' (cached)',
                fallbackUsed: true,
                fromCache: true,
                timestamp: cachedData.timestamp
            };
        }

        throw new Error(`All endpoints failed. Last error: ${lastError?.message || 'Unknown error'}`);
    }

    async fetchGraphQLHomeTimeline(url, tokens, settings) {
        const variables = {
            count: settings.tweetsPerLoad || 20,
            includePromotedContent: true,
            latestControlAvailable: true,
            requestContext: "launch",
            seenTweetIds: []
        };

        const features = {
            profile_label_improvements_pcf_label_in_post_enabled: true,
            rweb_tipjar_consumption_enabled: true,
            verified_phone_label_enabled: true,
            responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
            responsive_web_graphql_timeline_navigation_enabled: true,
            responsive_web_graphql_exclude_directive_enabled: true,
            creator_subscriptions_tweet_preview_api_enabled: true,
            tweetypie_unmention_optimization_enabled: true,
            responsive_web_edit_tweet_api_enabled: true,
            view_counts_everywhere_api_enabled: true,
            longform_notetweets_consumption_enabled: true,
            tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
            rweb_video_timestamps_enabled: true,
            longform_notetweets_rich_text_read_enabled: true,
            longform_notetweets_inline_media_enabled: true,
            responsive_web_media_download_video_enabled: false,
            responsive_web_enhance_cards_enabled: false
        };

        const params = new URLSearchParams({
            variables: JSON.stringify(variables),
            features: JSON.stringify(features)
        });

        const response = await this.fetchWithTimeout(`${url}?${params}`, {
            method: "GET",
            headers: this.buildHeaders(tokens)
        }, settings.apiTimeout);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        
        if (data.errors) {
            throw new Error(`GraphQL Error: ${data.errors[0].message}`);
        }

        return {
            data: data.data?.home?.home_timeline_urt || data
        };
    }

    async fetchGraphQLPinnedTimelines(url, tokens, settings) {
        const variables = {};
        
        const features = {
            profile_label_improvements_pcf_label_in_post_enabled: true,
            rweb_tipjar_consumption_enabled: true,
            verified_phone_label_enabled: true,
            responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
            responsive_web_graphql_timeline_navigation_enabled: true
        };

        const params = new URLSearchParams({
            variables: JSON.stringify(variables),
            features: JSON.stringify(features)
        });

        const response = await this.fetchWithTimeout(`${url}?${params}`, {
            method: "GET",
            headers: this.buildHeaders(tokens)
        }, settings.apiTimeout);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        
        if (data.errors) {
            throw new Error(`GraphQL Error: ${data.errors[0].message}`);
        }

        return {
            data: data.data || data
        };
    }

    async fetchRESTHomeTimeline(url, tokens, settings) {
        const params = new URLSearchParams({
            count: settings.tweetsPerLoad || 20,
            include_entities: true,
            include_ext_edit_control: true,
            tweet_mode: 'extended',
            exclude_replies: false,
            trim_user: false
        });

        const response = await this.fetchWithTimeout(`${url}?${params}`, {
            method: "GET",
            headers: this.buildHeaders(tokens)
        }, settings.apiTimeout);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const tweets = await response.json();
        
        return {
            data: this.convertRESTToGraphQLFormat(tweets)
        };
    }

    async verifyAccountAccess(url, tokens, settings) {
        const params = new URLSearchParams({
            include_ext_sharing_audiospaces_listening_data_with_followers: true,
            include_mention_filter: true,
            include_nsfw_user_flag: true,
            include_nsfw_admin_flag: true,
            include_ranked_timeline: true,
            include_alt_text_compose: true,
            ext: 'ssoConnections',
            include_country_code: true,
            include_ext_dm_nsfw_media_filter: true
        });

        const response = await this.fetchWithTimeout(`${url}?${params}`, {
            method: "GET",
            headers: this.buildHeaders(tokens)
        }, settings.apiTimeout);

        if (!response.ok) {
            throw new Error(`Account verification failed: HTTP ${response.status}`);
        }

        const accountData = await response.json();
        
        return {
            verified: true,
            accountData: accountData,
            data: null
        };
    }

    buildHeaders(tokens) {
        return {
            "authorization": tokens.bearer,
            "x-csrf-token": tokens.ct0,
            "cookie": `auth_token=${tokens.auth_token}; ct0=${tokens.ct0}`,
            "x-twitter-active-user": "yes",
            "x-twitter-auth-type": "OAuth2Session",
            "x-twitter-client-language": "en",
            "content-type": "application/json",
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "x-twitter-client-version": "Twitter-TweetDeck-blackbird-chrome/4.0.220630115210 web/",
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
            "referer": "https://x.com/home",
            "origin": "https://x.com"
        };
    }

    async fetchWithTimeout(url, options, timeout) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            return response;
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('Request timeout');
            }
            throw error;
        }
    }

    convertRESTToGraphQLFormat(tweets) {
        return {
            globalObjects: {
                tweets: tweets.reduce((acc, tweet) => {
                    acc[tweet.id_str] = tweet;
                    return acc;
                }, {}),
                users: tweets.reduce((acc, tweet) => {
                    acc[tweet.user.id_str] = tweet.user;
                    return acc;
                }, {})
            },
            timeline: {
                instructions: [{
                    addEntries: {
                        entries: tweets.map(tweet => ({
                            entryId: `tweet-${tweet.id_str}`,
                            content: {
                                item: {
                                    content: {
                                        tweet: { id: tweet.id_str }
                                    }
                                }
                            }
                        }))
                    }
                }]
            }
        };
    }

    async getSettings() {
        return new Promise(resolve => {
            chrome.storage.sync.get({
                apiTimeout: 10000,
                maxRetries: 3,
                fallbackEnabled: true,
                tweetsPerLoad: 20,
                autoRefresh: 0
            }, resolve);
        });
    }

    async cacheResult(username, result, endpoint) {
        const cacheKey = `feedCache_${username}`;
        const cacheData = {
            result,
            endpoint,
            timestamp: Date.now()
        };
        
        try {
            await chrome.storage.local.set({ [cacheKey]: cacheData });
        } catch (error) {
            console.warn('Failed to cache result:', error);
        }
    }

    async getCachedResult(username) {
        const cacheKey = `feedCache_${username}`;
        
        return new Promise(resolve => {
            chrome.storage.local.get(cacheKey, (data) => {
                const cached = data[cacheKey];
                if (cached) {
                    // Check if cache is less than 5 minutes old
                    const fiveMinutes = 5 * 60 * 1000;
                    if (Date.now() - cached.timestamp < fiveMinutes) {
                        resolve(cached);
                        return;
                    }
                }
                resolve(null);
            });
        });
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Initialize the service
new XFeedService();
