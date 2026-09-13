import express, { Request, Response } from "express";
import { getRelPath } from "./util";
import * as DB from "./db";
import { type HistoryMsg } from "./db";
import * as AI from "./ai";

const app = express();
const PORT = process.env.PORT || 3000;

const FRONTEND_ROOT_PATH = "../dist/public";
const FRONTEND_ENTRY_FILE = "index.html";

// set of chat names that are currently active in an agentic loop and cannot be appended to
const activeChatNames = new Set<string>();

app.use(express.static(getRelPath(FRONTEND_ROOT_PATH)));

app.get("/", (reqIn: Request, resIn: Response) => {
  resIn.sendFile(getRelPath(FRONTEND_ROOT_PATH, FRONTEND_ENTRY_FILE));
});

// ####################################################################################

app.post("/api/append-chat", express.json({ limit: "10mb" }), async (reqIn: Request, resIn: Response) => {
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

  if (!dataIn.textModelSlug || typeof dataIn.textModelSlug !== "string") {
    return resIn.status(400).json({
      message: "Missing or malformed `textModelSlug` property",
    });
  }

  if (!dataIn.imageModelSlug || typeof dataIn.imageModelSlug !== "string") {
    return resIn.status(400).json({
      message: "Missing or malformed `imageModelSlug` property",
    });
  }

  if (!dataIn.apiKey || typeof dataIn.apiKey !== "string") {
    return resIn.status(400).json({
      message: "Missing or malformed `apiKey` property",
    });
  }

  if (dataIn.images && !Array.isArray(dataIn.images)) {
    return resIn.status(400).json({
      message: "Malformed `images` property",
    });
  }

  if (!DB.doesChatExist(dataIn.chatName)) {
    return resIn.status(400).json({
      message: `Provided Chat doesn't exist: ${dataIn.chatName}`,
    });
  }

  if (activeChatNames.has(dataIn.chatName)) {
    return resIn.status(400).json({
      message: `Chat is currently active and locked: ${dataIn.chatName}`,
    });
  }

  activeChatNames.add(dataIn.chatName);

  resIn.setHeader("Content-Type", "text/event-stream");
  resIn.setHeader("Cache-Control", "no-cache");
  resIn.setHeader("Connection", "keep-alive");
  resIn.flushHeaders();

  const chatDataIn = DB.getChat(dataIn.chatName);
  const currentDirectoryIn = chatDataIn?.currentDirectory ?? "./";
  const currentMessageHistory: HistoryMsg[] = DB.getMessages(dataIn.chatName) ?? [];

  // use SSE to send a `DisplayMsg` in response every time the robot produces a message + initial user submitted message
  const appendMsg = (msgIn: HistoryMsg) => {
    const appendRes = DB.appendMessageToChat(dataIn.chatName, msgIn);
    if (appendRes instanceof Error) {
      throw appendRes;
    }

    // newline delimited JSON stream messages
    resIn.write(JSON.stringify({
      content: msgIn.content ?? "",
      role: msgIn.role,
      toolName: msgIn.name,
    }) + "\n");

    currentMessageHistory.push(msgIn);
  };

  // handle early client drop
  const cancelResponseBoxed = [false];
  resIn.on("close", () => {
    console.log(` >> Client at chat \`${dataIn.chatName}\` disconnected`);
    cancelResponseBoxed[0] = true;
  });

  try {
    if (currentMessageHistory.length === 0) {
      appendMsg({
        content: chatDataIn?.systemPrompt ?? "",
        role: "system",
      });
    }

    appendMsg({
      content: dataIn.message,
      role: "user",
    });

    const agenticLoopRes = await AI.agenticLoopRespond(
      cancelResponseBoxed as [boolean],
      dataIn.textModelSlug,
      dataIn.imageModelSlug,
      dataIn.images,
      dataIn.apiKey,
      currentDirectoryIn,
      currentMessageHistory,
      appendMsg,
    );

    if (agenticLoopRes instanceof Error) {
      throw agenticLoopRes;
    }
  }
  catch (errorIn: any) {
    if (!resIn.writableEnded) {
      resIn.write(JSON.stringify({
        content: `Error occurred while appending a message: ${errorIn}`,
        role: "system",
      }) + "\n");
    }
  }
  finally {
    if (!resIn.writableEnded) {
      console.log(` >> Client at chat \`${dataIn.chatName}\` cleanly closed connection`);
      resIn.end();
    }
    activeChatNames.delete(dataIn.chatName);
  }
});

// this affects all routes below this
app.use(express.json());

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
    selectedTextModel: "openrouter/free",
    selectedImageModel: "openrouter/free",
  });

  if (addRes instanceof Error) {
    return resIn.status(500).json({
      message: `Error occurred while creating a new Chat: ${addRes}`,
    });
  }

  resIn.sendStatus(201);
});

app.post("/api/set-chat-current-directory/:nameIn", (reqIn: Request, resIn: Response) => {
  const dataIn = reqIn.body;

  if (!dataIn.currentDirectoryIn || typeof dataIn.currentDirectoryIn !== "string") {
    return resIn.status(400).json({
      message: "Missing or malformed `currentDirectoryIn` property",
    });
  }

  const nameIn = reqIn.params.nameIn as string;
  const currentDirectoryIn = dataIn.currentDirectoryIn;

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

app.post("/api/set-chat-selected-text-model/:nameIn", (reqIn: Request, resIn: Response) => {
  const dataIn = reqIn.body;

  if (!dataIn.selectedModelIn || typeof dataIn.selectedModelIn !== "string") {
    return resIn.status(400).json({
      message: "Missing or malformed `selectedModelIn` property",
    });
  }

  const nameIn = reqIn.params.nameIn as string;
  const selectedModelIn = dataIn.selectedModelIn;

  console.log(` >> Received selected model: ${selectedModelIn} for ${nameIn}`);

  if (!DB.doesChatExist(nameIn)) {
    return resIn.status(400).json({
      message: `Provided Chat doesn't exist: ${nameIn}`,
    });
  }

  const setSelectedModelRes = DB.setChatSelectedTextModel(nameIn, selectedModelIn);
  if (setSelectedModelRes instanceof Error) {
    return resIn.status(500).json({
      message: `Error occurred while setting selected model: ${setSelectedModelRes}`,
    });
  }

  resIn.status(201).json(selectedModelIn);
});

app.post("/api/set-chat-selected-image-model/:nameIn", (reqIn: Request, resIn: Response) => {
  const dataIn = reqIn.body;

  if (!dataIn.selectedModelIn || typeof dataIn.selectedModelIn !== "string") {
    return resIn.status(400).json({
      message: "Missing or malformed `selectedModelIn` property",
    });
  }

  const nameIn = reqIn.params.nameIn as string;
  const selectedModelIn = dataIn.selectedModelIn;

  console.log(` >> Received selected model: ${selectedModelIn} for ${nameIn}`);

  if (!DB.doesChatExist(nameIn)) {
    return resIn.status(400).json({
      message: `Provided Chat doesn't exist: ${nameIn}`,
    });
  }

  const setSelectedModelRes = DB.setChatSelectedImageModel(nameIn, selectedModelIn);
  if (setSelectedModelRes instanceof Error) {
    return resIn.status(500).json({
      message: `Error occurred while setting selected model: ${setSelectedModelRes}`,
    });
  }

  resIn.status(201).json(selectedModelIn);
});

app.get("/api/get-chat-names", (reqIn: Request, resIn: Response) => {
  resIn.json(DB.getChatNames());
});

app.get("/api/get-chat-exists/:nameIn", (reqIn: Request, resIn: Response) => {
  const nameIn = reqIn.params.nameIn as string;
  resIn.json(DB.doesChatExist(nameIn));
});

app.get("/api/get-chat/:nameIn", (reqIn: Request, resIn: Response) => {
  const nameIn = reqIn.params.nameIn as string;
  // can be `undefined` if `nameIn` is not a valid Chat name
  resIn.json(DB.getChat(nameIn));
});

// app.get("/api/get-chat-current-directory/:nameIn", (reqIn: Request, resIn: Response) => {
//   const nameIn = reqIn.params.nameIn as string;
//   // can be `undefined` if `nameIn` is not a valid Chat name
//   resIn.json(DB.getChat(nameIn)?.currentDirectory);
// });

// app.get("/api/get-chat-system-prompt/:nameIn", (reqIn: Request, resIn: Response) => {
//   const nameIn = reqIn.params.nameIn as string;
//   // can be `undefined` if `nameIn` is not a valid Chat name
//   resIn.json(DB.getChat(nameIn)?.systemPrompt);
// });

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
