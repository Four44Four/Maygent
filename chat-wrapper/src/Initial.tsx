import { useRef, useState, FormEvent } from "react";
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

  return (
    <div>
      {apiKey === null && (
        <div>
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
