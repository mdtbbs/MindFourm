#!/bin/bash

# MindFourm VSCode 配置验证脚本

echo "🔍 MindFourm VSCode 配置验证"
echo "================================"
echo ""

# 检查 VSCode 配置文件
echo "📁 检查 VSCode 配置文件..."

CONFIG_FILES=(
    ".vscode/settings.json"
    ".vscode/launch.json"
    ".vscode/tasks.json"
    ".vscode/extensions.json"
    ".vscode/typescript.code-snippets"
)

for file in "${CONFIG_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "  ✅ $file"
    else
        echo "  ❌ $file (缺失)"
    fi
done

# 检查项目配置文件
echo ""
echo "📝 检查项目配置文件..."

PROJECT_CONFIGS=(
    ".editorconfig"
    ".prettierrc.json"
    ".prettierignore"
    ".nvmrc"
    "volta.json"
    "MindFourm.code-workspace"
)

for config in "${PROJECT_CONFIGS[@]}"; do
    if [ -f "$config" ]; then
        echo "  ✅ $config"
    else
        echo "  ❌ $config (缺失)"
    fi
done

# 检查文档
echo ""
echo "📚 检查文档文件..."

DOCS=(
    ".vscode/README.md"
    ".vscode/CHEATSHEET.md"
    ".vscode/SETUP_SUMMARY.md"
    "tests/api.http"
    "scripts/setup-vscode.sh"
)

for doc in "${DOCS[@]}"; do
    if [ -f "$doc" ]; then
        echo "  ✅ $doc"
    else
        echo "  ❌ $doc (缺失)"
    fi
done

# 检查 Node.js 版本
echo ""
echo "📦 检查 Node.js 版本..."

NODE_VERSION=$(node -v 2>/dev/null)
if [ $? -eq 0 ]; then
    NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_MAJOR" -ge 18 ]; then
        echo "  ✅ Node.js $NODE_VERSION"
    else
        echo "  ⚠️  Node.js $NODE_VERSION (建议使用 18+)"
    fi
else
    echo "  ❌ Node.js 未安装"
fi

# 检查依赖
echo ""
echo "📦 检查依赖安装状态..."

if [ -d "node_modules" ]; then
    echo "  ✅ 后端依赖已安装"
else
    echo "  ❌ 后端依赖未安装"
fi

if [ -d "frontend/node_modules" ]; then
    echo "  ✅ 前端依赖已安装"
else
    echo "  ❌ 前端依赖未安装"
fi

# 检查环境变量
echo ""
echo "🔐 检查环境变量..."

if [ -f ".env" ]; then
    echo "  ✅ .env 文件存在"

    # 检查关键环境变量
    if grep -q "DATABASE_HOST" .env; then
        echo "  ✅ DATABASE_HOST 已配置"
    else
        echo "  ⚠️  DATABASE_HOST 未配置"
    fi

    if grep -q "REDIS_HOST" .env; then
        echo "  ✅ REDIS_HOST 已配置"
    else
        echo "  ⚠️  REDIS_HOST 未配置"
    fi
else
    echo "  ❌ .env 文件不存在"
    echo "     💡 运行: cp .env.example .env"
fi

# 检查 VSCode 扩展
echo ""
echo "🔌 检查 VSCode 扩展..."

if command -v code &> /dev/null; then
    INSTALLED=$(code --list-extensions)

    REQUIRED=(
        "esbenp.prettier-vscode"
        "dbaeumer.vscode-eslint"
        "bradlc.vscode-tailwindcss"
        "usernamehw.errorlens"
    )

    for ext in "${REQUIRED[@]}"; do
        if echo "$INSTALLED" | grep -qi "$ext"; then
            echo "  ✅ $ext"
        else
            echo "  ⚠️  $ext (未安装)"
        fi
    done

    echo ""
    echo "💡 提示: 在 VSCode 中输入 @recommended 安装所有推荐扩展"
else
    echo "  ⚠️  未检测到 VSCode CLI"
    echo "     请在 VSCode 中手动安装扩展"
fi

# 总结
echo ""
echo "================================"
echo "🎉 验证完成！"
echo ""
echo "📚 下一步："
echo "   1. 查看 .vscode/README.md 了解配置详情"
echo "   2. 查看 .vscode/CHEATSHEET.md 了解常用命令"
echo "   3. 运行 bash scripts/setup-vscode.sh 完成环境设置"
echo "   4. 按 F5 启动调试"
echo ""