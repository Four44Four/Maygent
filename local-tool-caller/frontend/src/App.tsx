import { JSX, useState, useEffect, useRef, ChangeEvent } from "react";
import "./Shimmer.css";
import "./App.css";

type AppProps = {
  chatNameIn: string;
  apiKey: string;
};

type DisplayMsg = {
  content: string;
  role: "assistant" | "user" | "tool" | "system";
  toolName?: string;
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

function getDisplayMsgDiv(msgIn: DisplayMsg, indexIn: number): JSX.Element {
  if (msgIn.role === "system") {
    return (<div key={indexIn} style={{ display: "none" }}></div>);
  }
  else if (msgIn.role === "tool" && msgIn.toolName) {
    return (
      <div key={indexIn} className="message tool">
        {`TOOL CALLED ${msgIn.toolName}`}
      </div>
    );
  }
  else {
    return (
      <div key={indexIn} className={`message ${msgIn.role}`}>
        {msgIn.content}
      </div>
    );
  }
}

export default function ({ chatNameIn, apiKey }: AppProps) {
  const [msgList, setMsgList] = useState<DisplayMsg[] | null>(null);
  const [systemPrompt, setSystemPrompt] = useState<string | null>(null);
  const [currentDirectoryStr, setCurrentDirectoryStr] = useState<string | null>(null);
  const [displaySystemPrompt, setDisplaySystemPrompt] = useState<boolean>(false);
  const [modelList, setModelList] = useState<string[]>(["openrouter/free"]);
  const [waitingForResponse, setWaitingForResponse] = useState<boolean>(false);

  const userInputRef = useRef<HTMLInputElement | null>(null);
  const currentDirectoryInputRef = useRef<HTMLInputElement | null>(null);
  const modelSelectRef = useRef<HTMLSelectElement | null>(null);

  useEffect(() => {
    // initialize `msgList`
    fetch(`/api/get-chat-messages/${chatNameIn}`)
      .then((res: any) => {
        if (!res.ok) {
          const msg = `Error in response: ${res.status} :: ${res.statusText}`;
          alert(msg);
          throw new Error(msg);
        }
        return res.json();
      })
      .then((msgsIn: DisplayMsg[]) => {
        setMsgList(msgsIn);
      });

    (async () => {
      // retrieve free models
      setModelList(await getFreeModels(apiKey));

      // initialize Chat details
      const getChatRes = await fetch(`/api/get-chat/${chatNameIn}`);
      if (getChatRes.ok) {
        const chatIn = await getChatRes.json();
        setSystemPrompt(chatIn.systemPrompt);
        setCurrentDirectoryStr(chatIn.currentDirectory);
        modelSelectRef.current.value = chatIn.selectedModel;
      }
      else {
        alert(`Error in response: ${res.status} :: ${res.statusText}`);
      }
    })();
  }, []);

  const setCurrentDirectory = async () => {
    if (currentDirectoryInputRef.current) {
      const setCurrentDirectoryRes = await fetch(`/api/set-chat-current-directory/${chatNameIn}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          currentDirectoryIn: currentDirectoryInputRef.current.value,
        }),
      });
      if (!setCurrentDirectoryRes.ok) {
        alert(`Error occurred while setting current directory to ${currentDirectoryInputRef.current.value}: ${setCurrentDirectoryRes.status} :: ${setCurrentDirectoryRes.statusText}`);
        return;
      }

      setCurrentDirectoryStr(await setCurrentDirectoryRes.json());

      currentDirectoryInputRef.current.value = "";
    }
  };

  const startAgenticLoop = async () => {
    if (userInputRef.current === null || modelSelectRef.current === null) {
      alert("Your required elements don't exist ????");
      return;
    }

    setWaitingForResponse(true);

    const appendChatRes = await fetch("/api/append-chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chatName: chatNameIn,
        message: userInputRef.current.value,
        modelSlug: modelSelectRef.current.value,
        apiKey: apiKey,
      }),
    });

    if (!appendChatRes.ok) {
      alert(`Error appending to chat \`${chatNameIn}\`: ${appendChatRes.status} :: ${appendChatRes.statusText}`);
      return;
    }

    userInputRef.current.value = "";

    const streamReader = appendChatRes.body!
                           .pipeThrough(new TextDecoderStream())
                           .getReader();
    // since a complete `DisplayMsg` JSON chunk may not be transmitted in a single read
    //   a buffer must be used to hold partially transmitted chunks
    let resBuffer = "";

    // stream processing loop to update `msgList` whenever the stream receives data
    while (true) {
      const { value, done } = await streamReader.read();
      if (done) {
        break;
      }

      resBuffer += value;

      const resBufferLines = resBuffer.split("\n");
      resBuffer = resBufferLines.pop() ?? "";

      const curMsgList: DisplayMsg[] = [];

      for (const curLine of resBufferLines) {
        const trimmedCurLine = curLine.trim();
        if (!trimmedCurLine) {
          continue;
        }

        try {
          curMsgList.push(JSON.parse(trimmedCurLine));
        } catch (errorIn: any) {
          alert(`Some stupid thing happened while processing received messages: ${errorIn}`);
        }
      }

      setMsgList(oldMsgList => [...(oldMsgList ?? []), ...curMsgList]);
    }

    setWaitingForResponse(false);
  };

  const updateSelectedModel = async (eventIn: ChangeEvent<HTMLSelectElement>) => {
    const setSelectedModelRes = await fetch(`/api/set-chat-selected-model/${chatNameIn}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        selectedModelIn: modelSelectRef.current.value,
      }),
    });
    if (!setSelectedModelRes.ok) {
      alert(`Error occurred while setting selected model to ${modelSelectRef.current.value}: ${setSelectedModelRes.status} :: ${setSelectedModelRes.statusText}`);
      return;
    }
  };

  return (
    <div>
      {(msgList === null || systemPrompt === null) && (
        <div className="shimmer" style={{ height: "50vh", width: "100vw" }}></div>
      )}

      <div style={{ display: (msgList === null || systemPrompt === null) ? "none" : "block" }}>
        <h3>Current directory:</h3>
        <p>{currentDirectoryStr}</p>
        <input type="text" placeholder="Enter your new current directory..." ref={currentDirectoryInputRef}/>
        <button onClick={setCurrentDirectory}>
          Set current directory
        </button>

        <br />

        <button onClick={() => setDisplaySystemPrompt(oldVal => !oldVal)}>
          Toggle display system prompt
        </button>
        {displaySystemPrompt && (<div>{systemPrompt}</div>)}

        <br />

        <select ref={modelSelectRef}
                onChange={updateSelectedModel}>
          {modelList.map((curModelSlug: string) => (
            <option key={curModelSlug} value={curModelSlug}>
              {curModelSlug === "openrouter/free" ? "Auto free routing" : curModelSlug}
            </option>
          ))}
        </select>

        <br />

        {msgList !== null && (
          <div>
            {msgList.map((curMsg: DisplayMsg, i: number) => getDisplayMsgDiv(curMsg, i))}
          </div>
        )}

        {waitingForResponse && (
          <p>ROBOT IS THINKING VERY HARD</p>
        )}

        <input type="text" placeholder="What do u want..." ref={userInputRef} />
        <button onClick={startAgenticLoop}>
          Send
        </button>
      </div>
    </div>
  );
}
