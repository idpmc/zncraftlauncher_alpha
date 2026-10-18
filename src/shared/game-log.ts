/**
 * 游戏进程日志解析（纯函数，放在 shared 供主进程与单元测试共用）
 *
 * 这里只做「文本 -> 结构化结果」的解析，不碰 Electron / i18n：
 *   - 分级：stderr 片段 -> info / warn / error（决定日志面板的颜色）
 *   - 错误提示：stderr 文本 -> i18n key（由 src/main/index.ts 翻译成用户文案）
 *   - 原生退出码：NTSTATUS 退出码 -> i18n key
 *   - 解码：stdout/stderr 字节块 -> 文本（处理多字节字符被切在两个 chunk 中间的情况）
 *
 * 单元测试：src/shared/game-log.test.ts（npm test，Node 内置 test runner）
 */

export type GameLogLevel = 'info' | 'warn' | 'error'

/** 启动失败的可操作提示，值为 locale key（mc.hint*），见 src/shared/rt/mainCore.ts */
export type GameErrorHintKey =
  | 'mc.hintJavaVersion'
  | 'mc.hintMissingLibs'
  | 'mc.hintOutOfMemory'
  | 'mc.hintLwjgl'
  | 'mc.hintMainClass'
  | 'mc.hintSecurity'
  | 'mc.hintRuntime'

/** Windows 原生退出码对应的提示，值为 locale key（mc.native*），见 src/shared/rt/mainCore.ts */
export type NativeExitHintKey =
  | 'mc.nativeAccessViolation'
  | 'mc.nativeStackOverflow'
  | 'mc.nativeStackBufferOverrun'
  | 'mc.nativeMissingDll'
  | 'mc.nativeDllInitFailed'
  | 'mc.nativeHeapCorruption'

/**
 * 判断游戏 stderr 片段的日志级别。
 * Java 异常堆栈 / FATAL / 启动失败字样视为 error，WARN 次之，其余都是 info。
 */
export function classifyGameStderr(output: string): GameLogLevel {
  const isRealError =
    output.includes('Exception') ||
    output.includes('ERROR:') ||
    output.includes('Error:') ||
    output.includes('FATAL') ||
    output.includes('Failed to') ||
    (output.includes('ERROR') && output.includes('java.'))
  if (isRealError) return 'error'
  if (output.includes('WARN') || output.includes('WARNING')) return 'warn'
  return 'info'
}

/**
 * 从启动失败的 stderr 里找出最可能的原因，返回 locale key。
 * 顺序有语义：更具体的错误（Java 版本不匹配）优先于更宽泛的（运行时异常）。
 * 匹配不到返回 null，调用方兜底展示原始错误输出。
 */
export function detectGameErrorHint(stderr: string): GameErrorHintKey | null {
  if (stderr.includes('UnsupportedClassVersionError')) return 'mc.hintJavaVersion'
  if (stderr.includes('NoClassDefFoundError') || stderr.includes('ClassNotFoundException')) return 'mc.hintMissingLibs'
  if (stderr.includes('OutOfMemoryError')) return 'mc.hintOutOfMemory'
  if (stderr.includes('LWJGL')) return 'mc.hintLwjgl'
  if (stderr.includes('Could not find or load main class')) return 'mc.hintMainClass'
  if (stderr.includes('AccessControlException') || stderr.includes('SecurityException')) return 'mc.hintSecurity'
  if (stderr.includes('IllegalStateException') || stderr.includes('RuntimeException')) return 'mc.hintRuntime'
  return null
}

const NATIVE_EXIT_HINTS: Record<number, NativeExitHintKey> = {
  3221225477: 'mc.nativeAccessViolation', // 0xC0000005 访问冲突
  3221225725: 'mc.nativeStackOverflow', // 0xC00000FD 栈溢出
  3221226505: 'mc.nativeStackBufferOverrun', // 0xC0000409 缓冲区溢出 / fail fast
  3221225781: 'mc.nativeMissingDll', // 0xC0000135 缺少 DLL
  3221225794: 'mc.nativeDllInitFailed', // 0xC0000142 DLL 初始化失败
  3221226356: 'mc.nativeHeapCorruption' // 0xC0000374 堆损坏
}

/**
 * Windows 原生退出码 -> locale key。
 * 0xC0000005 这类退出码通常没有 Java 异常堆栈（JVM/显卡驱动/LWJGL 在原生代码里出错），
 * 单独识别出来给用户可操作的提示。Node 在 Windows 上可能给有符号(-1073741819)或
 * 无符号(3221225477)形式，统一 >>> 0 归一化后查表。
 */
export function nativeExitCodeHintKey(code: number | null | undefined): NativeExitHintKey | null {
  if (code === null || code === undefined) return null
  const unsigned = code >>> 0
  return NATIVE_EXIT_HINTS[unsigned] ?? null
}

/**
 * 把 stdout/stderr 的字节块解码成文本。
 *
 * 存在的意义有两个：
 *   1. data 事件的 Buffer 可能在多字节 UTF-8 字符中间被切开（中文日志很常见），
 *      直接 data.toString() 会在切口处产生替换字符；TextDecoder(stream) 会把
 *      不完整的字节留到下一块再解。
 *   2. 配合 JVM 侧的 -Dstdout.encoding=UTF-8 / -Dstderr.encoding=UTF-8 使用，
 *      JDK 18+（JEP 400）下 stdout/stderr 默认用控制台原生编码（中文 Windows 是 GBK），
 *      不强制 UTF-8 的话解出来就是乱码。
 *
 * 每个流各建一个实例，stdout / stderr 不能共用。
 */
export function createGameLogDecoder(): (chunk: Uint8Array | string) => string {
  const decoder = new TextDecoder('utf-8')
  return (chunk: Uint8Array | string) =>
    typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true })
}

/** 按行切开一个日志块，去掉空白行并 trim，CRLF/LF 都支持 */
export function splitLogLines(text: string): string[] {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
}
