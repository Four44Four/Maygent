import { useState, useEffect, useRef } from "react";
import PreChat from "./PreChat";
import "./Shimmer.css";

export default function () {
  const [chatNames, setChatNames] = useState<string[] | null>(null);
  const [selectedChatName, setSelectedChatName] = useState<string | null>(null);

  const newChatNameRef = useRef<HTMLInputElement | null>(null);
  const isNewChatRef = useRef<boolean>(false);

  // initialize `chatNames` based on the API
  useEffect(() => {
    fetch("/api/get-chat-names")
      .then((res: any) => {
        if (!res.ok) {
          const msg = `Error in response: ${res.status} :: ${res.statusText}`;
          alert(msg);
          throw new Error(msg);
        }
        return res.json();
      })
      .then((dataIn: any) => {
        console.log(` >> Received these chat names: ${dataIn}`);
        setChatNames(dataIn);
      });
  }, []);

  return (
    <div>
      {selectedChatName === null && (
        <div>
          <h3>Create a new chat</h3>
          <input type="text" placeholder="Enter chat name..." ref={newChatNameRef}/>
          <button onClick={() => {
                    if (newChatNameRef.current !== null) {
                      isNewChatRef.current = true;
                      setSelectedChatName(newChatNameRef.current.value);
                    }
                  }}>
            Create new chat
          </button>

          <br />

          <h3>Existing chats</h3>

          {chatNames === null && (
            <div className="shimmer" style={{ height: "50vh", width: "50vw" }}></div>
          )}
          {chatNames !== null && (
            <div>
              {chatNames.map((curChatName: string, indexIn: number) => (
                <div>
                  <button key={indexIn}
                          onClick={() => setSelectedChatName(curChatName)}>
                    {curChatName}
                  </button>
                  <br />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {selectedChatName !== null && (
        <PreChat chatNameIn={selectedChatName} newChatIn={isNewChatRef.current} />
      )}
    </div>
  );
}
