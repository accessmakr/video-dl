#!/bin/sh
set -e

if [ -n "$COOKIES_CONTENT" ]; then
    mkdir -p /cookies
    printf '%s' "$COOKIES_CONTENT" > /cookies/cookies.txt
    export COOKIE_PATH=/cookies/cookies.txt
    echo "Cookie file written."
fi

if [ -f "/cobalt/src/cobalt.js" ]; then
    cd /cobalt && exec node src/cobalt.js
elif [ -f "/app/src/cobalt.js" ]; then
    cd /app && exec node src/cobalt.js
else
    exec "$@"
fi
