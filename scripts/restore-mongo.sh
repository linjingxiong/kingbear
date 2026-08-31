#!/usr/bin/env bash
# 从 backup-mongo.sh 生成的备份文件恢复数据库。会整库覆盖（--drop：先删掉已有
# 集合再导入备份里的数据），操作前务必确认传的是想要的那份备份文件。
#
# 用法：./restore-mongo.sh /path/to/kingbear-20260831-030000.archive.gz
set -euo pipefail

CONTAINER=kingbear-git-mongo-1
FILE="${1:?用法: ./restore-mongo.sh <备份文件路径>}"

if [ ! -f "$FILE" ]; then
  echo "[restore-mongo] 找不到文件：$FILE" >&2
  exit 1
fi

echo "[restore-mongo] 即将用「$FILE」覆盖恢复数据库，会先清空现有集合。"
read -r -p "确认继续？(yes/no) " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "[restore-mongo] 已取消"
  exit 0
fi

cat "$FILE" | docker exec -i "$CONTAINER" mongorestore --gzip --archive --drop

echo "[restore-mongo] 恢复完成，来源文件：$FILE"
