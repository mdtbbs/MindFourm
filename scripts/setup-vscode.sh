#!/bin/bash

# MindFourm VSCode 开发环境快速设置脚本

set -e

echo "🚀 开始配置 MindFourm 开发环境..."

# 检查 Node.js 版本
echo "📦 检查 Node.js 版本..."
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js 版本过低，请安装 Node.js 18 或更高版本"
    exit 1
fi
echo "✅ Node.js 版本: $(node -v)"

# 安装后端依赖
echo ""
echo "📦 安装后端依赖..."
npm ci
echo "✅ 后端依赖安装完成"

# 安装前端依赖
echo ""
echo "📦 安装前端依赖..."
cd frontend
npm ci
cd ..
echo "✅ 前端依赖安装完成"

# 创建环境变量文件
if [ ! -f ".env" ]; then
    echo ""
    echo "📝 创建环境变量文件..."
    cp .env.example .env
    echo "✅ 已创建 .env 文件，请根据实际情况修改配置"
else
    echo ""
    echo "ℹ️  .env 文件已存在，跳过创建"
fi

# 检查 VSCode 是否安装了扩展
echo ""
echo "🔍 检查 VSCode 扩展..."
if command -v code &> /dev/null; then
    INSTALLED_EXTENSIONS=$(code --list-extensions)

    REQUIRED_EXTENSIONS=(
        "esbenp.prettier-vscode"
        "dbaeumer.vscode-eslint"
        "bradlc.vscode-tailwindcss"
        "usernamehw.errorlens"
    )

    for ext in "${REQUIRED_EXTENSIONS[@]}"; do
        if echo "$INSTALLED_EXTENSIONS" | grep -q "$ext"; then
            echo "  ✅ $ext"
        else
            echo "  ❌ $ext (未安装)"
        fi
    done

    echo ""
    echo "💡 提示：在 VSCode 中按 Ctrl+Shift+X，输入 @recommended 安装所有推荐扩展"
else
    echo "⚠️  未检测到 VSCode 命令行工具"
    echo "   请在 VSCode 中手动安装推荐扩展"
fi

# 构建 TypeScript 项目
echo ""
echo "🔨 构建 TypeScript 项目..."
npm run build:backend
echo "✅ 构建完成"

# 运行类型检查
echo ""
echo "🔍 运行 TypeScript 类型检查..."
npm run typecheck:frontend
echo "✅ 类型检查通过"

# 总结
echo ""
echo "🎉 开发环境配置完成！"
echo ""
echo "📚 下一步："
echo "   1. 编辑 .env 文件，配置数据库连接等参数"
echo "   2. 在 VSCode 中打开项目: code ."
echo "   3. 按 F5 启动调试，或运行 npm run dev 启动开发服务器"
echo "   4. 查看 .vscode/README.md 了解更多开发技巧"
echo ""
echo "🚀 Happy coding!"