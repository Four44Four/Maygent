import { useRef, useState } from "react";
import App from "./App";

export default function ({ chatNameIn, newChatIn }: { chatNameIn: string; newChatIn: boolean; }) {
  const apiKeyInputRef = useRef<HTMLInputElement | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);

  const systemPromptInputRef = useRef<HTMLInputElement | null>(null);

  const onEnter = async () => {
    const curInputText = apiKeyInputRef.current?.value;
    if (curInputText !== undefined && curInputText.trim()) {
      if (newChatIn) {
        const getChatExistsRes = await fetch(`/api/get-chat-exists/${chatNameIn}`);
        if (!getChatExistsRes.ok) {
          alert(`Error checking if chat \`${chatNameIn}\` exists: ${getChatExistsRes.status} :: ${getChatExistsRes.statusText}`);
          return;
        }

        // create chat if it doesn't already exist
        if (!(await getChatExistsRes.json())) {
          const createChatRes = await fetch(`/api/create-chat`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              name: chatNameIn,
              systemPrompt: systemPromptInputRef.current?.value ?? "",
            }),
          });

          if (!createChatRes.ok) {
            alert(`Error creating chat \`${chatNameIn}\`: ${createChatRes.status} :: ${createChatRes.statusText}`);
            return;
          }
        }
      }

      setApiKey(curInputText as string);
    }
  };

  return (
    <div>
      {apiKey === null && (
        <div>
          {newChatIn && (
            <div>
              <h3>Making a new Chat</h3>
              <input type="text" placeholder="Type system prompt here..." ref={systemPromptInputRef} />
            </div>
          )}
          <br />
          <input type="password"
                 placeholder="Type OpenRouter API key here"
                 ref={apiKeyInputRef} />
          <button onClick={onEnter}>
            {newChatIn ? "Create" : "Load"}
          </button>
        </div>
      )}

      {apiKey !== null && (
        <App apiKey={apiKey} chatNameIn={chatNameIn} />
      )}
    </div>
  );
}
