# Git 使用说明（新手向）

> 本文件说明 ZNCraftLauncher 项目的 Git 版本控制用法。
> 所有命令都在项目根目录 `F:\zncl0.1.23\zncl1.0.0` 下执行。

---

## 一、Git 是什么

Git 是**代码存档系统**。就像游戏里的存档点：

- 每完成一段改动，就"存一次档"（`commit`）
- 改崩了，随时"读档"回到之前的状态
- 能查看"每次改动都改了哪些文件、哪些行"

好处：**不怕改坏、可回退、有历史记录**。

---

## 二、三个重要概念

| 概念 | 含义 |
|------|------|
| **工作区** | 你正在编辑的文件（当前电脑上的实际文件） |
| **暂存区** | 准备提交的改动的"购物车" |
| **本地仓库** | 已存档的历史记录（`.git` 目录里） |

基本流程：**改文件 → `add` 放入暂存区 → `commit` 存档**

---

## 三、日常常用命令

### 1. 查看状态（最常用）

```bash
git status
```

看到哪些文件被改了、哪些还没存档。

```bash
git status -s
```

精简显示（`M` = 修改，`??` = 新文件，`A` = 已暂存）。

---

### 2. 存档一次改动

```bash
git add -A
git commit -m "描述这次改了什么"
```

- `git add -A`：把所有改动放进"暂存区"（`-A` 表示全部）
- `git commit -m "..."`：正式存档，引号里写这次改了什么

> 💡 建议：**每完成一个完整小功能就存一次档**，别攒一大堆再存。
> 提交信息示例：`fix: 修复下载进度卡在 0% 的问题`

---

### 3. 查看历史存档

```bash
git log --oneline
```

一行一条，看到所有存档（提交号 + 说明）。

```bash
git log --oneline -10
```

只看最近 10 条。

---

### 4. 查看某次改动/某个文件的具体内容

```bash
# 看某次提交改了什么（提交号来自 git log）
git show 7c7eeaf

# 看当前还没存档的改动内容
git diff
```

---

### 5. 撤销 / 回退（救命操作）

```bash
# ⚠️ 丢弃所有"未存档"的改动，恢复到上次存档的状态（改动会永久丢失）
git checkout -- .

# 只丢弃某一个文件的改动
git checkout -- src/main/index.ts

# 已经 add 但还没 commit，想取消暂存
git restore --staged .
```

> ⚠️ 注意：`git checkout -- .` 会**永久丢弃**你还没存档的改动，用之前想清楚。
> 只要存过档（commit 过），就永远能找回来。

---

### 6. 回到过去某个存档（查看模式）

```bash
# 临时回到某个存档看代码（看完用下面的命令回来）
git checkout 7c7eeaf

# 回到最新状态
git checkout main
```

---

## 四、推荐使用习惯

1. **开工前先 `git status`**，心里有数
2. **改完一个功能就 commit 一次**，提交信息写清楚
3. **大改动前先 commit**，这样出问题能一键回退
4. 提交信息建议用前缀：
   - `feat:` 新功能
   - `fix:` 修复 bug
   - `chore:` 杂项（配置、依赖等）
   - `docs:` 文档
   - `refactor:` 重构

---

## 五、指定要存档的文件（进阶）

```bash
# 只存档某几个文件
git add src/main/index.ts src/stores/mods.ts
git commit -m "fix: 修复 Mod 列表刷新问题"

# 存档某个目录下的所有改动
git add src/components/
git commit -m "feat: 新增 xxx 面板"
```

---

## 六、当前仓库信息

- 仓库位置：`F:\zncl0.1.23\zncl1.0.0\.git`
- 主分支名：`main`
- 首次提交：`7c7eeaf  chore: 初始化仓库，存档 0.3.63-alpha 版本`

### 已排除（不纳入版本控制）的内容

见项目根目录 `.gitignore`，主要包括：

- `node_modules/`（依赖，可用 npm install 重新装）
- `build/`、`out/`、`dist/`、`release/`（编译/打包产物）
- `*.log`（日志）、`.history/`（编辑器历史）、`*.tsbuildinfo`（TS 缓存）等

---

## 七、常见问题

**Q：`git status` 提示 "not a git repository"？**
A：说明你不在项目目录下，先 `cd F:\zncl0.1.23\zncl1.0.0`。

**Q：新开的命令行窗口敲 `git` 提示找不到命令？**
A：重开一个命令行窗口即可（安装时已自动配置好环境变量）。

**Q：怕改坏，想先做个保险？**
A：改动前 `git add -A && git commit -m "存档"`，之后随时能 `git checkout -- .` 回来。

**Q：想备份到云端（GitHub / Gitee）？**
A：以后需要时再说，本地 Git 已经能覆盖绝大部分回退/历史需求。
