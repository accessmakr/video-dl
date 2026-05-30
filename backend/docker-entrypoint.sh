#!/bin/sh
set -e

if [ -n "$COOKIES_CONTENT" ]; then
    mkdir -p /cookies
    printf '%s' "$COOKIES_CONTENT" > /cookies/cookies.txt
    export COOKIE_PATH=/cookies/cookies.txt
    echo "Cookie file written."
fi

cd /cobalt
exec node src/cobalt.js
