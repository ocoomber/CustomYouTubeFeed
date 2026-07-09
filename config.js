// Fill these in with your own values from Google Cloud Console.
// See SETUP.md for exact steps.

const CONFIG = {
  CLIENT_ID: "PASTE_YOUR_OAUTH_CLIENT_ID_HERE.apps.googleusercontent.com",
  API_KEY: "PASTE_YOUR_API_KEY_HERE",

  // How many recent uploads to pull per channel before merging & sorting.
  // Higher = more complete but uses more of your daily quota.
  VIDEOS_PER_CHANNEL: 5,

  // Skip anything this many seconds or shorter (filters out Shorts).
  SHORTS_MAX_SECONDS: 60
};
