import { rt } from '../../shared/rt'

// 把运行时消息（主进程/store 共用）暴露给 vue-i18n，键为 rt.<ns>.<key>
export default {
  zh: { rt: rt.zh },
  en: { rt: rt.en }
}
