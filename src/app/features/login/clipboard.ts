/** Copies text; false when the browser refuses (no permission, insecure origin). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Saves text as a `.txt` file through a temporary link. */
export function downloadText(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  // Firefox starts the download after click() returns; revoke once it has.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
