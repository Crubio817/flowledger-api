#!/bin/bash

# FlowLedger API Project Cleanup Script
# This script helps maintain project organization

echo "🗂️  FlowLedger API Project Cleanup & Organization"
echo "==============================================="

# Create archive directories if they don't exist
echo "📁 Creating archive structure..."
mkdir -p archive/logs
mkdir -p archive/test-scripts
mkdir -p archive/deployments
mkdir -p archive/openapi-versions
mkdir -p archive/temp-files

# Move log files
echo "📋 Moving log files to archive..."
find . -maxdepth 2 -name "*.log" -not -path "./archive/*" -exec mv {} archive/logs/ \; 2>/dev/null || true

# Move test scripts
echo "🧪 Moving test scripts to archive..."
find . -maxdepth 1 -name "test-*.js" -exec mv {} archive/test-scripts/ \; 2>/dev/null || true

# Move deployment files
echo "🚀 Moving deployment files to archive..."
find . -maxdepth 1 -name "*.zip" -exec mv {} archive/deployments/ \; 2>/dev/null || true

# Move old OpenAPI snapshots
echo "📄 Moving old OpenAPI snapshots to archive..."
find . -name "openapi.snapshot.json.*" -exec mv {} archive/openapi-versions/ \; 2>/dev/null || true

# Move temporary files
echo "🧹 Moving temporary files to archive..."
find . -name "temp_*.sql" -exec mv {} archive/temp-files/ \; 2>/dev/null || true
find . -name "*.tmp" -exec mv {} archive/temp-files/ \; 2>/dev/null || true

# Clean up node_modules if requested
read -p "🗑️  Remove node_modules directories? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Removing node_modules directories..."
    find . -name "node_modules" -type d -exec rm -rf {} + 2>/dev/null || true
fi

# Clean up dist/build directories if requested
read -p "🏗️  Remove build/dist directories? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Removing build/dist directories..."
    find . -name "dist" -type d -exec rm -rf {} + 2>/dev/null || true
    find . -name "build" -type d -exec rm -rf {} + 2>/dev/null || true
fi

# Show archive summary
echo ""
echo "📊 Archive Summary:"
echo "=================="
echo "Logs: $(find archive/logs -type f 2>/dev/null | wc -l) files"
echo "Test Scripts: $(find archive/test-scripts -type f 2>/dev/null | wc -l) files"
echo "Deployments: $(find archive/deployments -type f 2>/dev/null | wc -l) files"
echo "OpenAPI Versions: $(find archive/openapi-versions -type f 2>/dev/null | wc -l) files"
echo "Temp Files: $(find archive/temp-files -type f 2>/dev/null | wc -l) files"

# Show current project structure
echo ""
echo "📁 Current Project Structure:"
echo "=========================="
tree -I 'node_modules|.git|archive' -L 2 . 2>/dev/null || ls -la

echo ""
echo "✅ Project cleanup complete!"
echo "📖 Check docs/README.md for navigation"
echo "🏗️  Run 'mkdocs serve' to preview documentation"
