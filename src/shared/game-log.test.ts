/**
 * src/shared/game-log.ts 的单元测试
 * 运行：npm test（node --test，Node 22.18+ 直接跑 TS，无需编译）
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyGameStderr,
  detectGameErrorHint,
  nativeExitCodeHintKey,
  createGameLogDecoder,
  splitLogLines
} from './game-log.ts'

describe('classifyGameStderr：stderr 片段 -> 日志级别', () => {
  test('普通输出是 info', () => {
    assert.equal(classifyGameStderr('[Render thread/INFO]: Done (5.0s)! For help, type "help"'), 'info')
    assert.equal(classifyGameStderr('正在下载资源 12/100'), 'info')
    assert.equal(classifyGameStderr(''), 'info')
  })

  test('WARN / WARNING 是 warn', () => {
    assert.equal(classifyGameStderr('[Render thread/WARN]: Texture missing!'), 'warn')
    assert.equal(classifyGameStderr('WARNING: A terminally deprecated JVM option was used'), 'warn')
  })

  test('Java 异常堆栈是 error', () => {
    assert.equal(
      classifyGameStderr('Exception in thread "main" java.lang.NullPointerException'),
      'error'
    )
    assert.equal(classifyGameStderr('java.lang.NoClassDefFoundError: net/minecraft/client/main/Main'), 'error')
    assert.equal(classifyGameStderr('ERROR: Could not reserve enough space'), 'error')
    assert.equal(classifyGameStderr('Error: LinkageError, unsupported class version'), 'error')
    assert.equal(classifyGameStderr('FATAL: out of disk'), 'error')
    assert.equal(classifyGameStderr('Failed to start the game'), 'error')
  })

  test('大写 ERROR 需要和 java. 同时出现才算 error', () => {
    assert.equal(classifyGameStderr('unexpected ERROR while reading java.lang.Class'), 'error')
    // 只有 ERROR 字样、没有 java. 且没有 ERROR: → 不算 error（保持原逻辑）
    assert.equal(classifyGameStderr('ERROR happened'), 'info')
  })

  test('异常关键字优先于 WARN（堆栈里同时出现两者时判 error）', () => {
    assert.equal(classifyGameStderr('WARN ... then java.lang.RuntimeException at java.base'), 'error')
  })
})

describe('detectGameErrorHint：stderr -> 提示 key', () => {
  test('逐条命中', () => {
    assert.equal(
      detectGameErrorHint('java.lang.UnsupportedClassVersionError: net/minecraft/client/main/Main (compiled by 61.0)'),
      'mc.hintJavaVersion'
    )
    assert.equal(detectGameErrorHint('java.lang.ClassNotFoundException: net.minecraft.client.main.Main'), 'mc.hintMissingLibs')
    assert.equal(detectGameErrorHint('java.lang.NoClassDefFoundError: cpw/mods/bootstraplauncher'), 'mc.hintMissingLibs')
    assert.equal(detectGameErrorHint('java.lang.OutOfMemoryError: Java heap space'), 'mc.hintOutOfMemory')
    assert.equal(detectGameErrorHint('Caused by: org.lwjgl.LWJGLException: Pixel format not accelerated'), 'mc.hintLwjgl')
    assert.equal(
      detectGameErrorHint('Error: Could not find or load main class net.minecraft.client.main.Main'),
      'mc.hintMainClass'
    )
    assert.equal(detectGameErrorHint('java.security.AccessControlException: access denied'), 'mc.hintSecurity')
    assert.equal(detectGameErrorHint('java.lang.SecurityException: no permission'), 'mc.hintSecurity')
    assert.equal(detectGameErrorHint('java.lang.IllegalStateException: broken'), 'mc.hintRuntime')
    assert.equal(detectGameErrorHint('java.lang.RuntimeException: unexpected'), 'mc.hintRuntime')
  })

  test('顺序：Java 版本不匹配优先于更宽泛的运行时异常', () => {
    const stderr =
      'java.lang.UnsupportedClassVersionError: Foo (compiled by 65.0)\n' +
      'Caused by: java.lang.RuntimeException: wrapper'
    assert.equal(detectGameErrorHint(stderr), 'mc.hintJavaVersion')
  })

  test('顺序：缺少类优先于 OOM（NoClassDefFoundError 里也可能带 OOM 字样）', () => {
    const stderr = 'java.lang.NoClassDefFoundError: a/b/C\nCaused by: java.lang.OutOfMemoryError: Java heap space'
    assert.equal(detectGameErrorHint(stderr), 'mc.hintMissingLibs')
  })

  test('识别不了的错误返回 null（由调用方展示原始输出）', () => {
    assert.equal(detectGameErrorHint('some random failure'), null)
    assert.equal(detectGameErrorHint(''), null)
  })
})

describe('nativeExitCodeHintKey：Windows 原生退出码 -> 提示 key', () => {
  test('有符号 / 无符号两种形式等价', () => {
    assert.equal(nativeExitCodeHintKey(3221225477), 'mc.nativeAccessViolation')
    assert.equal(nativeExitCodeHintKey(-1073741819), 'mc.nativeAccessViolation') // 0xC0000005
  })

  test('全部已知退出码', () => {
    assert.equal(nativeExitCodeHintKey(3221225725), 'mc.nativeStackOverflow') // 0xC00000FD
    assert.equal(nativeExitCodeHintKey(3221226505), 'mc.nativeStackBufferOverrun') // 0xC0000409
    assert.equal(nativeExitCodeHintKey(3221225781), 'mc.nativeMissingDll') // 0xC0000135
    assert.equal(nativeExitCodeHintKey(3221225794), 'mc.nativeDllInitFailed') // 0xC0000142
    assert.equal(nativeExitCodeHintKey(3221226356), 'mc.nativeHeapCorruption') // 0xC0000374
  })

  test('正常退出 / 未知码 / 无退出码都返回 null', () => {
    assert.equal(nativeExitCodeHintKey(0), null)
    assert.equal(nativeExitCodeHintKey(1), null)
    assert.equal(nativeExitCodeHintKey(null), null)
    assert.equal(nativeExitCodeHintKey(undefined), null)
  })
})

describe('createGameLogDecoder：字节块 -> 文本', () => {
  const encoder = new TextEncoder()

  test('多字节字符被切在两个 chunk 中间时不产生乱码', () => {
    const decode = createGameLogDecoder()
    const bytes = encoder.encode('[Main] 加载了 3 个库文件')
    const cut = 12 // 落在中文字符的字节中间
    const result = decode(bytes.slice(0, cut)) + decode(bytes.slice(cut))
    assert.equal(result, '[Main] 加载了 3 个库文件')
    assert.ok(!result.includes('\uFFFD'), '不应出现替换字符')
  })

  test('逐字节喂入也正确', () => {
    const decode = createGameLogDecoder()
    const text = '中文乱码测试 ✅ Minecraft'
    const bytes = encoder.encode(text)
    let out = ''
    for (const b of bytes) out += decode(new Uint8Array([b]))
    assert.equal(out, text)
  })

  test('字符串输入原样返回', () => {
    const decode = createGameLogDecoder()
    assert.equal(decode('plain text'), 'plain text')
  })

  test('两个 decoder 实例互不干扰（stdout / stderr 各用一个）', () => {
    const decodeOut = createGameLogDecoder()
    const decodeErr = createGameLogDecoder()
    const bytes = encoder.encode('中文')
    assert.equal(decodeOut(bytes.slice(0, 4)), '中') // 故意留半截
    assert.equal(decodeErr(bytes), '中文') // 另一个实例不受影响
    assert.equal(decodeOut(bytes.slice(4)), '文') // 半截和下一块拼回原字
  })
})

describe('splitLogLines：日志块 -> 行', () => {
  test('去掉空行并 trim，CRLF/LF 都支持', () => {
    assert.deepEqual(splitLogLines('a\r\n b \n\n\tc\t\n'), ['a', 'b', 'c'])
    assert.deepEqual(splitLogLines(''), [])
    assert.deepEqual(splitLogLines('\n\n  \n'), [])
  })
})
