import {
  useRef, useState, FormEvent, useEffect
 } from "react";

import {
  setDocAuthToken, getDocAuthToken,
} from "./Tools";

import App from "./App";

export default function () {
  const apiKeyInputRef = useRef<HTMLInputElement | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);

  const systemPromptInputRef = useRef<HTMLInputElement | null>(null);

  const handleSubmit = (eventIn: FormEvent<HTMLFormElement>) => {
    eventIn.preventDefault();

    const curInputText = apiKeyInputRef.current?.value;
    if (curInputText !== undefined && curInputText.trim()) {
      setApiKey(curInputText as string);
    }
  };

  const docClientIdInputRef = useRef<HTMLInputElement | null>(null);
  const generateDocAuthToken = () => {
    if (docClientIdInputRef.current !== null) {

      // If no token is found, construct the Google Auth URL and redirect the user
      const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authUrl.searchParams.append("client_id", docClientIdInputRef.current.value);
      authUrl.searchParams.append("redirect_uri", window.location.href.split("#")[0]);
      authUrl.searchParams.append("response_type", "token");
      authUrl.searchParams.append("scope", "https://www.googleapis.com/auth/documents");
      authUrl.searchParams.append("include_granted_scopes", "true");
      authUrl.searchParams.append("prompt", "select_account");

      window.location.href = authUrl.toString();
      return;
    }
  };

  // returns if an auth token was found
  const parseDocAuthToken: () => boolean = () => {
    // Trying to find already cached auth token
    if (getDocAuthToken().length > 0) {
      return true;
    }

    const storedToken = localStorage.getItem("google_access_token");
    const tokenExpiry = localStorage.getItem("google_token_expiry");

    if (storedToken && tokenExpiry && Date.now() < Number(tokenExpiry)) {
      setDocAuthToken(storedToken);
      return true;
    }

    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const accessToken = params.get("access_token");
    const expiresIn = params.get("expires_in");

    if (accessToken) {
      window.location.hash = "";
    
      // Cache the token and calculate absolute expiration timestamp
      localStorage.setItem("google_access_token", accessToken);
      if (expiresIn) {
        const expiryTime = Date.now() + Number(expiresIn) * 1000;
        localStorage.setItem("google_token_expiry", String(expiryTime));
      }

      setDocAuthToken(accessToken);
      return true;
    }
    return false;
  };

  const [hasDocAuthToken, setHasDocAuthToken] = useState<boolean>(false);
  useEffect(() => {
    setHasDocAuthToken(parseDocAuthToken());
  }, []);

  return (
    <div>
      {hasDocAuthToken && (<p>I HAVE FOUND AN AUTH TOKEN !!!</p>)}
      {apiKey === null && (
        <div>
          <input type="password" placeholder="Enter your Google API client id..." ref={docClientIdInputRef}/>
          <button onClick={generateDocAuthToken}>
            Generate auth token
          </button>

          <br/>
          <br/>

          <input type="text" placeholder="Type system prompt here..." ref={systemPromptInputRef} />

          <form onSubmit={handleSubmit}>
            <input type="password"
                   placeholder="Type OpenRouter API key here"
                   ref={apiKeyInputRef} />
            <button type="submit">
              Enter
            </button>
          </form>
        </div>
      )}
      {apiKey !== null && (
        <App apiKey={apiKey} systemPrompt={systemPromptInputRef.current?.value ?? ""} />
      )}
    </div>
  );
}
