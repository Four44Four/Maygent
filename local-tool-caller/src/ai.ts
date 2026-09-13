import { type HistoryMsg } from "./db";
import * as Tools from "./tools";

type JSONSchemaTypeString = "string" | "number" | "integer" | "boolean" | "object" | "array" | "null";

type JSONSchemaProperty = {
  type: JSONSchemaTypeString | JSONSchemaTypeString[];
  description?: string;
  enum?: any[];
  default?: any;
  /** Required if type is 'object' */
  properties?: Record<string, JSONSchemaProperty>;
  /** Required if type is 'object' */
  required?: string[];
  /** Required if type is 'array' - defines the type of items inside the array */
  items?: JSONSchemaProperty;
};

type ToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, JSONSchemaProperty>;
      required: string[];
    };
  };
};

const TOOLS: Record<string, (...args: any[]) => any> = {
  listFiles: Tools.listFiles,
  readFile: Tools.readFile,
  grep: Tools.grep,
};

const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "listFiles",
      description: "Lists out the files in the current directory joined with an optional relative directory path, output includes the names of each file, and whether each file is a directory or a file or a symlink or a FIFO pipe or a socket",
      parameters: {
        type: "object",
        properties: {
          dirRelPathIn: {
            type: ["string", "null"],
            description: "The optional relative directory path to be appended to the current directory to specifically target a directory inside of the current directory, if left as `null`: the current directory will be targetted",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "readFile",
      description: "Reads the contents of a specific file, specified by its path relatived to the current directory",
      parameters: {
        type: "object",
        properties: {
          fileRelPathIn: {
            type: "string",
            description: "The path to the file to read, relative to the current directory",
          },
        },
        required: ["fileRelPathIn"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "grep",
      description: "Runs a regex search on file contents recursively with a root from the specified directory path relative to the current directory, or from the current directory if that directory path is `null` and collects all matching resulting lines in memory, results will have paths relative to the current directory, be careful to not pass a regex that matches too many lines as all matching lines have to be stored in memory",
      parameters: {
        type: "object",
        properties: {
          regexIn: {
            type: "string",
            description: "The regex to run on each found file's lines",
          },
          regexFlagsIn: {
            type: ["string", "null"],
            description: "Optional NodeJS specific Regexp flags string, \"g\" -> global search, \"i\" -> case insensitive search, \"m\" -> multi-line mode, \"s\" -> dot-all mode, \"v\" -> unicode support, \"y\" -> sticky search",
          },
          targetRelPathIn: {
            type: ["string", "null"],
            description: "Optional directory path relative to the current directory to target recursive GREP search at as the root directory",
          },
        },
        required: ["regexIn"],
      },
    },
  },
];

// returns the messages produced by running the tool calls in `msgIn`
async function processToolCalls(
  currentDirectoryIn: string,
  msgIn: HistoryMsg,
): Promise<HistoryMsg[]> {
  if (!msgIn.tool_calls) {
    return [];
  }

  const toolCallRetMsgs: HistoryMsg[] = [];

  for (const curToolCall of msgIn.tool_calls) {
    const functionName = curToolCall.function.name;
    const args = curToolCall.function.arguments;

    console.log(` >> Tool called: \`${functionName}\`, with args: \`${args}\``);

    try {
      if (TOOLS[functionName]) {
        toolCallRetMsgs.push({
          content: await TOOLS[functionName](currentDirectoryIn, JSON.parse(args)),
          role: "tool",
          tool_call_id: curToolCall.id,
          name: functionName,
        });
      } else {
        throw new Error(`${functionName} is not a valid tool`);
      }
    } catch (errorIn: any) {
      toolCallRetMsgs.push({
        content: JSON.stringify({ error: errorIn.message }),
        role: "tool",
        tool_call_id: curToolCall.id,
        name: functionName,
      });
    }
  }

  return toolCallRetMsgs;
}

async function sendMessageToRobot(
  modelSlugIn: string,
  apiKeyIn: string,
  messagesIn: HistoryMsg[],
  imagesBase64In?: string[],
): Promise<HistoryMsg | Error> {
  try {
    console.log(` >> Processing response with ${imagesBase64In ? "images" : "text"} robot...`);

    const httpRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKeyIn}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelSlugIn,
        messages: imagesBase64In ? [...messagesIn, {
                                     content: [
                                       {
                                         type: "text",
                                         text: "Use these images in the context of the last text-only user prompt",
                                       },
                                       ...imagesBase64In.map((curBase64: string) => ({
                                         type: "image_url",
                                         image_url: {
                                           url: curBase64,
                                         },
                                       }))
                                     ],
                                     role: "user",
                                   }]
                                 : messagesIn,
        tools: TOOL_DEFINITIONS,
        tool_choice: "auto",
        stream: false,
      }),
    });

    const robotResData = await httpRes.json();
    // console.log(` >> ${JSON.stringify(robotResData)}`);

    if (!httpRes.ok) {
      console.log(` >> Openrouter or smt errored: ${httpRes.status}: ${JSON.stringify(robotResData.error)}`);
      try {
        const errorMsg = robotResData.error?.message || `HTTP Code ${httpRes.status}`;
        throw new Error(`Openrouter error: ${errorMsg}`);
      } catch {
        throw new Error(`Http error: Code \`${httpRes.status}\`, Msg: \`${(await httpRes.text()) || httpRes.statusText}\``);
      }
    }

    const robotMsgData = robotResData.choices?.[0]?.message;

    return {
      content: robotMsgData?.content ?? null,
      role: "assistant",
      tool_calls: robotMsgData?.tool_calls ?? undefined,
    };
  }
  catch (errorIn: any) {
    return errorIn;
  }
}

export async function agenticLoopRespond(
  cancelResponseBoxed: [boolean], // this can be updated asynchronously to this function
  textModelSlugIn: string,
  imageModelSlugIn: string,
  imagesBase64In: string[],
  apiKeyIn: string,
  currentDirectoryIn: string,
  messagesIn: HistoryMsg[], // includes sent user prompt message, can be mutated as a side effect as robot messages are received by `appendMsgFnIn`
  appendMsgFnIn: (msgIn: HistoryMsg) => void, // should update anything that needs to be updated when a robot message is received
): Promise<Error | true> {
  let shouldProcessImagesFlag = imagesBase64In.length > 0;

  while (true) {
    console.log(" >> Agentic loop running...");

    // yield to nodejs event-loop to clear it out first
    await new Promise(resolve => setImmediate(resolve));

    const robotMsgRes = shouldProcessImagesFlag ? await sendMessageToRobot(imageModelSlugIn, apiKeyIn, messagesIn, imagesBase64In)
                                                : await sendMessageToRobot(textModelSlugIn, apiKeyIn, messagesIn, undefined);
    if (robotMsgRes instanceof Error) {
      return robotMsgRes;
    }

    // stop loop if we need to abort the response early
    if (cancelResponseBoxed[0]) {
      return true;
    }

    if (shouldProcessImagesFlag) {
      shouldProcessImagesFlag = false;
    }

    appendMsgFnIn(robotMsgRes);

    const toolCallMsgReses = await processToolCalls(currentDirectoryIn, robotMsgRes);

    if (toolCallMsgReses.length > 0) {
      for (const toolCallMsgRes of toolCallMsgReses) {
        appendMsgFnIn(toolCallMsgRes);
      }
      // don't stop loop after processing tool calls to give the robot at least 1 more loop to reflect on it
      // or it can keep looping if it ends up calling tools again on the next loop iteration
    }
    // stop loop if no tool calls
    else {
      return true;
    }
  }

  // we should never reach here...
}
