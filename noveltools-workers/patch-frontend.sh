#!/usr/bin/env bash
# Trỏ frontend NovelTools sang các Worker của BẠN.
# Chạy trong thư mục gốc của frontend (nơi có thư mục js/), ví dụ trong GitHub Codespaces:
#   bash patch-frontend.sh \
#     https://noveltools-tts.TEN.workers.dev \
#     https://noveltools-drive-auth.TEN.workers.dev \
#     https://noveltools-reviewer.TEN.workers.dev \
#     123456-abc.apps.googleusercontent.com \
#     email-admin@gmail.com
set -euo pipefail
[ "$#" -eq 5 ] || { echo "Cần 5 tham số: TTS_URL AUTH_URL REVIEWER_URL GOOGLE_CLIENT_ID ADMIN_EMAIL"; exit 1; }
TTS="${1%/}"; AUTH="${2%/}"; REV="${3%/}"; CID="$4"; MAIL="$5"
[ -f js/tts.js ] && [ -f js/backup.js ] || { echo "Hãy chạy ở thư mục gốc frontend (có js/tts.js)"; exit 1; }

# 1) TTS: thay cả danh sách 18 server bằng 1 server của bạn
sed -i '/^  const SERVERS = \[/,/^  \];/{/^  const SERVERS = \[/!{/^  \];/!d}}' js/tts.js
sed -i "/^  const SERVERS = \[/a\    { url: '$TTS/tts', type: 'auto' }," js/tts.js

# 2) Google Drive: Worker auth, OAuth client id, email admin phát thông báo cập nhật
sed -i "s#^const AUTH_WORKER_URL=.*#const AUTH_WORKER_URL='$AUTH';#" js/backup.js
sed -i "s#^const DRIVE_CLIENT_ID=.*#const DRIVE_CLIENT_ID='$CID';#" js/backup.js
sed -i "s#^const UPDATE_ADMIN_EMAILS=.*#const UPDATE_ADMIN_EMAILS=['$MAIL'];#" js/backup.js

# 3) Reviewer: chatbot + khớp review
sed -i "s#https://noveltools-reviewer\.[A-Za-z0-9.-]*workers\.dev#$REV#g" js/reviewer-chatbot.js js/blog-link.js

# 4) Tắt việc gửi phản hồi chatbot tới Apps Script của chủ cũ (để trống = tắt, chatbot vẫn chạy bình thường)
sed -i "s#^<script>window.CHATBOT_FEEDBACK_ENDPOINT = .*#<script>window.CHATBOT_FEEDBACK_ENDPOINT = '';</script>#" index.html

echo "Xong. Kiểm tra lại:"
grep -n "workers.dev\|DRIVE_CLIENT_ID=\|UPDATE_ADMIN_EMAILS=" js/tts.js js/backup.js js/reviewer-chatbot.js js/blog-link.js | cut -c1-170
grep -n "CHATBOT_FEEDBACK_ENDPOINT =" index.html | cut -c1-120
