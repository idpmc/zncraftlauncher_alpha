// 各功能分片的语言包集合（每个分片导出 { zh, en }）
import toolbox from './toolbox'
import mods from './mods'
import network from './network'
import home from './home'
import settings from './settings'
import account from './account'
import runtime from './runtime'

export const parts = [toolbox, mods, network, home, settings, account, runtime]
