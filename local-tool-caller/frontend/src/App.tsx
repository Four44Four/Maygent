import { JSX, useState, useEffect, useRef, RefObject, ChangeEvent } from "react";
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


async function getFreeModels(apiKeyIn: string, withVision: boolean): Promise<string[]> {
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
             .filter((curModel: any) => curModel.pricing?.prompt === "0"
                                         && curModel.pricing?.completion === "0"
                                         && (!withVision || curModel.architecture?.input_modalities?.includes("image")))
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
  const [textModelList, setTextModelList] = useState<string[]>(["openrouter/free"]);
  const [imageModelList, setImageModelList] = useState<string[]>(["openrouter/free"]);
  const [waitingForResponse, setWaitingForResponse] = useState<boolean>(false);
  const [imagePickersCount, setImagePickersCount] = useState<number>(0);

  const userInputRef = useRef<HTMLInputElement | null>(null);
  const currentDirectoryInputRef = useRef<HTMLInputElement | null>(null);
  const textModelSelectRef = useRef<HTMLSelectElement | null>(null);
  const imageModelSelectRef = useRef<HTMLSelectElement | null>(null);
  const imagePickerRefs = useRef<HTMLInputElement[]>([]);

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
      setTextModelList(await getFreeModels(apiKey, false));
      setImageModelList(await getFreeModels(apiKey, true));

      // initialize Chat details
      const getChatRes = await fetch(`/api/get-chat/${chatNameIn}`);
      if (getChatRes.ok) {
        const chatIn = await getChatRes.json();
        setSystemPrompt(chatIn.systemPrompt);
        setCurrentDirectoryStr(chatIn.currentDirectory);
        textModelSelectRef.current.value = chatIn.selectedTextModel;
        imageModelSelectRef.current.value = chatIn.selectedImageModel;
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
    if (userInputRef.current === null || textModelSelectRef.current === null || imageModelSelectRef.current === null) {
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
        images: (await Promise.all(imagePickerRefs.current
          .filter((curImagePickerElem: HTMLInputElement) => (
            curImagePickerElem?.files[0]
          ))
          .map((curImagePickerElem: HTMLInputElement) => {
            const curFile = curImagePickerElem.files?.[0];
            if (curFile) {
              return new Promise<string>((resolve: any, reject: any) => {
                const fileReader = new FileReader();
                fileReader.onload = () => resolve(fileReader.result as string);
                fileReader.onerror = () => reject("");
                fileReader.readAsDataURL(curFile);
              });
            }
          })))
          .filter((curBase64: string) => curBase64.length > 0),
        imageModelSlug: imageModelSelectRef.current.value,
        textModelSlug: textModelSelectRef.current.value,
        apiKey: apiKey,
      }),
    });

    if (!appendChatRes.ok) {
      alert(`Error appending to chat \`${chatNameIn}\`: ${appendChatRes.status} :: ${appendChatRes.statusText}`);
      return;
    }

    userInputRef.current.value = "";
    setImagePickersCount(0);
    imagePickerRefs.current = [];

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

  const updateSelectedTextModel = async (eventIn: ChangeEvent<HTMLSelectElement>) => {
    const setSelectedModelRes = await fetch(`/api/set-chat-selected-text-model/${chatNameIn}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        selectedModelIn: textModelSelectRef.current.value,
      }),
    });
    if (!setSelectedModelRes.ok) {
      alert(`Error occurred while setting selected text model to ${textModelSelectRef.current.value}: ${setSelectedModelRes.status} :: ${setSelectedModelRes.statusText}`);
      return;
    }
  };

  const updateSelectedImageModel = async (eventIn: ChangeEvent<HTMLSelectElement>) => {
    const setSelectedModelRes = await fetch(`/api/set-chat-selected-image-model/${chatNameIn}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        selectedModelIn: imageModelSelectRef.current.value,
      }),
    });
    if (!setSelectedModelRes.ok) {
      alert(`Error occurred while setting selected image model to ${imageModelSelectRef.current.value}: ${setSelectedModelRes.status} :: ${setSelectedModelRes.statusText}`);
      return;
    }
  };

  const addImagePicker = () => {
    setImagePickersCount(oldVal => oldVal + 1);
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

        <p>Text model</p>
        <select ref={textModelSelectRef}
                onChange={updateSelectedTextModel}>
          {textModelList.map((curModelSlug: string) => (
            <option key={curModelSlug} value={curModelSlug}>
              {curModelSlug === "openrouter/free" ? "Auto free routing" : curModelSlug}
            </option>
          ))}
        </select>

        <p>Image model</p>
        <select ref={imageModelSelectRef}
                onChange={updateSelectedImageModel}>
          {imageModelList.map((curModelSlug: string) => (
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

        <button onClick={addImagePicker}>
          Add image
        </button>
        {Array.from({ length: imagePickersCount }, (_: any, i: number) => (
          <div>
            <input type="file"
                   accept="image/*"
                   key={i}
                   ref={(elem: HTMLInputElement) => { imagePickerRefs.current[i] = elem; }}/>
            <br />
          </div>
        ))}
      </div>
    </div>
  );
}
