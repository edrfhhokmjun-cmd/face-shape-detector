# regression/ —— 校准集

**这个目录里的照片永远不会被提交进 git**（见 `.gitignore`），因为真实人脸涉及肖像权。

## 放什么

```
regression/
├─ a.jpg               ← 正脸照
├─ b.jpg
├─ ...
├─ labels.json         ← 你的标注（这个会被提交，是你的工作量）
└─ results.json/.csv   ← 脚本输出（自动生成）
```

## labels.json 怎么写

照抄 `labels.example.json` 的格式：

```json
{
  "a.jpg": { "shape": "oval" },
  "b.jpg": { "shape": "square", "person": "A" },
  "c.jpg": { "shape": "oval", "borderline": true }
}
```

- `shape` —— 你信得过的正确答案（六选一）
- `borderline` —— 拿不准的边界样本，**不计入准确率分母**，单独统计告警覆盖率。
  强行给边界样本贴单一标签会让你的准确率数字失去意义。
- `person` —— 同一个人多张照片填同一个值，脚本会额外输出稳定性报告

## 照片要求

- 正面、手臂长度、表情中性、光线均匀
- **头发往后拨露出额头和太阳穴**（这是最大的误差来源）
- 目标覆盖六类，每类 3–5 张；某一类只有 1 张就无法区分"阈值不对"和"这张特殊"

## 怎么用

```powershell
.\dev.ps1 run batch                  # 跑完输出 results.json / results.csv + 指标表
.\dev.ps1 run batch -- --self-test   # 环境自检，不需要任何照片
```

详细调参流程见根目录 `CALIBRATION.md`。
