cd "C:/Users/Ryan/.dsh/profiles/node_modules/@deepseek-ai"
# 备份旧版
mv dsh dsh.bak-0.1.0-rc.7 && echo 'backed up'
# 安装新版
cd "C:/Users/Ryan/.dsh/profiles"
npm install --no-save @deepseek-ai/dsh@0.1.1-rc.1 2>&1 | tail -5
# 验证
node -e "const d=require('C:/Users/Ryan/.dsh/profiles/node_modules/@deepseek-ai/dsh/package.json');console.log('新版本:', d.version)"