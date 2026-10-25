/** Whether `error` is Node's "no such file or directory". */
export function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
