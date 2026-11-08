#!/usr/bin/env bash
# build-pdf.sh — สร้าง an22-user-manual.pdf จาก manual.html ด้วย Chrome headless (ตัดคำ / วรรณยุกต์ไทยถูกต้อง)
# ต้องมี google-chrome และฟอนต์ Noto Sans Thai ในเครื่อง
set -euo pipefail
dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
chrome=${CHROME:-google-chrome}
"$chrome" --headless=new --disable-gpu --no-pdf-header-footer --allow-file-access-from-files \
  --virtual-time-budget=10000 --print-to-pdf="$dir/an22-user-manual.pdf" "file://$dir/manual.html" 2>/dev/null
ls -lh "$dir/an22-user-manual.pdf"
