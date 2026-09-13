# Purpose
 - Openrouter model based hardcoded local tool calling demonstration
    - Persistent Chat history storage via SQLite
    - Multiple Chats
    - Has a "current directory" for each Chat
       - Can be changed to **any directory path** (even root directory)
 - Tools:
    - List files in/relative to current directory
    - Read a file relative to current directory
    - GREP a regex relative to current directory
 - Other behavioral notes:
    - All responses will be written to disk in the SQLite DB (both directly from the Openrouter LLM + the tool calling results)
       - **Large tool call response dumps will be instantly written**

# Required API keys/credentials
 - OpenRouter API key

# How to run
 - `npm install`
 - `npm run dev`
 - On a browser, go to `http://localhost:3000`
