# Dream Walkback

一个“梦境回放”第一人称原型：输入碎片化梦境描述，生成一个梦核场景；玩家在场景里移动，靠近发光位置会触发停电、影子、NPC 对话等事件。

## 运行

这个版本不需要安装依赖，Three.js 已经缓存在 `src/vendor`。

```bash
node server.mjs
```

如果当前环境没有全局 `node`，在 Codex 桌面环境里可以用：

```bash
/Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node server.mjs
```

然后打开：

```text
http://127.0.0.1:4173
```

## 部署到 GitHub Pages

项目已经包含 GitHub Actions 配置：`.github/workflows/pages.yml`。推送到 GitHub 的 `main` 分支后，会自动部署为 GitHub Pages。

首次部署：

1. 在 GitHub 创建一个新仓库。
2. 在本地关联远程仓库并推送：

```bash
git add .
git commit -m "Create dream walkback prototype"
git remote add origin https://github.com/YOUR_NAME/YOUR_REPO.git
git push -u origin main
```

3. 打开 GitHub 仓库的 `Settings -> Pages`。
4. 在 `Build and deployment` 里把 `Source` 选择为 `GitHub Actions`。
5. 等待 Actions 跑完后，访问：

```text
https://YOUR_NAME.github.io/YOUR_REPO/
```

## 当前能力

- 第一人称移动：`W A S D` 移动，鼠标转向，`Shift` 慢走。
- 文本生成场景：识别“医院、走廊、地铁、水、神龛、停电、鬼/影子、对白”等梦境碎片。
- 位置触发情节：靠近发光点会触发对白、停电遮罩、影子出现。
- 重放触发：点击“重放触发”可回到起点重新体验事件流程。

## 下一步

真正产品化时，可以把“碎片文本 -> 场景 JSON”的部分接到大模型，让它生成：

- 场景结构：房间、走廊、门、光源、物体。
- 触发器：位置、条件、音效、镜头、停电、NPC 出场。
- NPC 台词：根据梦的情绪和叙事生成对白。
- 可保存的梦境档案：每天记录梦，再一键回放。
