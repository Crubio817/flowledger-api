#!/bin/bash

# FlowLedger API Documentation Builder
# Builds and serves the organized documentation

echo "📚 FlowLedger API Documentation Builder"
echo "======================================"

# Check if mkdocs is installed
if ! command -v mkdocs &> /dev/null; then
    echo "⚠️  MkDocs not found. Installing..."
    pip install mkdocs mkdocs-material
fi

# Navigate to project root
cd "$(dirname "$0")/.."

echo "🏗️  Building documentation..."

# Check if we should serve or just build
if [[ "$1" == "serve" ]]; then
    echo "🌐 Starting development server at http://localhost:8000"
    mkdocs serve
elif [[ "$1" == "build" ]]; then
    echo "📦 Building static documentation..."
    mkdocs build
    echo "✅ Documentation built in ./site/"
else
    echo "Usage:"
    echo "  $0 serve  - Start development server"
    echo "  $0 build  - Build static documentation"
    echo ""
    echo "Quick start: $0 serve"
fi
