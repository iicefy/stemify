import { BrowserWindow, dialog, type MessageBoxOptions } from "electron";

/** A message box attached to `win` when there is one, free-standing otherwise. Resolves to the button index. */
export async function showMessage(win: BrowserWindow | null, options: MessageBoxOptions): Promise<number> {
  const { response } = win ? await dialog.showMessageBox(win, options) : await dialog.showMessageBox(options);
  return response;
}
