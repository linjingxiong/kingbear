#!/usr/bin/env bash
# 数据库定时备份。之前因为 mongo 端口被扫到、数据被勒索软件清空过一次，光把端口
# 收起来还不够——万一哪天又出问题（误操作、脚本写错、磁盘坏了……），得有份独立的
# 备份能拿回来。用 mongodump 把整个库导出压缩包，存到宿主机上一个跟 docker volume
# 完全无关的目录（备份不能跟数据库本体绑在一起，容器/卷被删的话备份也要跟着没了
# 那就白备份了），并自动清理过期的旧备份，防止越攒越大把硬盘占满。
#
# 用法：
#   ./backup-mongo.sh                  手动跑一次
#   crontab 里配成每天定时跑（见 README「数据库备份」一节）
set -euo pipefail

CONTAINER=kingbear-git-mongo-1
DB_NAME=kingbear
BACKUP_DIR="${BACKUP_DIR:-$HOME/kingbear-backups}"
KEEP_DAYS=14
TS=$(date +%Y%m%d-%H%M%S)
FILE="$BACKUP_DIR/kingbear-$TS.archive.gz"

mkdir -p "$BACKUP_DIR"

# docker exec 失败时 shell 重定向仍会先建出一个空文件，失败就顺手删掉，不留垃圾文件
trap 'rm -f "$FILE"' ERR

docker exec "$CONTAINER" mongodump --db="$DB_NAME" --archive --gzip > "$FILE"

# 简单校验一下：文件太小大概率是导出失败了（比如容器没起来），报错但不动之前已有的备份
SIZE=$(stat -c%s "$FILE" 2>/dev/null || stat -f%z "$FILE" 2>/dev/null || echo 0)
if [ "$SIZE" -lt 1024 ]; then
  echo "[backup-mongo] 警告：备份文件异常小（${SIZE} 字节），可能导出失败：$FILE" >&2
  rm -f "$FILE"
  exit 1
fi

# 清理超过 KEEP_DAYS 天的旧备份，避免一直攒下去把硬盘占满
find "$BACKUP_DIR" -name 'kingbear-*.archive.gz' -mtime +"$KEEP_DAYS" -delete

echo "[backup-mongo] 备份完成：$FILE（$(du -h "$FILE" | cut -f1)）"
