# Purpose
 - Openrouter model based hardcoded tool calling demonstration
 - Tools:
    - `public/foobar.txt` reader
    - UI user submitted Google document URLs reader
    - Google document header parser
    - Google document header content reader
    - "Bank statements" reader
       - Actually a random number generator
 - Other behavioral notes:
    - Every AI model response is screened using `public/hmm.txt`
       - If any string in that newline delimited file is found in the AI model response:
          - The response is rejected and the AI model is prompted for a new one, with the knowledge that whatever string triggered the rejection was present
 - Doesn't do anything besides consume text and display text

# Required API keys/credentials
 - OpenRouter API key
 - Google Cloud OAuth client ID (for Google account authentication token generation)
    - This client ID must have access to Google Docs API for the account you intend to access the Google Doc links with
    - An easy way is to make a new Google Cloud project, copy its produced client ID, and add your account as a Test User

# How to run
 - `npm install`
 - `npm run build`
 - `npm run preview`
 - On a browser, go to `http://localhost:4173`
