# 部署指南（同行复用照这个做）

本系统 = **前端单文件 `index.html`** + **Supabase 云端数据库**。
跟着下面四步，半小时就能搭起一套你自己公司的 ERP。

> 全程不用写代码，只需复制粘贴。

---

## 第一步：注册 Supabase，建云端数据库

Supabase 是免费的云数据库（带账号登录），用来存数据、多设备同步。

1. 打开 https://supabase.com → 用邮箱/GitHub 注册登录
2. 点 **New project**（新建项目）
   - Name：随便起，如 `my-textile-erp`
   - Database Password：设一个数据库密码（记下来，后面基本用不到）
   - Region：选离你近的（如 Singapore / Hong Kong）
3. 等项目创建完成（约 2 分钟）

### 1.1 建表（核心）

1. 左侧菜单点 **SQL Editor** → **New query**
2. 打开本仓库的 `supabase-schema.sql`，**全部内容复制**，粘贴进去 → 点 **Run**
3. 看到 `Success` 即建表完成

### 1.2 跑增量迁移脚本（按顺序）

主表建好后，依次把下面这些 `.sql` 文件内容粘进 SQL Editor 各跑一次
（每个都是 `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`，重复跑也安全）：

```
supabase-sync-fix-2026-05-25.sql              （字段修复 + 序列修复）
supabase-sync-missing-columns-2026-06-05.sql  （补字段）
supabase-ar-receipt-account-2026-06-05.sql    （对账收款账户字段）
supabase-app-users-2026-06-06.sql             （用户/角色表）
supabase-audit-logs-2026-06-07.sql            （操作日志表）
```

> 也可以只跑 `supabase-schema.sql`（已包含最新结构），上面的增量脚本是给
> 老版本升级用的。**全新部署只需第 1.1 步的 schema 即可。**

### 1.3 关闭邮箱验证（让你能自己建员工账号）

1. 左侧 **Authentication** → **Sign In / Providers**
2. 找到 **Confirm email** 开关，**关掉**（OFF）→ Save changes

这样管理员在系统里「用户管理」给员工设密码后，员工立刻能登录，无需收确认邮件。

---

## 第二步：拿到你的 Supabase 连接信息

1. Supabase 左下角 **Project Settings**（齿轮）→ **API**
2. 复制两个值：
   - **Project URL**（形如 `https://xxxxx.supabase.co`）
   - **anon / public key**（一长串，`Publishable` 那个）

---

## 第三步：把连接信息填进 index.html

用记事本/VSCode 打开 `index.html`，找到这两行（约第 985 行）：

```javascript
var SUPABASE_URL = 'https://upgudkwdnplzfylitqzq.supabase.co';
var SUPABASE_KEY = 'sb_publishable_TNSfUp_ax3UDKxTI9PV6hA_kCb0mbPY';
```

把等号右边换成**你自己**第二步复制的 URL 和 key，保存。

> ⚠️ 这两个值是公开的（anon key 设计上就允许暴露在前端），数据安全由
> Supabase 的行级安全策略（RLS）+ 系统的「用户名单拦截」共同保障。

---

## 第四步：部署前端

### 方式 A：Cloudflare Pages（推荐，免费有公网地址）

1. 打开 https://pages.cloudflare.com → 注册登录
2. **Create a project** → **Connect to Git**（把本仓库连上 GitHub）
   或 **Direct Upload**（直接拖 `index.html` 上传）
3. 部署完成会给你一个网址，如 `https://你的项目.pages.dev`
4. 手机/电脑浏览器打开这个网址即可使用

### 方式 B：本地直接用（不要公网）

直接双击 `index.html` 用浏览器打开即可。数据存本地 + 同步到你的 Supabase。

---

## 第五步：首次登录 + 建管理员账号

1. 第一次需要在 Supabase 建一个登录账号：
   - Supabase → **Authentication** → **Users** → **Add user** → **Create new user**
   - 填你的邮箱 + 密码，勾上 **Auto Confirm User** → Create
2. 用这个邮箱+密码登录系统
3. 进 **公司档案 → 👥 用户管理**：第一行就是你，角色设为「管理员」→ 保存
4. 进 **公司档案**：填上你公司的名称、地址、电话、Logo、银行账户、制单人 → 保存
   - 此后所有合同、送货单、对账单都会自动用你公司的信息

---

## 日常维护

| 事项 | 做法 |
|------|------|
| 加新员工 | 用户管理 → 新增员工 → 设密码 → 选角色 → 保存（不用再开 Supabase） |
| 数据备份 | 系统菜单「备份/恢复」→ 立即导出备份 → 存 U 盘（建议每周） |
| 多设备同步 | 写入实时上云；其它设备切回标签页自动拉取；或点工作台「强制全量同步」 |
| 升级版本 | 替换 `index.html`，重新部署即可（数据在云端，不受影响） |

---

## 常见问题

**Q：提示"数据库未升级/云端缺字段"？**
A：去 Supabase SQL Editor 跑一下对应的 `supabase-*.sql` 迁移脚本。系统也会
自动剥离缺失字段不阻断主业务，但跑了脚本最完整。

**Q：换了电脑登录看到旧数据？**
A：点工作台「🔄 强制全量同步」拉取云端最新。

**Q：员工登录提示"账号未被授权"？**
A：管理员在「用户管理」里加上该员工的登录邮箱并启用。

**Q：数据会丢吗？**
A：本地 localStorage + Supabase 云端双份，加每日自动快照。建议再定期
导出备份到 U 盘，三重保险。
