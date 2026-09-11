import express, { Request, Response } from "express";
import { getRelPath } from "./util";
import * as DB from "./db";
import { type HistoryMsg } from "./db";

const app = express();
const PORT = process.env.PORT || 3000;

const FRONTEND_ROOT_PATH = "../dist/public";
const FRONTEND_ENTRY_FILE = "index.html";

app.use(express.json());
app.use(express.static(getRelPath(FRONTEND_ROOT_PATH)));

app.get("/", (reqIn: Request, resIn: Response) => {
  resIn.sendFile(getRelPath(FRONTEND_ROOT_PATH, FRONTEND_ENTRY_FILE));
});

// ####################################################################################

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

  if (DB.getChat(chatData.name) !== null) {
    return resIn.status(400).json({
      message: `Provided Chat data already exists ${chatData.name}`,
    });
  }

  const addRes = DB.addNewChat({
    name: chatData.name,
    systemPrompt: chatData.systemPrompt,
    messages: [],
    currentDirectory: null,
  });

  if (addRes instanceof Error) {
    return resIn.status(500).json({
      message: `Error occurred while creating a new Chat: ${addRes}`,
    });
  }

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

  if (!DB.doesChatExist(dataIn.chatName)) {
    return resIn.status(400).json({
      message: `Provided Chat doesn't exist: ${dataIn.chatName}`,
    });
  }

  try {
    const resMessages: HistoryMsg[] = [];
    const appendMsg = (msgIn: HistoryMsg) => {
      resMessages.push(msgIn);
      const appendRes = DB.appendMessageToChat(dataIn.chatName, msgIn);
      if (appendRes instanceof Error) {
        throw appendRes;
      }
    };

    // TODO: make this use SEE and send several `"assistant"` messages back over a period of time

    appendMsg({
      content: dataIn.message,
      role: "user",
    });

    appendMsg({
      content: "Acknowledged.",
      role: "assistant",
    });

    // TODO: second, do LLM agentic loop and push messages back to client over SSE

    // respond with the new message data to be displayed as an array of JS objs
    resIn.status(201).json(resMessages.map((curMsg: HistoryMsg) => ({
      content: curMsg.content ?? "",
      role: curMsg.role,
      toolName: curMsg.name,
    })));
  }
  catch (errorIn: any) {
    return resIn.status(500).json({
      message: `Error occurred while appending a message: ${errorIn}`,
    });
  }
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

  if (!DB.doesChatExist(nameIn)) {
    return resIn.status(400).json({
      message: `Provided Chat doesn't exist: ${nameIn}`,
    });
  }

  const setCurDirRes = DB.setChatCurrentDirectory(nameIn, currentDirectoryIn);
  if (setCurDirRes instanceof Error) {
    return resIn.status(500).json({
      message: `Error occurred while setting current directory: ${setCurDirRes}`,
    });
  }

  resIn.status(201).json(currentDirectoryIn);
});

app.get("/api/get-chat-names", (reqIn: Request, resIn: Response) => {
  resIn.json(DB.getChatNames());
});

app.get("/api/get-chat-exists/:nameIn", (reqIn: Request, resIn: Response) => {
  const nameIn = reqIn.params.nameIn as string;
  resIn.json(DB.doesChatExist(nameIn));
});

app.get("/api/get-char-current-directory/:nameIn", (reqIn: Request, resIn: Response) => {
  const nameIn = reqIn.params.nameIn as string;
  // can be `undefined` if `nameIn` is not a valid Chat name
  resIn.json(DB.getChat(nameIn)?.currentDirectory);
});

app.get("/api/get-chat-system-prompt/:nameIn", (reqIn: Request, resIn: Response) => {
  const nameIn = reqIn.params.nameIn as string;
  // can be `undefined` if `nameIn` is not a valid Chat name
  resIn.json(DB.getChat(nameIn)?.systemPrompt);
});

app.get("/api/get-chat-messages/:nameIn", (reqIn: Request, resIn: Response) => {
  const nameIn = reqIn.params.nameIn as string;
  // can be `undefined` if `nameIn` is not a valid Chat name
  resIn.json(DB.getMessages(nameIn)?.map((curMsg: HistoryMsg) => ({
    content: curMsg.content ?? "",
    role: curMsg.role,
    toolName: curMsg.name,
  })));
});

app.listen(PORT, () => console.log(` >> Started server on port: ${PORT}`));
