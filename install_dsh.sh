cd "C:/Users/Ryan/.dsh/profiles"
# 确认备份存在
ls node_modules/@deepseek-ai/ | grep dsh
# npm pack 下载新版 tarball
npm pack @deepseek-ai/dsh@0.1.1-rc.1 --silent 2>/dev/null | tail -1
ls *.tgz
# 解压到 dsh 目录
mkdir -p node_modules/@deepseek-ai/dsh
tar -xzf deepseek-ai-dsh-0.1.1-rc.1.tgz -C node_modules/@deepseek-ai/dsh --strip-components=1
rm -f deepseek-ai-dsh-0.1.1-rc.1.tgz
# 验证
node -e "const d=require('C:/Users/Ryan/.dsh/profiles/node_modules/@deepseek-ai/dsh/package.json');console.log('已安装版本:', d.version);console.log('bin:', d.bin ? JSON.stringify(d.bin) : 'none')"