export default {
  zh: {
    mu: {
      redirectFailed: '重定向失败',
      chunkRangeMismatch: '分块区间不符(请求 {start}-{end}, 返回 {cr})',
      chunkStalled: '分块下载停滞',
      chunkOverflow: '分块数据超量({got}/{expected})',
      chunkLengthMismatch: '分块长度不符({got}/{expected})',
      chunkTimeout: '分块下载超时',
      chunkRetryFailed: '分块 {i} 重试后仍失败',
      requestTimeout: '请求超时（请检查网络连接）',
      forceCancelAll: '强制取消所有下载',
      redirectDisabled: '遇到重定向 {status} 但已禁用跟随',
      downloadFailedPrefix: '下载失败，',
      downloadFailed: '下载失败',
      downloadPaused: '下载已暂停',
      downloadStalled: '下载停滞（网络可能已断开）',
      sha1Mismatch: 'SHA-1 校验失败（期望 {expected}，实际 {actual}）',
      readFailed: '读取失败'
    }
  },
  en: {
    mu: {
      redirectFailed: 'Redirect failed',
      chunkRangeMismatch: 'Chunk range mismatch (requested {start}-{end}, got {cr})',
      chunkStalled: 'Chunk download stalled',
      chunkOverflow: 'Chunk data overflow ({got}/{expected})',
      chunkLengthMismatch: 'Chunk length mismatch ({got}/{expected})',
      chunkTimeout: 'Chunk download timed out',
      chunkRetryFailed: 'Chunk {i} still failed after retries',
      requestTimeout: 'Request timed out (please check your network connection)',
      forceCancelAll: 'Force-cancelled all downloads',
      redirectDisabled: 'Encountered redirect {status} but following is disabled',
      downloadFailedPrefix: 'Download failed, ',
      downloadFailed: 'Download failed',
      downloadPaused: 'Download paused',
      downloadStalled: 'Download stalled (network may be disconnected)',
      sha1Mismatch: 'SHA-1 verification failed (expected {expected}, actual {actual})',
      readFailed: 'read failed'
    }
  }
}
