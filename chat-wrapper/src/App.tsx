import {
  JSX,
  KeyboardEvent,
  useState, Dispatch, SetStateAction,
  useRef, MutableRefObject,
  useEffect,
} from "react";
import "./App.css";

type AppProps = {
  apiKey: string;
  systemPrompt: string;
};

type HistoryMsg = {
  content: string;
  role: "assistant" | "user";
};

async function getFreeModels(apiKeyIn: string): Promise<string[]> {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/models", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiKeyIn}`
      },
    });
    if (!response.ok) {
      return ["openrouter/free"];
    }

    return (await response.json()).data
             .filter((curModel: any) => curModel.pricing?.prompt === "0" && curModel.pricing?.completion === "0")
             .map((curModel: any) => curModel.id);
  } catch (errorIn: any) {
    console.error(`Failed to fetch free Openrouter models: ${errorIn}`);
    return ["openrouter/free"];
  }
}

// sends the provided parameter information to OpenRouter
// returns the message from the robot on the other side
async function sendMessageToBackend(
  userInputStrIn: string,
  apiKeyIn: string,
  modelNameIn: string,
  chatHistoryIn: HistoryMsg[]
): Promise<string | Error> {
  try {
    const httpResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKeyIn}`,
        "Content-Type": "application/json",
        "HTTP-Referer": window.location.origin,
        "X-Title": "Maygentic",
      },
      body: JSON.stringify({
        model: modelNameIn,
        messages: chatHistoryIn,
        stream: false,
      }),
    });

    if (!httpResponse.ok) {
      try {
        const errorData = await httpResponse.json();
        const errorMsg = errorData.error?.message || `HTTP Code ${httpResponse.status}`;
        return new Error(`Openrouter error: ${errorMsg}`);
      } catch {
        return new Error(`Http error: Code \`${httpResponse.status}\`, Msg: \`${(await httpResponse.text()) || httpResponse.statusText}\``);
      }
    }

    return (await httpResponse.json()).choices?.[0]?.message?.content
            || "No response received";
  } catch (errorIn: any) {
    return new Error(`Some error: ${errorIn}`);
  }
}

async function sendMessage(
  curChatHistory: HistoryMsg[],
  setChatHistory: Dispatch<SetStateAction<HistoryMsg[]>>,
  userInputRef: MutableRefObject<HTMLInputElement | null>,
  thinkingRef: MutableRefObject<HTMLDivElement | null>,
  apiKeyIn: string | undefined,
  modelNameIn: string | undefined,
  hasSentFirstMsg: MutableRefObject<boolean>,
  systemPromptIn: string | null,
) {
  if (userInputRef.current === null
      || userInputRef.current.value.length === 0
      || apiKeyIn === undefined
      || modelNameIn === undefined) {
    return;
  }

  const userInputStr: string = userInputRef.current.value;

  let newChatHistory: HistoryMsg[];

  if (hasSentFirstMsg.current) {
    newChatHistory = [
      ...curChatHistory,
      { content: userInputStr, role: "user" },
    ];
  }
  // send `systemPromptIn` if no first message has been sent
  else {
    newChatHistory = [
      { content: systemPromptIn as string, role: "user"},
      { content: userInputStr, role: "user" },
    ];
    hasSentFirstMsg.current = true;
  }

  setChatHistory(newChatHistory);
  userInputRef.current.value = "";

  if (thinkingRef.current !== null) {
    thinkingRef.current.classList.add("active");
  }

  const robotResponse = await sendMessageToBackend(userInputStr, apiKeyIn, modelNameIn, newChatHistory);

  if (thinkingRef.current !== null) {
    thinkingRef.current.classList.remove("active");
  }

  if (robotResponse instanceof Error) {
    alert(robotResponse.message);
  } else {
    setChatHistory(oldChatHistory => [...oldChatHistory, { content: robotResponse , role: "assistant" }]);
  }
}

function textInputKeyDown(
  eventIn: KeyboardEvent<HTMLInputElement>,
  curChatHistory: HistoryMsg[],
  setChatHistory: Dispatch<SetStateAction<HistoryMsg[]>>,
  userInputRef: MutableRefObject<HTMLInputElement | null>,
  thinkingRef: MutableRefObject<HTMLDivElement | null>,
  apiKeyIn: string | undefined,
  modelNameIn: string | undefined,
  hasSentFirstMsg: MutableRefObject<boolean>,
  systemPromptIn: string | null,
) {
  if (eventIn.key === "Enter" && apiKeyIn !== undefined && modelNameIn !== undefined) {
    sendMessage(curChatHistory, setChatHistory, userInputRef, thinkingRef, apiKeyIn, modelNameIn, hasSentFirstMsg, systemPromptIn);
  }
}

function getChatHistoryMsgDiv(msgIn: HistoryMsg, indexIn: number): JSX.Element {
  return (
    <div key={indexIn}
         className={`message ${msgIn.role}`}>
      {msgIn.content}
    </div>
  );
}

export default function ({ apiKey, systemPrompt }: AppProps) {
  const [chatHistory, setChatHistory] = useState<HistoryMsg[]>([]);
  const [modelList, setModelList] = useState<string[]>(["openrouter/free"]);
  const [modelListLoading, setModelListLoading] = useState<boolean>(true);
  const [shouldDisplaySystemPrompt, setShouldDisplaySystemPrompt] = useState<boolean>(false);

  const userInputRef = useRef<HTMLInputElement | null>(null);
  const thinkingRef = useRef<HTMLDivElement | null>(null);
  const modelSelectRef = useRef<HTMLSelectElement | null>(null);

  const hasSentFirstMsg = useRef<boolean>(false);

  useEffect(() => {
    (async () => {
      setModelList(await getFreeModels(apiKey));
      setModelListLoading(false);
    })();
  }, []);

  const toggleShouldDisplaySystemPrompt = () => {
    setShouldDisplaySystemPrompt(oldVal => !oldVal);
  };

  return (
    <div>
      <button onClick={toggleShouldDisplaySystemPrompt}>
        Toggle System Prompt
      </button>
      {shouldDisplaySystemPrompt && (<div id="system-prompt-display">{systemPrompt}</div>)}

      <select ref={modelSelectRef}
              className={modelListLoading ? "model-list-loading" : ""}
              disabled={modelListLoading}>
        {modelList.map(curModelSlug => (
          <option key={curModelSlug} value={curModelSlug}>
            {curModelSlug === "openrouter/free" ? "Auto free routing"
                                                : curModelSlug}
          </option>
        ))}
      </select>

      <div id="chat-history">
        {chatHistory.slice(1).map((curMsg, i) => getChatHistoryMsgDiv(curMsg, i))}
      </div>

      <div id="thinking-thing" ref={thinkingRef}></div>

      <div className="actions">
        <input type="text"
               placeholder="What do u want..."
               ref={userInputRef}
               onKeyDown={(eventIn: KeyboardEvent<HTMLInputElement>) => textInputKeyDown(eventIn, chatHistory, setChatHistory, userInputRef, thinkingRef, apiKey, modelSelectRef.current?.value, hasSentFirstMsg, hasSentFirstMsg.current ? null : systemPrompt)} />
        <button onClick={() => sendMessage(chatHistory, setChatHistory, userInputRef, thinkingRef, apiKey, modelSelectRef.current?.value, hasSentFirstMsg, hasSentFirstMsg.current ? null : systemPrompt)}>
          Send
        </button>
      </div>
    </div>
  );
}
