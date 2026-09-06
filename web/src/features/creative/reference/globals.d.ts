/*
 * 参考项目原本由 Vite 注入的构建时全局变量。
 * NewAPI 构建环境未定义它们时，组件会使用安全的运行时回退值。
 */
declare const __APP_VERSION__: string
declare const __DEV_PROXY_CONFIG__: unknown
