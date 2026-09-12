import * as FS from "node:fs/promises";
import path from "path";

// all functions here must take in a `currentDirectoryIn` string as the first arg
// and an optional robot supplied argument object as the second arg
export async function listFiles(
  currentDirectoryIn: string,
  // if `dirRelPathIn` is `null`:
  //   read the files from the current directory
  // else:
  //   read from the `currentDirectoryIn` path joined with `dirRelPathIn`
  { dirRelPathIn }: { dirRelPathIn: string | null; },
): Promise<string> {
  return JSON.stringify(await FS.readdir(dirRelPathIn ? path.join(currentDirectoryIn, dirRelPathIn!)
                                                      : currentDirectoryIn,
                                         { withFileTypes: true }));
}

export async function readFile(
  currentDirectoryIn: string,
  { fileRelPathIn }: { fileRelPathIn: string; },
): Promise<string> {
  return await FS.readFile(path.join(currentDirectoryIn, fileRelPathIn), "utf8");
}

export async function grep(
  currentDirectoryIn: string,
  // if `targetRelPathIn` is `null`:
  //   read the files from the current directory
  // else:
  //   read from the `currentDirectoryIn` path joined with `targetRelPathIn`
  { regexIn, regexFlagsIn, targetRelPathIn }: {
    regexIn: string;
    regexFlagsIn: string | null;
    targetRelPathIn: string | null;
  },
): Promise<string> {
  try {
    const grepResults: string[] = [];
    const regex = new RegExp(regexIn, regexFlagsIn ?? undefined);
    const filesFound = await FS.readdir(targetRelPathIn ? path.join(currentDirectoryIn, targetRelPathIn!)
                                                        : currentDirectoryIn,
                                        { recursive: true, withFileTypes: true });

    for (const curFileEntry of filesFound) {
      if (!curFileEntry.isFile()) {
        continue;
      }

      const curDirPath = curFileEntry.parentPath;
      const curFullPath = path.join(curDirPath, curFileEntry.name);
      // relative to the `currentDirectoryIn`
      const curRelPath = path.relative(currentDirectoryIn, curFullPath);

      const curFileContent = await FS.readFile(curFullPath, "utf8");

      let curLineNum = 1;
      for (const curLine of curFileContent.split(/\r?\n/)) {
        if (regex.test(curLine)) {
          grepResults.push(`${curRelPath}:${curLineNum} ${curLine.trim()}`);
        }
        curLineNum++;
      }

    }
    return grepResults.join("\n");
  } catch (errorIn: any) {
    return `Error GREPing with regexIn: \`${regexIn}\``;
  }
}
