// Vitest 全局 setup。
//
// 提供 node 环境下的 localStorage polyfill（utils/store 测试依赖）。
// 每个测试用例之间通过 beforeEach 自动 clear，避免相互污染。
//
// 注意：不要在此处注册业务 mock，避免污染所有测试。
// 需要时在每个测试文件内通过 vi.spyOn / vi.mock 局部 mock。

// —— localStorage polyfill ——
type LocalStorageLike = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  clear(): void
  key(index: number): string | null
  readonly length: number
}

function createLocalStorage(): LocalStorageLike {
  const store = new Map<string, string>()
  return {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => {
      store.set(k, String(v))
    },
    removeItem: (k) => {
      store.delete(k)
    },
    clear: () => store.clear(),
    key: (i) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size
    },
  }
}

const existing = (globalThis as { localStorage?: LocalStorageLike }).localStorage
if (!existing) {
  Object.defineProperty(globalThis, 'localStorage', {
    value: createLocalStorage(),
    configurable: true,
    writable: true,
  })
}

// 暴露重置函数供测试用例调用
export function __resetLocalStorage() {
  ;(globalThis as { localStorage: LocalStorageLike }).localStorage = createLocalStorage()
}
