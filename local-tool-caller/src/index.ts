import express, { Request, Response } from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

const FRONTEND_ROOT_PATH = "../dist/public";
const FRONTEND_ENTRY_FILE = "index.html";

app.use(express.json());
app.use(express.static(path.join(__dirname, FRONTEND_ROOT_PATH)));

app.get("/", (reqIn: Request, resIn: Response) => {
  resIn.sendFile(path.join(__dirname, FRONTEND_ROOT_PATH, FRONTEND_ENTRY_FILE));
});

// ####################################################################################

type HistoryMsg = {
  content: string | null;
  role: "assistant" | "user" | "tool" | "system";
  tool_call_id?: string;
  name?: string;
  tool_calls?: any[];
};

type Chat = {
  name: string;
  systemPrompt: string;
  messages: HistoryMsg[];
  currentDirectory: string | null;
};

// function isChatObj(objIn: any): boolean {
//   return objIn.name && objIn.systemPrompt && objIn.messages
//           && Array.isArray(objIn.messages);
// }

// TODO: transition this into using an SQLite table with a table to store all Chats + a table to store all HistoryMsgs using each Chat row as a foreign key
const chatMap = new Map<string, Chat>();

app.post("/api/create-chat", (reqIn: Request, resIn: Response) => {
  const chatData = reqIn.body;

  console.log(` >> Received Chat data: ${JSON.stringify(chatData)}`);

  if (!chatData.name
      || typeof chatData.name !== "string"
      || !chatData.systemPrompt
      || typeof chatData.systemPrompt !== "string") {
    return resIn.status(400).json({
      message: "Provided Chat data is malformed",
    });
  }

  if (chatMap.get(chatData.name)) {
    return resIn.status(400).json({
      message: `Provided Chat data already exists ${chatData.name}`,
    });
  }

  chatMap.set(chatData.name, {
    name: chatData.name,
    systemPrompt: chatData.systemPrompt,
    messages: [],
    currentDirectory: null,
  });

  resIn.sendStatus(201);
});

app.post("/api/append-chat", (reqIn: Request, resIn: Response) => {
  const dataIn = reqIn.body;

  console.log(` >> Received user message data: ${JSON.stringify(dataIn)}`);

  if (!dataIn.chatName || typeof dataIn.chatName !== "string") {
    return resIn.status(400).json({
      message: "Missing or malformed `chatName` property",
    });
  }

  if (!dataIn.message || typeof dataIn.message !== "string") {
    return resIn.status(400).json({
      message: "Missing or malformed `message` property",
    });
  }

  const foundChat = chatMap.get(dataIn.chatName);

  if (!foundChat) {
    return resIn.status(400).json({
      message: `Provided Chat doesn't exist: ${dataIn.chatName}`,
    });
  }

  const foundChatPrevLength = foundChat.messages.length;

  foundChat.messages.push({
    content: dataIn.message,
    role: "user",
  });

  foundChat.messages.push({
    content: "Acknowledged.",
    role: "assistant",
  });

  // TODO: second, do LLM agentic loop and push messages back to client over SSE

  // respond with the new message data to be displayed as an array of JS objs
  resIn.status(201).json(foundChat.messages.slice(foundChatPrevLength).map((curMsg: HistoryMsg) => ({
    content: curMsg.content ?? "",
    role: curMsg.role,
    toolName: curMsg.name,
  })));
});

app.post("/api/set-chat-current-directory/:nameIn", (reqIn: Request, resIn: Response) => {
  const dataIn = reqIn.body;

  if (!dataIn.currentDirectoryIn || typeof dataIn.currentDirectoryIn !== "string") {
    return resIn.status(400).json({
      message: "Missing or malformed `currentDirectoryIn` property",
    });
  }

  const nameIn = reqIn.params.nameIn as string;
  const currentDirectoryIn = decodeURIComponent(dataIn.currentDirectoryIn);

  console.log(` >> Received current directory: ${currentDirectoryIn} for ${nameIn}`);

  const foundChat = chatMap.get(nameIn);

  if (!foundChat) {
    return resIn.status(400).json({
      message: `Provided Chat doesn't exist: ${nameIn}`,
    });
  }

  foundChat.currentDirectory = currentDirectoryIn;

  resIn.status(201).json(foundChat.currentDirectory);
});

app.get("/api/get-chat-names", (reqIn: Request, resIn: Response) => {
  if (chatMap.size === 0) {
    resIn.json([]);
  } else {
    resIn.json(Array.from(chatMap.keys()));
  }
});

app.get("/api/get-chat-exists/:nameIn", (reqIn: Request, resIn: Response) => {
  const nameIn = reqIn.params.nameIn as string;
  resIn.json(chatMap.has(nameIn));
});

app.get("/api/get-char-current-directory/:nameIn", (reqIn: Request, resIn: Response) => {
  const nameIn = reqIn.params.nameIn as string;
  // can be `undefined` if `nameIn` is not a valid Chat name
  resIn.json(chatMap.get(nameIn)?.currentDirectory);
});

app.get("/api/get-chat-system-prompt/:nameIn", (reqIn: Request, resIn: Response) => {
  const nameIn = reqIn.params.nameIn as string;
  // can be `undefined` if `nameIn` is not a valid Chat name
  resIn.json(chatMap.get(nameIn)?.systemPrompt);
});

app.get("/api/get-chat-messages/:nameIn", (reqIn: Request, resIn: Response) => {
  const nameIn = reqIn.params.nameIn as string;
  // can be `undefined` if `nameIn` is not a valid Chat name
  resIn.json(chatMap.get(nameIn)?.messages.map((curMsg: HistoryMsg) => ({
    content: curMsg.content ?? "",
    role: curMsg.role,
    toolName: curMsg.name,
  })));
});

app.listen(PORT, () => console.log(` >> Started server on port: ${PORT}`));
