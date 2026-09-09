export const TOOL_CALL_WAIT_MS = 1000;

export type DocEntry = {
  name: string;
  url: string;
};

export type JSONSchemaProperty = {
  type: "string" | "number" | "integer" | "boolean" | "object" | "array" | "null";
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

export type ToolDefinition = {
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

export const TOOLS: Record<string, (...args: any[]) => any> = {
  // docListToString: docListToString,
  getDocHeaders: getDocHeaders,
  getDocHeaderContent: getDocHeaderContent,
  getFooBar: getFooBar,
  getBankStatements: getBankStatements,
  // validateResponse: validateResponse,
};

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  // UI TOOLS
  {
    type: "function",
    function: {
      name: "getDocList",
      description: "Retrieves the user supplied document entries (document name and document URL) from the UI",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  // {
  //   type: "function",
  //   function: {
  //     name: "docListToString",
  //     description: "Gets the document names and url provided as a single string",
  //     parameters: {
  //       type: "object",
  //       properties: {
  //         docListIn: {
  //           type: "array",
  //           description: "DocEntries to convert into a string",
  //           items: {
  //             type: "object",
  //             properties: {
  //               name: { type: "string", description: "Human readable name of this document" },
  //               url: { type: "string", description: "API endpoint for reading this document" },
  //             },
  //             required: ["name", "url"],
  //           }
  //         }
  //       },
  //       required: ["docListIn"],
  //     }
  //   }
  // },
  // BACKEND TOOLS
  {
    type: "function",
    function: {
      name: "getDocHeaders",
      description: "Gets all the headers available in this document",
      parameters: {
        type: "object",
        properties: {
          urlIn: {
            type: "string",
            description: "URL of the document to get headers of",
          }
        },
        required: ["urlIn"],
      }
    }
  },
  {
    type: "function",
    function: {
      name: "getDocHeaderContent",
      description: "Gets the string content associated with this header at this URL",
      parameters: {
        type: "object",
        properties: {
          urlIn: {
            type: "string",
            description: "URL of the document to get the header content from",
          },
          headerIn: {
            type: "string",
            description: "Header to get the content from",
          },
        },
        required: ["urlIn", "headerIn"],
      }
    }
  },
  {
    type: "function",
    function: {
      name: "getFooBar",
      description: "Read the FooBar file",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      }
    }
  },
  {
    type: "function",
    function: {
      name: "getBankStatements",
      description: "Gets bank information at this date with this many rows ahead and behind that date",
      parameters: {
        type: "object",
        properties: {
          dateIn: {
            type: "string",
            description: "ISO-8601 date to target",
          },
          rowsScanAhead: {
            type: "number",
            description: "Rows to scan ahead of the dateIn",
          },
          rowsScanBehind: {
            type: "number",
            description: "Rows to scan behind of the dateIn",
          },
        },
        required: ["dateIn", "rowsScanAhead", "rowsScanBehind"],
      }
    }
  },
  // {
  //   type: "function",
  //   function: {
  //     name: "validateResponse",
  //     description: "Tells whether this response passes or not",
  //     parameters: {
  //       type: "object",
  //       properties: {
  //         responseIn: {
  //           type: "string",
  //           description: "Response to check whether it passes or not",
  //         }
  //       },
  //       required: ["responseIn"],
  //     }
  //   }
  // },
];

// function docListToString(
//   { docListIn }: { docListIn: DocEntry[]; }
// ): string {
//   return JSON.stringify(docListIn);
// }

let docAuthToken = "";

export function getDocAuthToken(): string {
  return docAuthToken;
}

export function setDocAuthToken(authTokenIn: string) {
  docAuthToken = authTokenIn;
}

const DOC_ID_REGEX = /\/d\/([a-zA-Z0-9-_]{25,})(?:\/|\?|$)/;

function _extractDocId(urlIn: string): string {
  const regexMatch = urlIn.match(DOC_ID_REGEX);
  return regexMatch ? regexMatch[1] : "";
}

// make GET request to proper google docs endpoint
//   docs will be supplied by user
// returns the JS object of the response
async function _getDocRaw(authTokenIn: string, docIdIn: string): Promise<any> {
  const apiUrl = `https://docs.googleapis.com/v1/documents/${docIdIn}`;
  const apiResponse = await fetch(apiUrl, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${authTokenIn}`,
      "Accept": "application/json",
    },
  });

  if (!apiResponse.ok) {
    throw new Error(`API query error: ${apiResponse.status} :: ${apiResponse.statusText}`);
  }

  return await apiResponse.json();
}

async function getDocHeaders(
  { urlIn }: { urlIn: string; }
): Promise<string> {
  const foundHeaders: string[] = [];
  const docId = _extractDocId(urlIn);
  const docRawContent = await _getDocRaw(docAuthToken, docId);

  for (const curElem of docRawContent.body.content) {
    if (curElem.paragraph?.paragraphStyle?.namedStyleType?.startsWith('HEADING_')) {
      const text = curElem.paragraph.elements ? curElem.paragraph.elements.map((e: any) => e.textRun?.content || "").join("").trim()
                                              : "";
      if (text) {
        foundHeaders.push(text);
      }
    }
  }

  return JSON.stringify(foundHeaders);
}

async function getDocHeaderContent(
  { urlIn, headerIn }: {
    urlIn: string;
    headerIn: string;
  }
): Promise<string> {
  const docId = _extractDocId(urlIn);
  const docRawContent = await _getDocRaw(docAuthToken, docId);

  let capturing = false;
  let targetHeadingStyle: string | null = null;
  const extractedText: string[] = [];

  for (const curElem of docRawContent.body.content) {
    if (!curElem.paragraph) {
      continue;
    }

    const curStyle = curElem.paragraph.paragraphStyle?.namedStyleType;

    if (curStyle?.startsWith("HEADING_")) {
      const text = curElem.paragraph.elements ? curElem.paragraph.elements.map((e: any) => e.textRun?.content || "").join("").trim()
                                              : "";
      if (capturing) {
        if (curStyle === "TITLE" || curStyle === "SUBTITLE" || curStyle <= targetHeadingStyle!) {
          break;
        }
      }
      else if (text === headerIn) {
        capturing = true;
        targetHeadingStyle = curStyle;
        continue;
      }
    }

    if (capturing && curElem.paragraph.elements) {
      extractedText.push(curElem.paragraph.elements.map((e: any) => e.textRun?.content || "").join(""));
    }
  }

  return extractedText.join("");
}

// make a GET request to the `/foobar.txt`
async function getFooBar(): Promise<string> {
  return fetch("./foobar.txt").then(res => res.text());
}

// ???????
async function getBankStatements(
  { dateIn, rowsScanAhead, rowsScanBehind }: {
    dateIn: string; // ISO-8601 string
    rowsScanAhead: number;
    rowsScanBehind: number;
  }
): Promise<string> {
  return `you have ${(Math.random() * 1738).toFixed(2)} dollars`;
}

// if this response contains the letters from the file `/hmm.txt`, then return [false, <invalid-reason-string>]
// else, return [true, ""]
export async function validateResponse(responseIn: string): Promise<[boolean, string]> {
  const lettersStr = await fetch("./hmm.txt").then(res => res.text());
  const checkStrs = lettersStr.split(/\r?\n/)
                              .filter(str => str !== "");
  const strsFound: string[] = [];

  const valid = !checkStrs.some(curCheckStr => {
    const res = responseIn.includes(curCheckStr);
    if (res) {
      strsFound.push(curCheckStr);
    }
    return res;
  });

  if (valid) {
    return [valid, ""];
  } else {
    return [valid, `Invalid response, it contains these strings: ${JSON.stringify(strsFound)}`];
  }
}
