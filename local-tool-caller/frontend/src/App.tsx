import { JSX, useState, useEffect, useRef } from "react";
import "./Shimmer.css";

type AppProps = {
  chatNameIn: string;
  apiKey: string;
};

type DisplayMsg = {
  content: string;
  role: "assistant" | "user" | "tool" | "system";
  toolName?: string;
};


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

  const userInputRef = useRef<HTMLInputElement | null>(null);
  const currentDirectoryInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    // initialize `systemPrompt`
    fetch(`/api/get-chat-system-prompt/${chatNameIn}`)
      .then((res: any) => {
        if (!res.ok) {
          const msg = `Error in response: ${res.status} :: ${res.statusText}`;
          alert(msg);
          throw new Error(msg);
        }
        return res.json();
      })
      .then((systemPromptIn: string | undefined) => {
        setSystemPrompt(systemPromptIn ?? "");
      });

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

    // also initialize `currentDirectoryStr`
    fetch(`/api/get-char-current-directory/${chatNameIn}`)
      .then((res: any) => {
        if (!res.ok) {
          const msg = `Error in response: ${res.status} :: ${res.statusText}`;
          alert(msg);
          throw new Error(msg);
        }
        return res.json();
      })
      .then((currentDirectoryIn: string | null) => {
        setCurrentDirectoryStr(currentDirectoryIn);
      });
  }, []);

  const setCurrentDirectory = async () => {
    if (currentDirectoryInputRef.current) {
      const setCurrentDirectoryRes = await fetch(`/api/set-chat-current-directory/${chatNameIn}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          currentDirectoryIn: encodeURIComponent(currentDirectoryInputRef.current.value),
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
    if (userInputRef.current === null) {
      alert("Your user input element doesn't exist ????");
      return;
    }

    const appendChatRes = await fetch("/api/append-chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chatName: chatNameIn,
        message: userInputRef.current.value,
      }),
    });

    if (!appendChatRes.ok) {
      alert(`Error appending to chat \`${chatNameIn}\`: ${appendChatRes.status} :: ${appendChatRes.statusText}`);
      return;
    }

    const newAppendedMessages = await appendChatRes.json();
    setMsgList(oldMsgList => [...oldMsgList, ...newAppendedMessages]);

    userInputRef.current.value = "";

    // TODO: second, process `appendChatRes` as an SSE stream and push each resulting thing onto the display
  };

  return (
    <div>
      {(msgList === null || systemPrompt === null) && (
        <div className="shimmer" style={{ height: "50vh", width: "100vw" }}></div>
      )}

      {(msgList !== null && systemPrompt !== null) && (
        <div>
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

          {msgList !== null && (
            <div>
              {msgList.map((curMsg: DisplayMsg, i: number) => getDisplayMsgDiv(curMsg, i))}
            </div>
          )}

          <input type="text" placeholder="What do u want..." ref={userInputRef} />
          <button onClick={startAgenticLoop}>
            Send
          </button>
        </div>
      )}
    </div>
  );
}
