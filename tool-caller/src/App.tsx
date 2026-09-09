import {
  JSX,
  KeyboardEvent, ChangeEvent,
  useState, Dispatch, SetStateAction,
  useRef, MutableRefObject, RefObject,
  useEffect,
} from "react";

import {
  type DocEntry,
  TOOLS, TOOL_DEFINITIONS, TOOL_CALL_WAIT_MS,
  setDocAuthToken, getDocAuthToken,
  validateResponse,
} from "./Tools";

import "./App.css";

type AppProps = {
  apiKey: string;
  systemPrompt: string;
};

type HistoryMsg = {
  content: string | null;
  role: "assistant" | "user" | "tool" | "system";
  tool_call_id?: string;
  name?: string;
  tool_calls?: any[];
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
// returns the JSON response from the robot on the other side
async function sendMessageToBackend(
  apiKeyIn: string,
  modelNameIn: string,
  chatHistoryIn: HistoryMsg[]
): Promise<any | Error> {
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
        tools: TOOL_DEFINITIONS,
        tool_choice: "auto",
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

    return await httpResponse.json();
  } catch (errorIn: any) {
    return new Error(`Some error: ${errorIn}`);
  }
}

// returns the (<model-response-data-JSON-or-`null`>, <updated-curChatHistory>, <valid-response-boolean>)
async function sendMessage(
  curChatHistory: HistoryMsg[],
  setChatHistory: Dispatch<SetStateAction<HistoryMsg[]>>,
  apiKeyIn: string | undefined,
  modelNameIn: string | undefined,
): Promise<[any | null, HistoryMsg[], boolean]> {
  if (apiKeyIn === undefined
      || modelNameIn === undefined) {
    return [null, curChatHistory, true];
  }

  const robotResponse = await sendMessageToBackend(apiKeyIn, modelNameIn, curChatHistory);

  if (robotResponse instanceof Error) {
    alert(robotResponse.message);
    return [null, curChatHistory, true];
  }
  else {
    const robotMessage = robotResponse.choices?.[0]?.message;
    const robotHistoryMsg: HistoryMsg = {
      content: robotMessage?.content ?? null,
      role: "assistant",
      tool_calls: robotMessage?.tool_calls ?? undefined
    };

    if (robotHistoryMsg.content !== null) {
      const validateData = await validateResponse(robotHistoryMsg.content);
      if (validateData[0]) {
        setChatHistory(oldChatHistory => [...oldChatHistory, robotHistoryMsg]);
        return [robotResponse, [...curChatHistory, robotHistoryMsg], true];
      } else {
        const errorMsg = validateData[1] + ", original response: " + (robotMessage?.content ?? "");
        console.log(" >> " + errorMsg);
        const validateResMsg: HistoryMsg = {
          content: errorMsg,
          role: "system"
        };
        setChatHistory(oldChatHistory => [...oldChatHistory, validateResMsg]);
        return [robotResponse, [...curChatHistory, validateResMsg], false];
      }
    }
    // no validate if its a tool call (probably)
    else {
      setChatHistory(oldChatHistory => [...oldChatHistory, robotHistoryMsg]);
      return [robotResponse, [...curChatHistory, robotHistoryMsg], true];
    }
  }
}

async function runAgenticLoop(
  curChatHistory: HistoryMsg[],
  setChatHistory: Dispatch<SetStateAction<HistoryMsg[]>>,
  userInputRef: MutableRefObject<HTMLInputElement | null>,
  thinkingRef: MutableRefObject<HTMLDivElement | null>,
    apiKeyIn: string | undefined,
  modelNameIn: string | undefined,
  hasSentFirstMsg: MutableRefObject<boolean>,
  systemPromptIn: string | null,
  UI_TOOLS: Record<string, (...args: any[]) => any>,
) {
  let curChatHistoryUpdated: HistoryMsg[] = curChatHistory;
  let runLoop = true;

  if (thinkingRef.current !== null) {
    thinkingRef.current.classList.add("active");
  }

  // append `userInputRef`'s contents to chat history
  if (userInputRef.current !== null && userInputRef.current.value.length > 0) {
    const userInputStr = userInputRef.current.value;
    if (hasSentFirstMsg.current) {
      curChatHistoryUpdated = [
        ...curChatHistoryUpdated,
        { content: userInputStr, role: "user" },
      ];
    }
    // send `systemPromptIn` if no first message has been sent
    else {
      curChatHistoryUpdated = [
        { content: systemPromptIn as string, role: "system"},
        { content: userInputStr, role: "user" },
      ];
      hasSentFirstMsg.current = true;
    }

    setChatHistory(curChatHistoryUpdated);
    userInputRef.current.value = "";
  }

  while (runLoop) {
    const msgRes = await sendMessage(curChatHistoryUpdated, setChatHistory, apiKeyIn, modelNameIn);
    const robotResponse = msgRes[0];
    if (robotResponse === null) {
      runLoop = false;
      continue;
    }

    curChatHistoryUpdated = msgRes[1];

    const robotMessage = robotResponse.choices?.[0]?.message;
    const finishReason = robotResponse.choices?.[0]?.finish_reason ?? "INVALID";
    const hasToolCalls = finishReason === "tool_calls" || (robotMessage && robotMessage.tool_calls)
    // stop agentic loop if last robotResponse wasn't a tool call
    //                      and msgRes is valid
    if (!hasToolCalls && msgRes[2]) {
      runLoop = false;
      continue;
    }

    console.log(" >> AGENT LOOP IS RUNNING !!!!!");

    if (hasToolCalls) {
      let localChatHistory = [...curChatHistoryUpdated];

      for (const curToolCall of robotMessage.tool_calls) {
        const functionName = curToolCall.function.name;
        const args = curToolCall.function.arguments;

        console.log(` >> TOOL: ${functionName}, ARGS: ${args}`);

        try {
          const parsedArgs = JSON.parse(args);

          if (UI_TOOLS[functionName]) {
            localChatHistory.push({
              content: await UI_TOOLS[functionName](parsedArgs),
              role: "tool",
              tool_call_id: curToolCall.id,
              name: functionName,
            });
          }
          else if (TOOLS[functionName]) {
            localChatHistory.push({
              content: await TOOLS[functionName](parsedArgs),
              role: "tool",
              tool_call_id: curToolCall.id,
              name: functionName,
            });
          }
          else {
            throw new Error(`${functionName} is not a valid tool`);
          }
        } catch (errorIn: any) {
          alert(`Error calling tool: ${errorIn.message}`);
          localChatHistory.push({
            content: JSON.stringify({ error: errorIn.message }),
            role: "tool",
            tool_call_id: curToolCall.id,
            name: functionName,
          });
        }
      }

      curChatHistoryUpdated = localChatHistory;
      setChatHistory(curChatHistoryUpdated);
    }
    // wait 1 second between agent loops
    await new Promise(resolve => setTimeout(resolve, TOOL_CALL_WAIT_MS));
  }

  if (thinkingRef.current !== null) {
    thinkingRef.current.classList.remove("active");
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
  UI_TOOLS: Record<string, (...args: any[]) => any>,
) {
  if (eventIn.key === "Enter" && apiKeyIn !== undefined && modelNameIn !== undefined) {
    runAgenticLoop(curChatHistory, setChatHistory, userInputRef, thinkingRef, apiKeyIn, modelNameIn, hasSentFirstMsg, systemPromptIn, UI_TOOLS);
  }
}

function getChatHistoryMsgDiv(msgIn: HistoryMsg, indexIn: number): JSX.Element {
  if (msgIn.content === null || msgIn.role === "system") {
    return (
      <div key={indexIn} style={{ display: "none" }}></div>
    );
  }
  else if (msgIn.role === "tool") {
    return (
      <div key={indexIn}
           className={"message tool"}>
        {`TOOL CALLED: ${msgIn.name}`}
      </div>
    );
  }
  else {
    return (
      <div key={indexIn}
           className={`message ${msgIn.role}`}>
        {msgIn.content}
      </div>
    );
  }
}

export default function ({ apiKey, systemPrompt }: AppProps) {
  const [chatHistory, setChatHistory] = useState<HistoryMsg[]>([]);
  const [modelList, setModelList] = useState<string[]>(["openrouter/free"]);
  const [modelListLoading, setModelListLoading] = useState<boolean>(true);
  const [shouldDisplaySystemPrompt, setShouldDisplaySystemPrompt] = useState<boolean>(false);

  const userInputRef = useRef<HTMLInputElement | null>(null);
  const thinkingRef = useRef<HTMLDivElement | null>(null);
  const modelSelectRef = useRef<HTMLSelectElement | null>(null);
  const docClientIdInputRef = useRef<HTMLInputElement | null>(null);

  // returns if an auth token was found
  const parseDocAuthToken: () => boolean = () => {
    // Trying to find already cached auth token
    if (getDocAuthToken.length > 0) {
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
  const generateDocAuthToken = () => {
    if (docClientIdInputRef.current !== null) {
      if (parseDocAuthToken()) {
        return;
      }

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

  const [hasDocAuthToken, setHasDocAuthToken] = useState<boolean>(false);
  useEffect(() => {
    setHasDocAuthToken(parseDocAuthToken());
  }, []);

  const hasSentFirstMsg = useRef<boolean>(false);

  const docEntriesRef = useRef<DocEntry[]>([]);
  const [docEntriesCount, setDocEntriesCount] = useState<number>(0);

  const testDocIndexRef = useRef<HTMLInputElement | null>(null);
  const testDocHeaderRef = useRef<HTMLInputElement | null>(null);
  const onClickShowHeaders = async () => {
    if (testDocIndexRef.current === null || parseInt(testDocIndexRef.current.value) >= docEntriesRef.current.length) {
      alert(`Invalid header index: ${testDocIndexRef.current?.value}`);
    } else {
      try {
        alert(await TOOLS["getDocHeaders"]({
          urlIn: docEntriesRef.current[parseInt(testDocIndexRef.current?.value ?? "0")].url,
        }));
      } catch (errorIn: any) {
        alert(`Error occurred: ${errorIn}`);
      }
    }
  };
  const onClickShowHeaderContent = async () => {
    if (testDocIndexRef.current === null || parseInt(testDocIndexRef.current.value) >= docEntriesRef.current.length) {
      alert(`Invalid header index: ${testDocIndexRef.current?.value}`);
    } else {
      try {
        alert(await TOOLS["getDocHeaderContent"]({
          urlIn: docEntriesRef.current[parseInt(testDocIndexRef.current?.value ?? "0")].url,
          headerIn: testDocHeaderRef.current?.value,
        }));
      } catch (errorIn: any) {
        alert(`Error occurred: ${errorIn}`);
      }
    }
  };


  const UI_TOOLS: Record<string, (...args: any[]) => any> = {
    getDocList: () => JSON.stringify(docEntriesRef.current),
  };

  useEffect(() => {
    (async () => {
      setModelList(await getFreeModels(apiKey));
      setModelListLoading(false);
    })();
  }, []);

  const toggleShouldDisplaySystemPrompt = () => {
    setShouldDisplaySystemPrompt(oldVal => !oldVal);
  };

  const addNewDocEntry = () => {
    docEntriesRef.current.push({ name: "", url: "" });
    setDocEntriesCount(oldVal => oldVal + 1);
  };

  const updateDocName = (indexIn: number, strIn: string) => {
    docEntriesRef.current[indexIn].name = strIn;
  };
  const updateDocUrl = (indexIn: number, strIn: string) => {
    docEntriesRef.current[indexIn].url = strIn;
  };

  return (
    <div>
      <input type="number" step="1" defaultValue="0" min="0"
             ref={testDocIndexRef} />
      <button onClick={onClickShowHeaders}>
        Show headers
      </button>
      <br/>
      <input type="text" placeholder="Enter a header..."
             ref={testDocHeaderRef} />
      <button onClick={onClickShowHeaderContent}>
        Show header content
      </button>

      <br/>
      <br/>

      {hasDocAuthToken && (<p>I HAVE FOUND AN AUTH TOKEN !!!</p>)}

      <input type="password" placeholder="Enter your Google API client id..." ref={docClientIdInputRef}/>
      <button onClick={generateDocAuthToken}>
        Generate auth token
      </button>

      <br/>

      <button onClick={addNewDocEntry}>
        Add Doc Entry
      </button>
      <div>
        {docEntriesRef.current.map((curDocEntry: DocEntry, i: number) => (
          <div key={i}>
            <input type="text"
                   placeholder="Enter a name for this doc..."
                   onChange={(eventIn: ChangeEvent<HTMLInputElement>) => updateDocName(i, eventIn.target.value)}/>
            <input type="text"
                   placeholder="Enter the API endpoint for reading this doc's contents..."
                   onChange={(eventIn: ChangeEvent<HTMLInputElement>) => updateDocUrl(i, eventIn.target.value)}/>
          </div>
        ))}
      </div>

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
        {chatHistory.map((curMsg, i) => getChatHistoryMsgDiv(curMsg, i))}
      </div>

      <div id="thinking-thing" ref={thinkingRef}></div>

      <div className="actions">
        <input type="text"
               placeholder="What do u want..."
               ref={userInputRef}
               onKeyDown={(eventIn: KeyboardEvent<HTMLInputElement>) => textInputKeyDown(eventIn, chatHistory, setChatHistory, userInputRef, thinkingRef, apiKey, modelSelectRef.current?.value, hasSentFirstMsg, hasSentFirstMsg.current ? null : systemPrompt, UI_TOOLS)} />
        <button onClick={() => runAgenticLoop(chatHistory, setChatHistory, userInputRef, thinkingRef, apiKey, modelSelectRef.current?.value, hasSentFirstMsg, hasSentFirstMsg.current ? null : systemPrompt, UI_TOOLS)}>
          Send
        </button>
      </div>
    </div>
  );
}
