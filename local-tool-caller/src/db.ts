// TABLE NAME:
//   chats
//
// TABLE SCHEMA:
//   id INTEGER NOT NULL PRIMARY KEY
//   name TEXT NOT NULL UNIQUE CHECK(length(name) <= 25)
//   systemPrompt TEXT NOT NULL
//   currentDirectory TEXT
//   selectedTextModel TEXT NOT NULL DEFAULT 'openrouter/free'
//   selectedImageModel TEXT NOT NULL DEFAULT 'openrouter/free'

// TABLE NAME:
//   messages
//
// TABLE SCHEMA:
//   id INTEGER NOT NULL PRIMARY KEY
//   chatId INTEGER REFERENCES chats(id)
//   position INTEGER NOT NULL
//   content TEXT
//   role TEXT CHECK(role IN ('assistant', 'user', 'tool', 'system'))
//   toolCallId TEXT
//   toolCallName TEXT
//   toolCalls TEXT CHECK(toolCalls IS NULL OR json_valid(toolCalls))

import SQLite from "better-sqlite3";
import { getRelPath } from "./util";

export type HistoryMsg = {
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
  selectedTextModel: string;
  selectedImageModel: string;
};

const sqlDB = SQLite(getRelPath("..", "db", "data.db"));

const READ_CHAT_NAMES_STMT    = sqlDB.prepare("SELECT name FROM chats");
const DOES_CHAT_EXIST_STMT    = sqlDB.prepare("SELECT EXISTS(SELECT 1 FROM chats WHERE name = ? LIMIT 1) AS doesExistOrNot");
const ADD_NEW_CHAT_STMT       = sqlDB.prepare("INSERT INTO chats (name, systemPrompt, currentDirectory, selectedTextModel, selectedTextModel) VALUES (?, ?, ?, ?, ?)");
const GET_CHAT_MSG_COUNT_STMT = sqlDB.prepare("SELECT COUNT(*) AS msgsCount FROM messages WHERE chatId = (SELECT id FROM chats WHERE name = ?)");
const APPEND_MSG_STMT         = sqlDB.prepare("INSERT INTO messages (chatId, position, content, role, toolCallId, toolCallName, toolCalls) VALUES ((SELECT id FROM chats WHERE name = ?), ?, ?, ?, ?, ?, ?)");
const SET_CHAT_CUR_DIR        = sqlDB.prepare("UPDATE chats SET currentDirectory = ? WHERE name = ?");
const SET_CHAR_SELECTED_TEXT_MODEL = sqlDB.prepare("UPDATE chats SET selectedTextModel = ? WHERE name = ?");
const SET_CHAR_SELECTED_IMAGE_MODEL = sqlDB.prepare("UPDATE chats SET selectedImageModel = ? WHERE name = ?");
const GET_CHAT                = sqlDB.prepare("SELECT name, systemPrompt, currentDirectory, selectedTextModel, selectedImageModel FROM chats WHERE name = ?");
const GET_CHAT_MSGS           = sqlDB.prepare("SELECT content, role, toolCallId, toolCallName, toolCalls FROM messages WHERE chatId = (SELECT id FROM chats WHERE name = ?) ORDER BY position ASC");

export function getChatNames(): string[] {
  try {
    return READ_CHAT_NAMES_STMT.all()
            .map((curRow: any) => curRow.name);
  } catch (errorIn: any) {
    return [];
  }
}

export function doesChatExist(chatNameIn: string): boolean {
  try {
    const { doesExistOrNot } = (DOES_CHAT_EXIST_STMT.get(chatNameIn) as any) ?? { doesExistOrNot: 0 };
    return doesExistOrNot !== 0;
  } catch (errorIn: any) {
    return false;
  }
}

// returns `true` if `chatIn` was successfully added to the DB
//         or an Error if not
export function addNewChat(chatIn: Chat): Error | true {
  try {
    ADD_NEW_CHAT_STMT.run(chatIn.name, chatIn.systemPrompt, chatIn.currentDirectory, chatIn.selectedTextModel, chatIn.selectedTextModel);
    return true;
  } catch (errorIn: any) {
    return errorIn;
  }
}

// returns `true` if `msgIn` was successfully appended to Chat `chatNameIn`
//         or an Error if not
export function appendMessageToChat(chatNameIn: string, msgIn: HistoryMsg): Error | true {
  try {
    const { msgsCount } = (GET_CHAT_MSG_COUNT_STMT.get(chatNameIn) as any) ?? { msgsCount: 0 };
    APPEND_MSG_STMT.run(chatNameIn, msgsCount,
                        msgIn.content, msgIn.role, msgIn.tool_call_id, msgIn.name, JSON.stringify(msgIn.tool_calls));
    return true;
  } catch (errorIn: any) {
    return errorIn;
  }
}

// return `true` if Chat `chatNameIn` successfully has its `currentDirectory` changed to `currentDirectoryIn`
//        or an Error if not
export function setChatCurrentDirectory(chatNameIn: string, currentDirectoryIn: string): Error | true {
  try {
    SET_CHAT_CUR_DIR.run(currentDirectoryIn, chatNameIn);
    return true;
  } catch (errorIn: any) {
    return errorIn;
  }
}

// return `true` if Chat `chatNameIn` successfully has its `selectedTextModel` changed to `selectedModelIn`
//        or an Error if not
export function setChatSelectedTextModel(chatNameIn: string, selectedModelIn: string): Error | true {
  try {
    SET_CHAR_SELECTED_TEXT_MODEL.run(selectedModelIn, chatNameIn);
    return true;
  } catch (errorIn: any) {
    return errorIn;
  }
}

// return `true` if Chat `chatNameIn` successfully has its `selectedImageModel` changed to `selectedModelIn`
//        or an Error if not
export function setChatSelectedImageModel(chatNameIn: string, selectedModelIn: string): Error | true {
  try {
    SET_CHAR_SELECTED_IMAGE_MODEL.run(selectedModelIn, chatNameIn);
    return true;
  } catch (errorIn: any) {
    return errorIn;
  }
}

// note: the `Chat` object returned will have **no** `messages`
//       use `getMessages` to get the messages
export function getChat(chatNameIn: string): Chat | null {
  try {
    const getRes = GET_CHAT.get(chatNameIn) as any;
    if (!getRes) {
      return null;
    }

    return {
      name: getRes.name,
      systemPrompt: getRes.systemPrompt,
      currentDirectory: getRes.currentDirectory,
      selectedTextModel: getRes.selectedTextModel,
      selectedImageModel: getRes.selectedImageModel,
      messages: [],
    };
  } catch (errorIn: any) {
    return null;
  }
}

export function getMessages(chatNameIn: string): HistoryMsg[] | null {
  try {
    return GET_CHAT_MSGS.all(chatNameIn)
             .map((curRow: any) => ({
               content: curRow.content,
               role: curRow.role,
               ...(curRow.toolCallId && {
                 tool_call_id: curRow.toolCallId,
               }),
               ...(curRow.toolCallName && {
                 name: curRow.toolCallName,
               }),
               ...(curRow.toolCalls && {
                 tool_calls: JSON.parse(curRow.toolCalls),
               }),
             }));
  } catch (errorIn: any) {
    return null;
  }
}
